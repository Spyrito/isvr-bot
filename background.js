// Background: drží stav běhů (přežije postback i znovunačtení stránky), rozbaluje „pouzij“,
// dosazuje proměnné, posílá kroky přehrávači v horním rámci, zapisuje výstup, spravuje menu a nahrávání.
import { PRIKAZY } from './lib/dsl.js';
import { rozbal, nazevBehu, nazevScenare, seznamScenaru, prectiNastaveni, jeUsek, NASTAVENI } from './lib/soubory.js';
import { Data, dosad, vyhodnot, ziskejEntitu, sledovaneKlice } from './lib/promenne.js';
import { entity } from './generatory/index.js';
import { casProCsv } from './lib/csv.js';
import * as U from './lib/uloziste.js';

const spi = (ms) => new Promise((r) => setTimeout(r, ms));
const EDITOR = 'ui/editor.html';
const MAX_HISTORIE = 2000;
const SKRIPTY_OBSAHU = ['lib/selektor.js', 'content/najdi.js', 'content/prehravac.js', 'content/nahravac.js', 'content/panel.js', 'content.js'];

// ---------- stav záložek ----------
// tab:<id> v chrome.storage.session: { zasobnik: [beh…], vysledek, nahravani, panel }
// zasobnik: dole hlavní běh, nahoře úsek spuštěný během „rucne“ pauzy
// Ukládá se jako JSON text: chrome.storage by klíče objektů seřadil a sloupce výstupu by se přeházely.

const stavy = new Map();
let nacitani = null;

function nactiStavy() {
  nacitani ||= chrome.storage.session.get(null).then((vse) => {
    for (const [k, v] of Object.entries(vse)) if (k.startsWith('tab:')) stavy.set(Number(k.slice(4)), typeof v === 'string' ? JSON.parse(v) : v);
  });
  return nacitani;
}

async function stav(tabId) {
  await nactiStavy();
  if (!stavy.has(tabId)) stavy.set(tabId, { zasobnik: [], vysledek: null, nahravani: null, panel: false });
  return stavy.get(tabId);
}

async function uloz(tabId) {
  const s = stavy.get(tabId);
  if (s) await chrome.storage.session.set({ ['tab:' + tabId]: JSON.stringify(s) });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await nactiStavy();
  stavy.delete(tabId);
  navigace.delete(tabId);
  chrome.storage.session.remove('tab:' + tabId);
});

// ---------- cache seznamu scénářů a nastavení (ze zrcadla v storage.local) ----------

let soubory = {};
let nastaveni = prectiNastaveni('');
let scenare = [];

async function nactiZrcadlo() {
  soubory = (await chrome.storage.local.get('soubory')).soubory || {};
  nastaveni = prectiNastaveni(soubory[NASTAVENI]);
  scenare = seznamScenaru(soubory);
}
const zrcadloNacteno = nactiZrcadlo();

chrome.storage.onChanged.addListener(async (zmeny, oblast) => {
  if (oblast !== 'local') return;
  if (zmeny.soubory) {
    await nactiZrcadlo();
    obnovMenu();
    rozesliVsem();
  } else if (zmeny.oblibene) {
    rozesliVsem();
  }
});

// ---------- sledování navigace ----------
// Po každé akci se čeká, jestli se některý rámec nezačal načítat, aby další krok nesahal do staré stránky.

const navigace = new Map(); // tabId → Map(frameId → čas začátku)

function nav(tabId) {
  if (!navigace.has(tabId)) navigace.set(tabId, new Map());
  return navigace.get(tabId);
}

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  const n = nav(d.tabId);
  if (d.frameId === 0) n.clear();
  n.set(d.frameId, Date.now());
});
const konecNavigace = (d) => {
  const n = navigace.get(d.tabId);
  if (n) n.delete(d.frameId);
};
chrome.webNavigation.onCompleted.addListener(konecNavigace);
chrome.webNavigation.onErrorOccurred.addListener(konecNavigace);

async function cekejNaKlid(tabId, prodleva = 300) {
  await spi(prodleva);
  const konec = Date.now() + 60000;
  while (Date.now() < konec) {
    const n = navigace.get(tabId);
    const bezi = n ? [...n.values()].some((t) => Date.now() - t < 30000) : false;
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Error('záložka byla zavřena');
    }
    if (!bezi && tab.status === 'complete') break;
    await spi(100);
  }
  await zajistiSkript(tabId);
}

