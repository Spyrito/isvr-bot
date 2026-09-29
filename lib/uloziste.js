// Úložiště scénářů. Dva režimy:
//   slozka  – pracovní složka vybraná přes File System Access API (handle v IndexedDB)
//   interni – záložní režim, soubory uvnitř rozšíření (chrome.storage.local) s importem/exportem .txt
// V obou režimech se scénáře zrcadlí do chrome.storage.local.soubory, takže background má
// poslední známou verzi i ve chvíli, kdy Chrome po restartu ještě nepotvrdil přístup ke složce.
import { nazevVystupu, pridejRadek } from './csv.js';
import { VYCHOZI_NASTAVENI_TEXT, NASTAVENI } from './soubory.js';

const DB = 'klikac';
const OS = 'handly';

function otevriDb() {
  return new Promise((ok, chyba) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => chyba(r.error);
  });
}

async function idb(akce, klic, hodnota) {
  const db = await otevriDb();
  try {
    return await new Promise((ok, chyba) => {
      const tx = db.transaction(OS, akce === 'get' ? 'readonly' : 'readwrite');
      const os = tx.objectStore(OS);
      const r = akce === 'get' ? os.get(klic) : akce === 'put' ? os.put(hodnota, klic) : os.delete(klic);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => chyba(r.error);
    });
  } finally {
    db.close();
  }
}

const nactiHandle = () => idb('get', 'slozka').catch(() => null);

async function lokalni(klic, vychozi) {
  const r = await chrome.storage.local.get(klic);
  return r[klic] === undefined ? vychozi : r[klic];
}

export async function rezim() {
  return lokalni('rezim', 'interni');
}

// { rezim, slozka, pristup: ok | potvrdit | chybi | nepodporovano }
export async function stav() {
  const r = await rezim();
  const nazev = await lokalni('nazevSlozky', null);
  if (r !== 'slozka') return { rezim: r, slozka: nazev, pristup: 'ok' };
  const h = await nactiHandle();
  if (!h) return { rezim: r, slozka: nazev, pristup: 'chybi' };
  if (typeof h.queryPermission !== 'function') return { rezim: r, slozka: nazev, pristup: 'nepodporovano' };
  try {
    const p = await h.queryPermission({ mode: 'readwrite' });
    return { rezim: r, slozka: h.name, pristup: p === 'granted' ? 'ok' : 'potvrdit' };
  } catch {
    return { rezim: r, slozka: h.name, pristup: 'nepodporovano' };
  }
}

export function podporujeSlozku() {
  return typeof globalThis.showDirectoryPicker === 'function';
}

// Jen ze stránky rozšíření po kliknutí uživatele.
export async function vyberSlozku() {
  const h = await globalThis.showDirectoryPicker({ id: 'klikac', mode: 'readwrite', startIn: 'documents' });
  await idb('put', 'slozka', h);
  await chrome.storage.local.set({ rezim: 'slozka', nazevSlozky: h.name });
  await zalozStrukturu(h);
  return h.name;
}