// Po akci: počká na doběhnutí AJAXu (Wicket) a zkontroluje, jestli aplikace nehlásí chybu.
// Když se stránka mezitím znovu načítá, počká na klid a zkusí to znovu.
async function cekejNaAjax(tabId, beh) {
  for (let pokus = 0; pokus < 3; pokus++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { typ: 'klid', timeout: Math.max(beh.nast.timeout, 15000), chyba: beh.nast.chyba || '' }, { frameId: 0 });
      if (r) return r;
    } catch {
      /* stránka se načítá */
    }
    await cekejNaKlid(tabId, 200);
  }
  return { ok: true };
}

function nedoruceno(e) {
  return /Receiving end does not exist|Could not establish connection/i.test(String(e && e.message));
}

// Ověří, že v horním rámci běží content script; když ne (záložka otevřená před instalací), vloží ho.
async function zajistiSkript(tabId) {
  for (let pokus = 0; pokus < 30; pokus++) {
    try {
      await chrome.tabs.sendMessage(tabId, { typ: 'ping' }, { frameId: 0 });
      return;
    } catch (e) {
      if (!nedoruceno(e)) return;
    }
    if (pokus === 3) {
      try {
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['page-dialogs.js'], world: 'MAIN', injectImmediately: true });
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: SKRIPTY_OBSAHU });
      } catch (e) {
        throw new Error('na této stránce Klikač nemůže běžet (' + e.message + ')');
      }
    }
    await spi(200);
  }
  throw new Error('stránka neodpovídá');
}

// ---------- běh ----------

const bezi = new Set(); // záložky, na kterých právě běží smyčka
const dataBehu = new Map(); // id běhu → Data (seznamy z data/*.txt)
let udrzovani = null;

// Service worker by bez událostí po 30 s usnul; během běhu ho udržujeme vzhůru.
function hlidejZivot() {
  if (udrzovani) return;
  udrzovani = setInterval(() => {
    if (!bezi.size) {
      clearInterval(udrzovani);
      udrzovani = null;
    } else chrome.runtime.getPlatformInfo();
  }, 20000);
}

function horni(st) {
  return st.zasobnik[st.zasobnik.length - 1] || null;
}

async function posledniHodnoty() {
  const { historie = [] } = await chrome.storage.local.get('historie');
  const out = {};
  for (const h of historie) {
    if (h.vysledek !== 'OK') continue;
    for (const [k, v] of Object.entries(h.hodnoty || {})) if (!(k in out) && v !== '') out[k] = v;
  }
  return out;
}

async function vytvorBeh(tabId, soubor, vse, volby) {
  const r = rozbal(soubor, vse);
  if (r.chyby.length) return { chyby: r.chyby };
  const nast = prectiNastaveni(vse[NASTAVENI]);
  let pc = 0;
  if (volby.odRadku) {
    pc = r.kroky.findIndex((k) => k.rozsah === 0 && k.radek >= volby.odRadku);
    if (pc < 0) return { chyby: [{ soubor, radek: volby.odRadku, zprava: 'od tohoto řádku už ve scénáři není žádný krok' }] };
  }
  const beh = {
    id: crypto.randomUUID(),
    soubor,
    nazev: nazevBehu(soubor),
    kroky: r.kroky,
    rozsahy: r.rozsahy,
    pc,
    stav: 'bezi',
    krokovat: !!volby.krokovat,
    krokovatOdZacatku: !!volby.krokovat,
    pocet: volby.pocet || 1,
    iterace: volby.iterace || 1,
    nast: { pauza: nast.pauza, timeout: nast.timeout, dialogy: nast.dialogy, adresa: nast.adresa, chyba: nast.chyba || '', zakazane: nast.zakazane || '' },
    promenne: {},
    globalni: {},
    hodnoty: {},
    pocitadla: {},
    prefixy: [],
    posledni: await posledniHodnoty(),
    korenJeUsek: jeUsek(soubor),
    dialogyText: [],
    zacatek: Date.now(),
  };
  dataBehu.set(beh.id, new Data(vse));
  return { beh };
}

async function dataPro(beh) {
  if (!dataBehu.has(beh.id)) dataBehu.set(beh.id, new Data((await U.nactiVse()).soubory));
  return dataBehu.get(beh.id);
}

function popisChyb(chyby) {
  return chyby.slice(0, 5).map((c) => `${c.soubor}:${c.radek} – ${c.zprava}`).join('\n') + (chyby.length > 5 ? `\n… a dalších ${chyby.length - 5}` : '');
}

// Spustí scénář na záložce. Během „rucne“ pauzy se úsek vloží nad pozastavený běh.
async function spust(tabId, { soubor, pocet = 1, krokovat = false, odRadku = null }) {
  const st = await stav(tabId);
  if (st.nahravani) return { ok: false, chyba: 'Na této záložce se nahrává. Nahrávání nejdřív ukonči.' };
  const nahore = horni(st);
  let rodic = null;
  if (nahore) {
    if (nahore.stav === 'rucne') rodic = nahore;
    else return { ok: false, chyba: `Na záložce běží „${nahore.nazev}“. Nejdřív ho zastav.` };
  }
  const { soubory: vse } = await U.nactiVse();
  const { beh, chyby } = await vytvorBeh(tabId, soubor, vse, { pocet, krokovat, odRadku });
  if (chyby) {
    const zprava = popisChyb(chyby);
    st.vysledek = { nazev: nazevBehu(soubor), vysledek: 'chyba ve scénáři', zprava, hodnoty: {}, cas: casProCsv() };
    await uloz(tabId);
    rozesliStav(tabId);
    return { ok: false, chyba: zprava, chyby };
  }
  if (rodic) {
    beh.vnoreny = true;
    beh.pocitadla = { ...rodic.pocitadla };
    beh.prefixy = [...rodic.prefixy];
    beh.globalni = rodic.globalni; // úsek vidí firmu zakládanou v hlavním běhu
    beh.promenne = { ...rodic.promenne };
  }
  st.zasobnik.push(beh);
  st.vysledek = null;
  if (jeUsek(soubor)) await chrome.storage.local.set({ posledniUsek: { soubor, pocet } });
  await uloz(tabId);
  rozesliStav(tabId);
  smycka(tabId);
  return { ok: true };
}

async function smycka(tabId) {
  if (bezi.has(tabId)) return;
  bezi.add(tabId);
  hlidejZivot();
  try {
    for (;;) {
      const st = await stav(tabId);
      const beh = horni(st);
      if (!beh || beh.stav !== 'bezi') break;
      if (beh.pc >= beh.kroky.length) {
        await dokonci(tabId, 'OK');
        continue;
      }
      const krok = beh.kroky[beh.pc];
      if (beh.krokovat && !beh.povolenKrok) {
        beh.stav = 'krokovani';
        await uloz(tabId);
        rozesliStav(tabId);
        if (krok.sel) zvyrazni(tabId, beh, krok, 'info');
        break;
      }
      beh.povolenKrok = false;

      if (krok.prikaz === 'rucne') {
        const data = await dataPro(beh);
        const D = (t) => dosad(t, (v) => vyhodnot(v, beh, beh.rozsahy[krok.rozsah], data));
        beh.pc++;
        beh.stav = 'rucne';
        try {
          beh.pokyn = D(krok.pokyn);
          beh.dokud = krok.dokud ? D(krok.dokud) : null;
        } catch (e) {
          beh.pokyn = krok.pokyn;
          beh.dokud = null;
        }
        await uloz(tabId);
        rozesliStav(tabId);
        break;
      }

      beh.vKroku = true;
      await uloz(tabId);
      rozesliStav(tabId);
      let v;
      try {
        v = await provedKrok(tabId, beh, krok);
      } catch (e) {
        v = { ok: false, chyba: e.message || String(e) };
      }
      beh.vKroku = false;
      if (horni(st) !== beh || beh.stav !== 'bezi') {
        // mezitím někdo běh zastavil nebo pozastavil
        await uloz(tabId);
        continue;
      }
      if (!v.ok) {
        beh.stav = 'chyba';
        beh.chyba = { zprava: v.chyba, soubor: krok.soubor, radek: krok.radek, text: krok.text };
        await uloz(tabId);
        rozesliStav(tabId);
        if (krok.sel) zvyrazni(tabId, beh, krok, 'chyba');
        break;
      }
      beh.pc++;
      await uloz(tabId);
      const def = PRIKAZY[krok.prikaz];
      if (def.akce || krok.prikaz === 'cekej-na' || krok.prikaz === 'zmiz' || krok.prikaz === 'otevri') {
        await cekejPauzu(beh, beh.nast.pauza);
      }
    }
  } finally {
    bezi.delete(tabId);
  }
}

// Pauza, kterou jde přerušit tlačítkem Stop.
async function cekejPauzu(beh, ms) {
  const konec = Date.now() + ms;
  while (Date.now() < konec && beh.stav === 'bezi') await spi(Math.min(100, konec - Date.now()));
}

async function zvyrazni(tabId, beh, krok, barva) {
  try {
    const data = await dataPro(beh);
    const sel = dosad(krok.sel, (v) => vyhodnot(v, beh, beh.rozsahy[krok.rozsah], data));
    await chrome.tabs.sendMessage(tabId, { typ: 'zvyrazni', sel, barva, trvale: true }, { frameId: 0 });
  } catch {
    /* zvýraznění je jen pomůcka */
  }
}