// Po restartu prohlížeče jedno kliknutí na „Povolit přístup“.
export async function povolPristup() {
  const h = await nactiHandle();
  if (!h) return false;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function prepniNaInterni() {
  // Obsah posledního zrcadla zůstane, takže se v rozšíření dá pracovat dál.
  await chrome.storage.local.set({ rezim: 'interni' });
}

async function koren() {
  if ((await rezim()) !== 'slozka') return null;
  const h = await nactiHandle();
  if (!h || typeof h.queryPermission !== 'function') return null;
  try {
    return (await h.queryPermission({ mode: 'readwrite' })) === 'granted' ? h : null;
  } catch {
    return null;
  }
}

async function adresar(root, casti, vytvor) {
  let d = root;
  for (const c of casti) d = await d.getDirectoryHandle(c, { create: vytvor });
  return d;
}

function rozdelCestu(cesta) {
  const casti = cesta.split('/').filter(Boolean);
  if (!casti.length || casti.some((c) => c === '..' || c === '.')) throw new Error(`neplatná cesta „${cesta}“`);
  return { adr: casti.slice(0, -1), soubor: casti[casti.length - 1] };
}

async function ctiZeSlozky(root, cesta) {
  const { adr, soubor } = rozdelCestu(cesta);
  try {
    const d = await adresar(root, adr, false);
    const f = await (await d.getFileHandle(soubor)).getFile();
    return await f.text();
  } catch (e) {
    if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') return null;
    throw e;
  }
}

async function zapisDoSlozky(root, cesta, text) {
  const { adr, soubor } = rozdelCestu(cesta);
  const d = await adresar(root, adr, true);
  const w = await (await d.getFileHandle(soubor, { create: true })).createWritable();
  await w.write(text);
  await w.close();
}

async function projdi(dir, prefix, out, pripona) {
  for await (const [jmeno, h] of dir.entries()) {
    if (jmeno.startsWith('.')) continue;
    if (h.kind === 'directory') await projdi(h, `${prefix}${jmeno}/`, out, pripona);
    else if (jmeno.toLowerCase().endsWith(pripona)) out.push({ cesta: prefix + jmeno, h });
  }
}

async function nactiStromZeSlozky(root) {
  const soubory = {};
  const nast = await ctiZeSlozky(root, NASTAVENI);
  if (nast != null) soubory[NASTAVENI] = nast;
  for (const kor of ['zalozeni', 'useky', 'data']) {
    let d;
    try {
      d = await root.getDirectoryHandle(kor);
    } catch {
      continue;
    }
    const nalez = [];
    await projdi(d, kor + '/', nalez, '.txt');
    for (const { cesta, h } of nalez) soubory[cesta] = await (await h.getFile()).text();
  }
  return soubory;
}

export async function zalozStrukturu(root) {
  for (const d of ['zalozeni', 'useky', 'data', 'vystupy']) await root.getDirectoryHandle(d, { create: true });
  if ((await ctiZeSlozky(root, NASTAVENI)) == null) await zapisDoSlozky(root, NASTAVENI, VYCHOZI_NASTAVENI_TEXT);
}

// Všechny scénáře, data a nastavení jako { cesta: text }.
// zdroj: slozka (čerstvě ze složky) | zrcadlo (složka nedostupná, poslední známá verze) | interni
export async function nactiVse() {
  const zrcadlo = await lokalni('soubory', {});
  const r = await rezim();
  if (r !== 'slozka') return { soubory: zrcadlo, zdroj: 'interni' };
  const root = await koren();
  if (!root) return { soubory: zrcadlo, zdroj: 'zrcadlo' };
  try {
    const soubory = await nactiStromZeSlozky(root);
    const otisk = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    if (otisk(soubory) !== otisk(zrcadlo)) await chrome.storage.local.set({ soubory });
    await vyprazdniFrontu(root);
    return { soubory, zdroj: 'slozka' };
  } catch (e) {
    return { soubory: zrcadlo, zdroj: 'zrcadlo', chyba: e.message };
  }
}

export async function cti(cesta) {
  const root = await koren();
  if (root) return ctiZeSlozky(root, cesta);
  const zrcadlo = await lokalni('soubory', {});
  return zrcadlo[cesta] ?? null;
}

async function upravZrcadlo(fn) {
  const zrcadlo = await lokalni('soubory', {});
  fn(zrcadlo);
  await chrome.storage.local.set({ soubory: zrcadlo });
}

function chybiPristup() {
  return new Error('Chybí přístup ke složce Klikac. Potvrď ho v popupu nebo v editoru (Povolit přístup).');
}

export async function zapis(cesta, text) {
  rozdelCestu(cesta);
  if ((await rezim()) === 'slozka') {
    const root = await koren();
    if (!root) throw chybiPristup();
    await zapisDoSlozky(root, cesta, text);
  }
  await upravZrcadlo((z) => {
    z[cesta] = text;
  });
}

export async function smaz(cesta) {
  if ((await rezim()) === 'slozka') {
    const root = await koren();
    if (!root) throw chybiPristup();
    const { adr, soubor } = rozdelCestu(cesta);
    try {
      await (await adresar(root, adr, false)).removeEntry(soubor);
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e;
    }
  }
  await upravZrcadlo((z) => {
    delete z[cesta];
  });
}

export async function prejmenuj(z, na) {
  const text = await cti(z);
  if (text == null) throw new Error(`soubor ${z} neexistuje`);
  if ((await cti(na)) != null) throw new Error(`soubor ${na} už existuje`);
  await zapis(na, text);
  await smaz(z);
}

// ---------- výstupy ----------

let retezZapisu = Promise.resolve();

// Zapíše řádek do vystupy/RRRR-MM.csv. Když složka není dostupná, řádek počká ve frontě.
export function pridejVystup(zaznam) {
  const cesta = nazevVystupu(new Date());
  retezZapisu = retezZapisu.then(() => pridejVystupHned(cesta, zaznam)).catch((e) => console.warn('Klikač: zápis výstupu', e));
  return retezZapisu;
}

async function pridejVystupHned(cesta, zaznam) {
  if ((await rezim()) === 'slozka') {
    const root = await koren();
    if (!root) {
      const fronta = await lokalni('frontaVystupu', []);
      fronta.push({ cesta, zaznam });
      await chrome.storage.local.set({ frontaVystupu: fronta });
      return;
    }
    await vyprazdniFrontu(root);
    await zapisDoSlozky(root, cesta, pridejRadek((await ctiZeSlozky(root, cesta)) || '', zaznam));
    return;
  }
  const vystupy = await lokalni('vystupy', {});
  vystupy[cesta] = pridejRadek(vystupy[cesta] || '', zaznam);
  await chrome.storage.local.set({ vystupy });
}

async function vyprazdniFrontu(root) {
  const fronta = await lokalni('frontaVystupu', []);
  if (!fronta.length) return;
  await chrome.storage.local.set({ frontaVystupu: [] });
  for (const { cesta, zaznam } of fronta) {
    await zapisDoSlozky(root, cesta, pridejRadek((await ctiZeSlozky(root, cesta)) || '', zaznam));
  }
}

export async function seznamVystupu() {
  if ((await rezim()) === 'slozka') {
    const root = await koren();
    if (!root) return [];
    try {
      const out = [];
      await projdi(await root.getDirectoryHandle('vystupy'), 'vystupy/', out, '.csv');
      return out.map((o) => o.cesta).sort().reverse();
    } catch {
      return [];
    }
  }
  return Object.keys(await lokalni('vystupy', {})).sort().reverse();
}

export async function ctiVystup(cesta) {
  if ((await rezim()) === 'slozka') {
    const root = await koren();
    return root ? ctiZeSlozky(root, cesta) : null;
  }
  return (await lokalni('vystupy', {}))[cesta] ?? null;
}

// ---------- ukázkové soubory ----------

export async function ukazkoveSoubory() {
  const seznam = await (await fetch(chrome.runtime.getURL('ukazka/seznam.json'))).json();
  const out = {};
  for (const cesta of seznam) out[cesta] = await (await fetch(chrome.runtime.getURL('ukazka/' + cesta))).text();
  return out;
}

// Nahraje ukázky; existující soubory nepřepisuje. Vrací počet nových souborů.
export async function nahrajUkazky() {
  const { soubory } = await nactiVse();
  let n = 0;
  for (const [cesta, text] of Object.entries(await ukazkoveSoubory())) {
    if (soubory[cesta] != null) continue;
    await zapis(cesta, text);
    n++;
  }
  return n;
}