async function domKrok(tabId, krok) {
  const akce = !!PRIKAZY[krok.prikaz]?.akce;
  for (let pokus = 0; pokus < 4; pokus++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { typ: 'krok', krok }, { frameId: 0 });
      if (r) return r;
      if (akce) return { ok: true };
    } catch (e) {
      // Akce proběhla a stránka se během ní začala znovu načítat → krok je hotový, neopakovat.
      if (!nedoruceno(e) && akce) return { ok: true };
      if (pokus === 3) return { ok: false, chyba: 'stránka neodpovídá: ' + e.message };
    }
    await cekejNaKlid(tabId, 200);
  }
  return { ok: false, chyba: 'stránka neodpovídá' };
}

async function provedKrok(tabId, beh, krok) {
  const rozsah = beh.rozsahy[krok.rozsah];
  const data = await dataPro(beh);
  const D = (t) => (t == null ? t : dosad(t, (v) => vyhodnot(v, beh, rozsah, data)));
  const ok = { ok: true };
  switch (krok.prikaz) {
    case 'nastav':
      beh.promenne[krok.nazev] = D(krok.hodnota);
      return ok;
    case 'nova':
      if (!entity[krok.entita]) return { ok: false, chyba: `nova: neznámý generátor „${krok.entita}“ (znám: ${Object.keys(entity).join(', ')})` };
      try {
        const volby = { pohlavi: krok.pohlavi };
        for (const [k, v] of Object.entries(krok.volby || {})) volby[k] = D(v);
        ziskejEntitu(beh, rozsah, data, krok.entita, krok.instance || '', { nova: true, volby });
      } catch (e) {
        return { ok: false, chyba: 'nova: ' + e.message };
      }
      return ok;
    case 'pauza':
      beh.nast.pauza = krok.cislo;
      return ok;
    case 'timeout':
      beh.nast.timeout = krok.cislo;
      return ok;
    case 'dialogy':
      beh.nast.dialogy = krok.ano ? 'ano' : 'ne';
      rozesliStav(tabId);
      return ok;
    case 'cekej':
      await cekejPauzu(beh, krok.cislo);
      return ok;
    case 'stop':
      beh.krokovat = true;
      return ok;
    case 'otevri': {
      const cil = D(krok.hodnota);
      let url;
      try {
        url = new URL(cil, beh.nast.adresa || undefined).href;
      } catch {
        return { ok: false, chyba: `otevri: neplatná adresa „${cil}“` + (beh.nast.adresa ? '' : ' (relativní adresa potřebuje „adresa =“ v nastaveni.txt)') };
      }
      await chrome.tabs.update(tabId, { url });
      await cekejNaKlid(tabId, 500);
      return ok;
    }
    case 'zapamatuj': {
      let hodnota;
      if (krok.sel) {
        const r = await domKrok(tabId, { prikaz: 'zapamatuj', sel: D(krok.sel), regex: krok.regex, timeout: beh.nast.timeout });
        if (!r.ok) return r;
        hodnota = r.hodnota;
      } else {
        hodnota = D(krok.hodnota);
      }
      beh.hodnoty[krok.nazev] = hodnota;
      beh.promenne[krok.nazev] = hodnota;
      return ok;
    }
    default: {
      const akce = !!PRIKAZY[krok.prikaz].akce;
      const zakazane = String(beh.nast.zakazane || '').split('|').map((s) => s.trim()).filter(Boolean);
      const k = { prikaz: krok.prikaz, sel: D(krok.sel), hodnota: D(krok.hodnota), timeout: beh.nast.timeout, akce, zakazane };
      const r = await domKrok(tabId, k);
      if (!r.ok) return r;
      if (krok.prikaz === 'vypln' || krok.prikaz === 'pis') {
        for (const klic of sledovaneKlice(krok.hodnota)) beh.hodnoty[klic] = k.hodnota;
      }
      if (akce) {
        await cekejNaKlid(tabId);
        const kl = await cekejNaAjax(tabId, beh);
        if (!kl.ok) return kl;
      }
      return r;
    }
  }
}

async function pridejDoHistorie(zaznam) {
  const { historie = [] } = await chrome.storage.local.get('historie');
  historie.unshift(zaznam);
  if (historie.length > MAX_HISTORIE) historie.length = MAX_HISTORIE;
  await chrome.storage.local.set({ historie });
}

function textVysledku(beh) {
  if (!beh.chyba) return 'chyba';
  if (beh.chyba.soubor === beh.soubor) return `chyba ř. ${beh.chyba.radek}`;
  return `chyba ${nazevScenare(beh.chyba.soubor)}:${beh.chyba.radek}`;
}

// Ukončí horní běh: zapíše výstup a historii, případně spustí další opakování.
async function dokonci(tabId, vysledek) {
  const st = await stav(tabId);
  const beh = st.zasobnik.pop();
  if (!beh) return;
  beh.stav = 'hotovo';
  dataBehu.delete(beh.id);
  if (beh.dialogyText.length) beh.hodnoty.dialogy = beh.dialogyText.join(' | ');
  if (beh.chyba && vysledek !== 'OK') beh.hodnoty.chyba = beh.chyba.zprava;
  const cas = casProCsv();
  if (beh.vnoreny) {
    // úsek spuštěný během ruční pauzy: hodnoty patří k hlavnímu běhu, ten zůstává v pauze
    const rodic = horni(st);
    if (rodic) {
      // dialogy a chyba úseku se k hlavnímu běhu nepřenášejí jako hodnoty
      for (const [k, v] of Object.entries(beh.hodnoty)) if (k !== 'dialogy' && k !== 'chyba') rodic.hodnoty[k] = v;
      rodic.pocitadla = beh.pocitadla;
      rodic.prefixy = beh.prefixy;
      rodic.globalni = beh.globalni; // firma vygenerovaná až v úseku patří i hlavnímu běhu
      rodic.dialogyText.push(...beh.dialogyText);
      rodic.posledniUsek = { nazev: beh.nazev, vysledek, cas };
    }
  } else {
    const zaznam = { cas, scenar: beh.nazev, vysledek, hodnoty: beh.hodnoty };
    await U.pridejVystup(zaznam);
    await pridejDoHistorie({ ...zaznam, poradi: Object.keys(beh.hodnoty), ts: Date.now(), soubor: beh.soubor });
    st.vysledek = { nazev: beh.nazev, vysledek, hodnoty: beh.hodnoty, cas, iterace: beh.iterace, pocet: beh.pocet };
    if (vysledek === 'OK' && beh.iterace < beh.pocet) {
      const { soubory: vse } = await U.nactiVse();
      const r = await vytvorBeh(tabId, beh.soubor, vse, { pocet: beh.pocet, krokovat: beh.krokovatOdZacatku, iterace: beh.iterace + 1 });
      if (r.beh) st.zasobnik.push(r.beh);
      else st.vysledek = { ...st.vysledek, vysledek: 'chyba ve scénáři', zprava: popisChyb(r.chyby) };
    }
  }
  await uloz(tabId);
  rozesliStav(tabId);
}

async function ovladani(tabId, akce, podminka = {}) {
  const st = await stav(tabId);
  const beh = horni(st);
  // hlídání „dokud“ nesmí pustit běh, který se mezitím posunul jinam
  if (beh && podminka.jenVeStavu && beh.stav !== podminka.jenVeStavu) return { ok: false };
  if (beh && podminka.behId && beh.id !== podminka.behId) return { ok: false };
  if (akce === 'zavrit') {
    st.vysledek = null;
    st.panel = false;
    await uloz(tabId);
    rozesliStav(tabId);
    return { ok: true };
  }
  if (akce === 'panel') {
    st.panel = !st.panel;
    await uloz(tabId);
    rozesliStav(tabId);
    return { ok: true, panel: st.panel };
  }
  if (!beh) return { ok: false, chyba: 'na záložce nic neběží' };
  switch (akce) {
    case 'stop': {
      const byl = beh.stav;
      beh.stav = 'zastaveno';
      chrome.tabs.sendMessage(tabId, { typ: 'zrus' }, { frameId: 0 }).catch(() => {});
      await dokonci(tabId, byl === 'chyba' ? textVysledku(beh) : 'zastaveno');
      break;
    }
    case 'pokracuj':
      if (!['rucne', 'krokovani', 'chyba'].includes(beh.stav)) return { ok: false };
      if (beh.stav === 'krokovani') beh.krokovat = false;
      beh.stav = 'bezi';
      beh.pokyn = beh.dokud = beh.chyba = null;
      break;
    case 'dalsi':
      if (beh.stav !== 'krokovani') return { ok: false };
      beh.povolenKrok = true;
      beh.stav = 'bezi';
      break;
    case 'krokovat':
      beh.krokovat = true;
      break;
    case 'znovu':
      if (beh.stav !== 'chyba') return { ok: false };
      beh.stav = 'bezi';
      beh.chyba = null;
      break;
    case 'preskoc':
      if (beh.stav !== 'chyba') return { ok: false };
      beh.pc++;
      beh.stav = 'bezi';
      beh.chyba = null;
      break;
    default:
      return { ok: false, chyba: 'neznámá akce ' + akce };
  }
  await uloz(tabId);
  rozesliStav(tabId);
  smycka(tabId);
  return { ok: true };
}

// Po probuzení service workeru dokončí běhy, které byly uprostřed.
async function obnovBehy() {
  await nactiStavy();
  for (const [tabId, st] of stavy) {
    const beh = horni(st);
    if (!beh || beh.stav !== 'bezi') continue;
    try {
      await chrome.tabs.get(tabId);
    } catch {
      continue;
    }
    // Akce, která byla rozdělaná, se neopakuje (mohla vyvolat postback); čekání se zopakuje.
    if (beh.vKroku && PRIKAZY[beh.kroky[beh.pc]?.prikaz]?.akce) beh.pc++;
    beh.vKroku = false;
    smycka(tabId);
  }
}

// ---------- pohled pro panel a popup ----------

async function panelUseky() {
  const { oblibene = [] } = await chrome.storage.local.get('oblibene');
  const useky = scenare.filter((s) => s.usek);
  const vybrane = oblibene.length ? useky.filter((u) => oblibene.includes(u.cesta)) : useky.slice(0, 12);
  return vybrane.map(({ cesta, nazev, popis }) => ({ cesta, nazev, popis }));
}

function radekNahravky(k) {
  const h = k.hodnota;
  let hodnota = '';
  if (h !== undefined) {
    let t = String(h).replace(/\{/g, '\\{');
    if (/^\s|\s$|^"/.test(t)) t = `"${t}"`;
    hodnota = ' = ' + t;
  }
  return `${k.prikaz.padEnd(9)} ${k.sel || ''}${hodnota}`.trimEnd();
}

async function pohled(tabId) {
  await zrcadloNacteno;
  const st = await stav(tabId);
  const beh = horni(st);
  let krok = null;
  if (beh) krok = beh.stav === 'rucne' ? beh.kroky[beh.pc - 1] : beh.kroky[Math.min(beh.pc, beh.kroky.length - 1)];
  return {
    beh: beh && {
      id: beh.id,
      stav: beh.stav,
      nazev: beh.nazev,
      pc: beh.pc,
      celkem: beh.kroky.length,
      iterace: beh.iterace,
      pocet: beh.pocet,
      vnoreny: !!beh.vnoreny,
      rodic: st.zasobnik.length > 1 ? st.zasobnik[st.zasobnik.length - 2].nazev : null,
      krok: krok && { soubor: krok.soubor, radek: krok.radek, text: krok.text },
      chyba: beh.chyba,
      pokyn: beh.pokyn,
      dokud: beh.stav === 'rucne' ? beh.dokud : null,
      hodnoty: beh.hodnoty,
      posledniUsek: beh.posledniUsek || null,
    },
    vysledek: st.vysledek,
    nahravani: st.nahravani && {
      pocet: st.nahravani.kroky.length,
      posledni: st.nahravani.kroky.slice(-4).map((k) => k.radek || radekNahravky(k)),
    },
    useky: await panelUseky(),
    adresa: nastaveni.adresa,
    panel: !!st.panel,
    dialogy: beh && beh.stav === 'bezi' ? beh.nast.dialogy : null,
  };
}

async function rozesliStav(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, { typ: 'stav', pohled: await pohled(tabId) }).catch(() => {});
  } catch {
    /* záložka mezitím zmizela */
  }
  chrome.runtime.sendMessage({ typ: 'zmena-stavu', tabId }).catch(() => {});
}

async function rozesliVsem() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] });
  for (const t of tabs) rozesliStav(t.id);
}

// ---------- nahrávání ----------

async function nahravani(tabId, zprava) {
  const st = await stav(tabId);
  switch (zprava.akce) {
    case 'start': {
      if (horni(st)) return { ok: false, chyba: 'Na záložce běží scénář. Nejdřív ho zastav.' };
      const tab = await chrome.tabs.get(tabId);
      st.nahravani = { kroky: [], startUrl: tab.url, zacatek: Date.now() };
      st.vysledek = null;
      await zajistiSkript(tabId).catch(() => {});
      break;
    }
    case 'krok': {
      if (!st.nahravani) return { ok: false };
      const k = zprava.krok;
      const kroky = st.nahravani.kroky;
      const posl = kroky[kroky.length - 1];
      // opakované změny jednoho pole = jeden řádek
      if (posl && posl.sel === k.sel && ['vypln', 'vyber', 'zaskrtni', 'odskrtni'].includes(k.prikaz) && ['vypln', 'vyber', 'zaskrtni', 'odskrtni'].includes(posl.prikaz)) {
        kroky[kroky.length - 1] = k;
      } else kroky.push(k);
      break;
    }
    case 'pridej':
      if (!st.nahravani) return { ok: false };
      st.nahravani.kroky.push({ radek: zprava.radek });
      break;
    case 'zpet':
      if (st.nahravani) st.nahravani.kroky.pop();
      break;
    case 'zrus':
      st.nahravani = null;
      break;
    case 'konec': {
      if (!st.nahravani) return { ok: false };
      const slozka = zprava.slozka === 'zalozeni' ? 'zalozeni' : 'useky';
      const nazev = String(zprava.nazev || '').trim().replace(/[\\:*?"<>|]/g, '').replace(/\.txt$/i, '') || 'Nahravka';
      const radky = [`# popis: ${zprava.popis || 'nahráno ' + casProCsv()}`, `# nahráno ${casProCsv()}`];
      if (slozka === 'zalozeni') radky.push(`otevri    ${st.nahravani.startUrl}`);
      for (const k of st.nahravani.kroky) radky.push(k.radek || radekNahravky(k));
      const { soubory: vse } = await U.nactiVse();
      let cesta = `${slozka}/${nazev}.txt`;
      for (let i = 2; vse[cesta] != null; i++) cesta = `${slozka}/${nazev} (${i}).txt`;
      try {
        await U.zapis(cesta, radky.join('\r\n') + '\r\n');
      } catch (e) {
        return { ok: false, chyba: e.message };
      }
      st.nahravani = null;
      await uloz(tabId);
      rozesliStav(tabId);
      await otevriEditor({ soubor: cesta, nahrady: true });
      return { ok: true, cesta };
    }
  }
  await uloz(tabId);
  rozesliStav(tabId);
  return { ok: true };
}

// ---------- editor ----------

async function otevriEditor(parametry = {}) {
  const base = chrome.runtime.getURL(EDITOR);
  const [tab] = await chrome.tabs.query({ url: base + '*' });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    if (parametry.soubor) chrome.runtime.sendMessage({ typ: 'editor-otevri', ...parametry }).catch(() => {});
    return;
  }
  const q = new URLSearchParams();
  if (parametry.soubor) q.set('soubor', parametry.soubor);
  if (parametry.nahrady) q.set('nahrady', '1');
  await chrome.tabs.create({ url: base + (q.toString() ? '?' + q : '') });
}

// Poslední záložka s webovou stránkou – na ní editor spouští scénáře a zkouší selektory.
function jeWeb(url) {
  return /^(https?|file):/i.test(url || '');
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const t = await chrome.tabs.get(tabId);
    if (jeWeb(t.url)) chrome.storage.session.set({ posledniTab: tabId });
  } catch {
    /* záložka zmizela */
  }
});

async function cilovaZalozka() {
  const { posledniTab } = await chrome.storage.session.get('posledniTab');
  if (posledniTab != null) {
    try {
      const t = await chrome.tabs.get(posledniTab);
      if (jeWeb(t.url)) return t;
    } catch {
      /* zavřená */
    }
  }
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] });
  return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
}

// ---------- kontextové menu a klávesová zkratka ----------

let podpisMenu = null;

async function obnovMenu() {
  await zrcadloNacteno;
  const useky = scenare.filter((s) => s.usek);
  const podpis = JSON.stringify(useky.map((u) => [u.cesta, u.popis]));
  if (podpis === podpisMenu) return;
  podpisMenu = podpis;
  await chrome.contextMenus.removeAll();
  const esc = (s) => s.replace(/&/g, '&&');
  chrome.contextMenus.create({ id: 'klikac', title: 'Klikač', contexts: ['all'] });
  const slozky = new Set();
  for (const u of useky) {
    const casti = u.cesta.replace(/^useky\//, '').replace(/\.txt$/i, '').split('/');
    let rodic = 'klikac';
    for (let i = 0; i < casti.length - 1; i++) {
      const id = 'slozka:' + casti.slice(0, i + 1).join('/');
      if (!slozky.has(id)) {
        slozky.add(id);
        chrome.contextMenus.create({ id, parentId: rodic, title: esc(casti[i]), contexts: ['all'] });
      }
      rodic = id;
    }
    const jm = casti[casti.length - 1];
    chrome.contextMenus.create({ id: 'usek:' + u.cesta, parentId: rodic, title: esc(u.popis ? `${jm} – ${u.popis}` : jm), contexts: ['all'] });
  }
  if (!useky.length) chrome.contextMenus.create({ id: 'zadne', parentId: 'klikac', title: '(žádné úseky ve složce useky/)', enabled: false, contexts: ['all'] });
  chrome.contextMenus.create({ id: 'odd', parentId: 'klikac', type: 'separator', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'zopakovat', parentId: 'klikac', title: 'Zopakovat poslední úsek', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'panel', parentId: 'klikac', title: 'Zobrazit/skrýt panel', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'editor', parentId: 'klikac', title: 'Otevřít editor', contexts: ['all'] });
}

async function spustAOznam(tabId, volby) {
  const r = await spust(tabId, volby);
  if (!r.ok && !r.chyby) {
    const st = await stav(tabId);
    st.vysledek = { nazev: nazevBehu(volby.soubor), vysledek: 'nespuštěno', zprava: r.chyba, hodnoty: {}, cas: casProCsv() };
    await uloz(tabId);
    rozesliStav(tabId);
  }
  return r;
}

async function zopakujUsek(tabId) {
  const { posledniUsek } = await chrome.storage.local.get('posledniUsek');
  if (!posledniUsek) return { ok: false, chyba: 'Zatím nebyl spuštěn žádný úsek.' };
  return spustAOznam(tabId, posledniUsek);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (id === 'editor') return otevriEditor();
  if (!tab || tab.id == null) return;
  if (id.startsWith('usek:')) spustAOznam(tab.id, { soubor: id.slice(5) });
  else if (id === 'zopakovat') zopakujUsek(tab.id);
  else if (id === 'panel') ovladani(tab.id, 'panel');
});

chrome.commands.onCommand.addListener(async (prikaz, tab) => {
  if (prikaz !== 'zopakovat-usek') return;
  const t = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (t) zopakujUsek(t.id);
});

// ---------- zprávy ----------

const obsluha = {
  // content script (každý rámec) po načtení
  async ready(z, s) {
    return { pohled: await pohled(s.tab.id), nahrava: !!(await stav(s.tab.id)).nahravani };
  },
  async dialog(z, s) {
    const beh = horni(await stav(s.tab.id));
    if (beh) {
      beh.dialogyText.push(`${z.druh}: ${z.text}`);
      await uloz(s.tab.id);
    }
    return { ok: true };
  },
  async 'nahravani-krok'(z, s) {
    return nahravani(s.tab.id, { akce: 'krok', krok: z.krok });
  },
  async pohled(z, s) {
    return pohled(z.tabId ?? s.tab.id);
  },
  async spust(z, s) {
    let tabId = z.tabId ?? s.tab?.id;
    if (z.naCilove) {
      const t = await cilovaZalozka();
      if (!t) return { ok: false, chyba: 'Není otevřená žádná stránka aplikace.' };
      tabId = t.id;
    }
    return spust(tabId, z);
  },
  async ovladani(z, s) {
    return ovladani(z.tabId ?? s.tab.id, z.akce, { jenVeStavu: z.jenVeStavu, behId: z.behId });
  },
  async nahravani(z, s) {
    return nahravani(z.tabId ?? s.tab.id, z);
  },
  async 'zopakovat-usek'(z, s) {
    return zopakujUsek(z.tabId ?? s.tab.id);
  },
  async 'cilova-zalozka'() {
    const t = await cilovaZalozka();
    return t ? { id: t.id, url: t.url, title: t.title } : null;
  },
  async 'zkus-selektor'(z) {
    const t = await cilovaZalozka();
    if (!t) return { ok: false, chyba: 'Není otevřená žádná stránka.' };
    try {
      await zajistiSkript(t.id);
      return await chrome.tabs.sendMessage(t.id, { typ: 'zvyrazni', sel: z.sel, barva: 'info' }, { frameId: 0 });
    } catch (e) {
      return { ok: false, chyba: e.message };
    }
  },
  async 'otevri-editor'(z) {
    await otevriEditor(z);
    return { ok: true };
  },
  async synchronizuj() {
    const r = await U.nactiVse();
    await nactiZrcadlo();
    obnovMenu();
    return { ok: true, zdroj: r.zdroj };
  },
};

chrome.runtime.onMessage.addListener((z, s, odpoved) => {
  const f = z && obsluha[z.typ];
  if (!f) return false;
  f(z, s).then(odpoved, (e) => odpoved({ ok: false, chyba: e.message || String(e) }));
  return true;
});

// ---------- start ----------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    const { soubory: s } = await chrome.storage.local.get('soubory');
    if (!s) {
      await chrome.storage.local.set({ rezim: 'interni' });
      try {
        await U.nahrajUkazky();
      } catch (e) {
        console.warn('Klikač: ukázky', e);
      }
    }
  }
  podpisMenu = null;
  obnovMenu();
});

chrome.runtime.onStartup.addListener(() => {
  podpisMenu = null;
  obnovMenu();
});

// Jednou za minutu načte složku znovu, aby menu odpovídalo souborům upraveným v Poznámkovém bloku.
chrome.alarms.create('synchronizace', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'synchronizace') U.nactiVse().catch(() => {});
});

obnovBehy();
