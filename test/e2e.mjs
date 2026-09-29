// End-to-end test: nahraje rozšíření do Chromia, spustí cvičnou aplikaci a projde scénáře.
//   node test/e2e.mjs            (potřebuje Playwright; PW_HEADED=1 pro okno)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spustAplikaci } from './cvicna-aplikace.mjs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5100 + Math.floor(Math.random() * 800);
const APP = `http://127.0.0.1:${PORT}`;
const spi = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await spustAplikaci(PORT);
const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: !process.env.PW_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const chyby = [];
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
sw.on('console', (m) => m.type() === 'error' && chyby.push('SW: ' + m.text()));
const extId = new URL(sw.url()).host;
const EXTURL = `chrome-extension://${extId}`;

let testu = 0;
async function test(nazev, fn) {
  const t = Date.now();
  process.stdout.write(`• ${nazev} … `);
  try {
    await fn();
    testu++;
    console.log(`ok (${Date.now() - t} ms)`);
  } catch (e) {
    console.log('SELHAL');
    console.error(e);
    await konec(1);
  }
}

async function konec(kod) {
  await ctx.close().catch(() => {});
  server.close();
  process.exit(kod);
}

async function cekej(fn, popis, timeout = 30000) {
  const k = Date.now() + timeout;
  let posledni;
  for (;;) {
    posledni = await fn();
    if (posledni) return posledni;
    if (Date.now() > k) throw new Error(`nedočkal jsem se: ${popis}`);
    await spi(150);
  }
}

// stránka rozšíření, přes kterou posíláme zprávy backgroundu
const ext = await ctx.newPage();
ext.on('pageerror', (e) => chyby.push('historie: ' + e.message));
await ext.goto(`${EXTURL}/ui/historie.html`);
const zprava = (z) => ext.evaluate((z) => chrome.runtime.sendMessage(z), z);
const uloziste = (k) => ext.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k]), k);
const historie = async () => (await uloziste('historie')) || [];
const ulozene = async () => (await (await fetch(`${APP}/api/ulozene`)).json());

// nastavení na cvičnou aplikaci (ukázky se nahrávají při instalaci)
await cekej(async () => Object.keys((await uloziste('soubory')) || {}).length >= 10, 'ukázkové scénáře');
await ext.evaluate(async (app) => {
  const { soubory } = await chrome.storage.local.get('soubory');
  soubory['nastaveni.txt'] = soubory['nastaveni.txt'].replace(/^adresa.*$/m, `adresa  = ${app}`).replace(/^pauza.*$/m, 'pauza   = 30');
  await chrome.storage.local.set({ soubory });
}, APP);

const app = await ctx.newPage();
app.on('pageerror', (e) => chyby.push('aplikace: ' + e.message));
app.on('dialog', (d) => {
  chyby.push(`nativní dialog se neměl ukázat: ${d.type()} ${d.message()}`);
  d.accept();
});
await app.goto(`${APP}/Subjekty/Novy.aspx`);
await app.bringToFront();
const tabId = await ext.evaluate((u) => chrome.tabs.query({ url: u + '/*' }).then((t) => t[0].id), APP);
const pohled = () => zprava({ typ: 'pohled', tabId });
const main = () => app.frame({ name: 'main' });

async function spustADokonci(soubor, volby = {}) {
  const pred = (await historie()).length;
  const r = await zprava({ typ: 'spust', tabId, soubor, ...volby });
  assert.equal(r.ok, true, JSON.stringify(r));
  const pocet = volby.pocet || 1;
  const h = await cekej(async () => {
    const p = await pohled();
    if (p.beh && p.beh.stav === 'chyba') throw new Error(`běh spadl: ${JSON.stringify(p.beh.chyba)}`);
    const x = await historie();
    return x.length >= pred + pocet && x;
  }, `dokončení ${soubor}`, 60000);
  return h.slice(0, pocet);
}

await test('Zaloz sro: rámce, AutoPostBack, pouzij 2x, confirm i alert po postbacku', async () => {
  const [h] = await spustADokonci('zalozeni/Zaloz sro.txt');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  assert.equal(h.scenar, 'Zaloz sro');
  const s = (await ulozene()).at(-1);
  assert.equal(s.spz, h.hodnoty.spz);
  assert.equal(s.txtICO, h.hodnoty.ico);
  assert.equal(s.txtNazev, h.hodnoty.nazev_firmy);
  assert.match(h.hodnoty.nazev_firmy, / s\.r\.o\.$/);
  assert.equal(s.spolecnici.length, 2);
  assert.equal(`${s.spolecnici[0].jmeno} ${s.spolecnici[0].prijmeni}`, h.hodnoty.spolecnik1);
  assert.equal(s.spolecnici[1].rc, h.hodnoty.spolecnik2_rc.replace('/', ''));
  assert.match(h.hodnoty.dialogy, /confirm: Opravdu uložit subjekt\?.*alert: Subjekt byl úspěšně uložen\./);
  assert.ok(s.txtObec && /^\d{5}$/.test(s.txtPSC));
  assert.deepEqual(h.poradi.slice(0, 2), ['ico', 'nazev_firmy']); // pořadí vzniku v běhu, ne abecední
});

await test('Zaloz FO: label: selektory v buňkách tabulky, zapamatuj s regexem', async () => {
  const [h] = await spustADokonci('zalozeni/Zaloz FO.txt');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  const s = (await ulozene()).at(-1);
  assert.equal(String(s.id), h.hodnoty.id);
  assert.equal(`${s.txtJmeno} ${s.txtPrijmeni}`, h.hodnoty.osoba);
  assert.equal(s.txtRC, h.hodnoty.osoba_rc);
});

await test('Zaloz spolek: pis po znacích do pole s maskou', async () => {
  const [h] = await spustADokonci('zalozeni/Zaloz spolek.txt');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  const s = (await ulozene()).at(-1);
  assert.equal(s.ddlTyp, 'SP');
  assert.equal(s.txtNazev, h.hodnoty.nazev_spolku);
  assert.match(s.txtNazev, /^Spolek /);
  assert.equal(`${s.jednatele[0].jmeno} ${s.jednatele[0].prijmeni}`, h.hodnoty.jednatel1);
  assert.match(s.jednatele[0].datum, /^\d{2}\.\d{2}\.\d{4}$/);
});

await test('opakování 2× dá dvě různé firmy a dva řádky výstupu', async () => {
  const h = await spustADokonci('zalozeni/Zaloz sro.txt', { pocet: 2 });
  assert.deepEqual(h.map((x) => x.vysledek), ['OK', 'OK']);
  assert.notEqual(h[0].hodnoty.ico, h[1].hodnoty.ico);
});

await test('rucne: panel ukáže pokyn, úseky během pauzy, Pokračovat', async () => {
  const pred = (await ulozene()).length;
  const r = await zprava({ typ: 'spust', tabId, soubor: 'zalozeni/Zaloz sro rucne.txt' });
  assert.equal(r.ok, true);
  await cekej(async () => (await pohled()).beh?.stav === 'rucne', 'ruční pauza');
  await main().locator('text=Zadej společníky a dej Pokračovat').waitFor({ timeout: 5000 });
  for (let i = 0; i < 2; i++) {
    // úsek z panelu (klik na tlačítko Spolecnik ve shadow DOM panelu)
    await main().locator('[data-klikac=panel] button[data-soubor="useky/Spolecnik.txt"]').click();
    await cekej(async () => {
      const p = await pohled();
      return p.beh?.stav === 'rucne' && p.beh.posledniUsek && p.beh.hodnoty[`spolecnik${i + 1}`];
    }, `úsek Spolecnik ${i + 1} během pauzy`);
  }
  // ruční zásah uživatele: přidá třetího společníka sám
  await main().locator('#lnkPridatSpolecnika').click();
  await main().locator('#txtSpolJmeno').fill('Ruční');
  await main().locator('#txtSpolPrijmeni').fill('Zadaný');
  await main().locator('#txtSpolRC').fill('7801010008');
  await main().locator('input[value=Potvrdit]').click();
  await main().locator('text=Společníci: 3').waitFor();
  const predH = (await historie()).length;
  await main().locator('[data-klikac=panel] button[data-akce=pokracuj]').click();
  const [h] = await cekej(async () => {
    const x = await historie();
    return x.length > predH && x;
  }, 'dokončení po Pokračovat');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  assert.ok(h.hodnoty.spolecnik1 && h.hodnoty.spolecnik2_rc, JSON.stringify(h.hodnoty));
  const s = await ulozene();
  assert.equal(s.length, pred + 1);
  assert.equal(s.at(-1).spolecnici.length, 3);
});

await test('běh v ruční pauze přežije uspání service workeru', async () => {
  const pred = (await historie()).length;
  await zprava({ typ: 'spust', tabId, soubor: 'zalozeni/Zaloz sro rucne.txt' });
  await cekej(async () => (await pohled()).beh?.stav === 'rucne', 'ruční pauza');
  const cdp = await ctx.newCDPSession(ext);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await spi(500);
  // Pokračovat v panelu probudí worker, stav běhu se načte z chrome.storage.session
  await main().locator('[data-klikac=panel] button[data-akce=pokracuj]').click();
  const h = await cekej(async () => {
    const x = await historie();
    return x.length > pred && x[0];
  }, 'dokončení po probuzení');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  assert.match(h.hodnoty.spz, /^NZ /);
});

await test('rucne … dokud: pokračuje samo, až se text objeví; zmiz a nastav', async () => {
  await ext.evaluate(async () => {
    const { soubory } = await chrome.storage.local.get('soubory');
    soubory['zalozeni/Test dokud.txt'] = [
      'otevri    /Subjekty/Novy.aspx',
      'zmiz      @main #nacitam',
      'vyber     @main #ddlTyp = Právnická osoba',
      'nastav    poznamka = ručně přidaný společník',
      'rucne     Přidej jednoho společníka dokud @main text:"Společníci: 1"',
      'zapamatuj poznamka = {poznamka}',
      'zapamatuj pocet = @main text:"Společníci:" /(\\d+)/',
    ].join('\n');
    await chrome.storage.local.set({ soubory });
  });
  const pred = (await historie()).length;
  await zprava({ typ: 'spust', tabId, soubor: 'zalozeni/Test dokud.txt' });
  await cekej(async () => (await pohled()).beh?.stav === 'rucne', 'ruční pauza s dokud');
  await main().locator('text=Pokračuje samo').waitFor();
  await main().locator('#lnkPridatSpolecnika').click();
  await main().locator('#txtSpolJmeno').fill('Jan');
  await main().locator('#txtSpolPrijmeni').fill('Ručný');
  await main().locator('#txtSpolRC').fill('7801010008');
  await main().locator('input[value=Potvrdit]').click();
  const h = await cekej(async () => {
    const x = await historie();
    return x.length > pred && x[0];
  }, 'automatické pokračování');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  assert.equal(h.hodnoty.pocet, '1');
  assert.equal(h.hodnoty.poznamka, 'ručně přidaný společník');
});

await test('chyba: panel ukáže soubor a řádek, Přeskočit a Stop zapíše „chyba ř. N“', async () => {
  await ext.evaluate(async () => {
    const { soubory } = await chrome.storage.local.get('soubory');
    soubory['useky/Chybny.txt'] = '# popis: test chyby\ntimeout 800\nklikni @main #neexistuje\nklikni @main text:"Taky neni"\n';
    await chrome.storage.local.set({ soubory });
  });
  const pred = (await historie()).length;
  await zprava({ typ: 'spust', tabId, soubor: 'useky/Chybny.txt' });
  let p = await cekej(async () => {
    const x = await pohled();
    return x.beh?.stav === 'chyba' && x;
  }, 'stav chyba');
  assert.equal(p.beh.chyba.radek, 3);
  assert.match(p.beh.chyba.zprava, /nenalezen do 0,8 s/);
  await main().locator('[data-klikac=panel]').locator('text=useky/Chybny.txt:3').waitFor();
  await zprava({ typ: 'ovladani', tabId, akce: 'preskoc' });
  p = await cekej(async () => {
    const x = await pohled();
    return x.beh?.stav === 'chyba' && x.beh.chyba.radek === 4 && x;
  }, 'druhá chyba');
  await zprava({ typ: 'ovladani', tabId, akce: 'stop' });
  const h = await cekej(async () => {
    const x = await historie();
    return x.length > pred && x[0];
  }, 'zápis chyby');
  assert.equal(h.vysledek, 'chyba ř. 4');
  assert.equal(h.scenar, 'useky/Chybny');
});

await test('krok po kroku: Další, pak Pokračovat', async () => {
  const pred = (await historie()).length;
  await zprava({ typ: 'spust', tabId, soubor: 'zalozeni/Zaloz sro.txt', krokovat: true });
  await cekej(async () => {
    const p = await pohled();
    return p.beh?.stav === 'krokovani' && p.beh.pc === 0;
  }, 'krokování na 1. kroku');
  await zprava({ typ: 'ovladani', tabId, akce: 'dalsi' });
  await cekej(async () => {
    const p = await pohled();
    return p.beh?.stav === 'krokovani' && p.beh.pc === 1 && p.beh.krok.text.startsWith('vyber');
  }, 'krokování na 2. kroku');
  await main().locator('[data-klikac=panel] button[data-akce=dalsi]').waitFor();
  await zprava({ typ: 'ovladani', tabId, akce: 'pokracuj' });
  const h = await cekej(async () => {
    const x = await historie();
    return x.length > pred && x[0];
  }, 'dokončení');
  assert.equal(h.vysledek, 'OK');
});

await test('spustit od řádku (na právě otevřené stránce)', async () => {
  await app.goto(`${APP}/Subjekty/Novy.aspx`);
  await main().locator('#ddlTyp').selectOption('PO');
  await main().locator('#txtNazev').fill('Ručně zadaná s.r.o.');
  const [h] = await spustADokonci('zalozeni/Zaloz sro.txt', { odRadku: 5 });
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  assert.equal(h.hodnoty.nazev_firmy, undefined); // řádek 4 s názvem se přeskočil
  assert.ok(h.hodnoty.ico);
  assert.equal((await ulozene()).at(-1).txtNazev, 'Ručně zadaná s.r.o.');
});

await test('nahrávání: kroky v rámci, sloučení změn pole, uložení a náhrady v editoru', async () => {
  await app.goto(`${APP}/Subjekty/Novy.aspx`);
  await app.bringToFront();
  await main().locator('#ddlTyp').waitFor();
  let r = await zprava({ typ: 'nahravani', tabId, akce: 'start' });
  assert.equal(r.ok, true);
  await cekej(async () => !!(await pohled()).nahravani, 'nahrávání zapnuto');
  await spi(300);
  // selectOption posílá nedůvěryhodné (skriptové) události, nahrávač zapisuje jen skutečné vstupy uživatele
  await main().locator('#ddlTyp').focus();
  await app.keyboard.press('ArrowDown');
  await main().locator('#txtNazev').waitFor();
  await spi(300);
  await main().locator('#txtNazev').fill('Delta');
  await main().locator('#txtNazev').blur();
  await main().locator('#txtNazev').fill('Delta Stavby s.r.o.');
  await main().locator('#txtNazev').blur();
  await main().locator('#txtICO').fill('27074358');
  await main().locator('#txtICO').blur();
  await main().locator('h2').click(); // prázdné místo (nadpis) se nezapíše
  await main().locator('text=Přidat společníka').click();
  await main().locator('#txtSpolJmeno').waitFor();
  await spi(300);
  await main().locator('[data-klikac=panel] button[data-akce=cekani]').click();
  await cekej(async () => (await pohled()).nahravani?.pocet === 5, '5 kroků nahrávky').catch(async (e) => {
    // pro ladění: co se opravdu nahrálo
    console.error(await sw.evaluate((t) => chrome.storage.session.get('tab:' + t).then((r) => JSON.parse(r['tab:' + t]).nahravani.kroky), tabId));
    throw e;
  });
  r = await zprava({ typ: 'nahravani', tabId, akce: 'konec', nazev: 'Nahrany', slozka: 'zalozeni', popis: 'test nahrávání' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const text = (await uloziste('soubory'))['zalozeni/Nahrany.txt'];
  const radky = text.split(/\r?\n/).filter((x) => x && !x.startsWith('#'));
  assert.deepEqual(radky, [
    `otevri    ${APP}/Subjekty/Novy.aspx`,
    'vyber     @main #ddlTyp = Právnická osoba',
    'vypln     @main #txtNazev = Delta Stavby s.r.o.',
    'vypln     @main #txtICO = 27074358',
    'klikni    @main #lnkPridatSpolecnika',
    'cekej     1000',
  ]);
  // editor se otevřel s náhradami
  const editor = await cekej(() => ctx.pages().find((p) => p.url().includes('/ui/editor.html')), 'editor');
  editor.on('pageerror', (e) => chyby.push('editor: ' + e.message));
  await editor.locator('#z-nahrady >> text={firma.ico}').waitFor();
  await editor.locator('#z-nahrady >> text={firma.nazev} s.r.o.').waitFor();
  await editor.locator('[data-nahradit="0"]').click();
  await editor.locator('[data-nahradit="0"]').click();
  assert.match(await editor.locator('#text').inputValue(), /#txtNazev = \{firma\.nazev\} s\.r\.o\.\n.*#txtICO = \{firma\.ico\}/);
  await editor.keyboard.press('Control+s');
  await cekej(async () => (await uloziste('soubory'))['zalozeni/Nahrany.txt'].includes('{firma.ico}'), 'uložení');
  await editor.close();
  await app.bringToFront();
  const [h] = await spustADokonci('zalozeni/Nahrany.txt');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  assert.match(h.hodnoty.nazev_firmy, / s\.r\.o\.$/);
});

await test('výstup CSV: měsíční soubor s BOM a sjednocenou hlavičkou', async () => {
  const vystupy = await uloziste('vystupy');
  const [cesta, text] = Object.entries(vystupy)[0];
  assert.match(cesta, /^vystupy\/\d{4}-\d{2}\.csv$/);
  assert.ok(text.startsWith('﻿čas;scénář;výsledek;'));
  const radky = text.trim().split('\r\n');
  assert.equal(radky.length - 1, (await historie()).length);
  const sloupcu = radky[0].split(';').length;
  assert.ok(radky[0].includes('spz') && radky[0].includes('spolecnik2_rc'));
  assert.ok(sloupcu >= 10);
});

await test('editor: zvýraznění, kontrola, zkouška selektoru na stránce', async () => {
  const ed = await ctx.newPage();
  ed.on('pageerror', (e) => chyby.push('editor: ' + e.message));
  await ed.goto(`${EXTURL}/ui/editor.html?soubor=${encodeURIComponent('zalozeni/Zaloz sro.txt')}`);
  await ed.locator('#z-kontrola >> text=Bez chyb').waitFor();
  assert.ok((await ed.locator('#zvyrazneni .k-prik').count()) >= 8);
  await ed.locator('#text').click();
  await ed.keyboard.press('Control+End');
  await ed.keyboard.type('\nklikn @main #x\nvypln @main #y = {osoba.xyz}');
  await ed.locator('#z-kontrola >> text=myslel jsi „klikni“').waitFor();
  await ed.locator('#z-kontrola >> text=neznámá vlastnost').waitFor();
  await ed.locator('[data-z=napoveda]').click();
  await ed.locator('#z-napoveda >> text={osoba.rc_lomitko}').waitFor();
  await ed.locator('[data-z=data]').click();
  await ed.locator('#z-data >> text=nazev_s_formou').waitFor();
  await app.bringToFront();
  const r = await zprava({ typ: 'zkus-selektor', sel: '@main label:"Typ subjektu"' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.pocet, 1);
  await ed.evaluate(() => (window.onbeforeunload = null));
  await ed.close({ runBeforeUnload: false });
});

await test('popup a historie se načtou', async () => {
  const pp = await ctx.newPage();
  pp.on('pageerror', (e) => chyby.push('popup: ' + e.message));
  await pp.goto(`${EXTURL}/ui/popup.html`);
  await pp.locator('#seznam >> text=Zaloz sro').first().waitFor();
  await pp.close();
  await ext.reload();
  await ext.locator('#radky tr').first().waitFor();
});

await test('pracovní složka: čtení scénáře změněného mimo rozšíření, zápis CSV do vystupy/', async () => {
  // Handle z privátního souborového systému prohlížeče je stejný typ, jaký vrací výběr složky
  await ext.evaluate(async () => {
    const U = await import('/lib/uloziste.js');
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('Klikac', { create: true });
    const db = await new Promise((ok, chyba) => {
      const r = indexedDB.open('klikac', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handly');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => chyba(r.error);
    });
    await new Promise((ok, chyba) => {
      const tx = db.transaction('handly', 'readwrite');
      tx.objectStore('handly').put(root, 'slozka');
      tx.oncomplete = ok;
      tx.onerror = () => chyba(tx.error);
    });
    const { soubory } = await chrome.storage.local.get('soubory');
    await chrome.storage.local.set({ rezim: 'slozka', nazevSlozky: 'Klikac' });
    await U.zalozStrukturu(root);
    for (const [c, t] of Object.entries(soubory)) await U.zapis(c, t);
  });
  // soubor upravený „v Poznámkovém bloku“ – rovnou ve složce, bez rozšíření
  await ext.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('Klikac');
    const w = await (await (await root.getDirectoryHandle('useky')).getFileHandle('Poznamka.txt', { create: true })).createWritable();
    await w.write('# popis: zapsáno mimo rozšíření\r\nzapamatuj poznamka = Test přepisu vlastníka {rok}\r\n');
    await w.close();
  });
  const [h] = await spustADokonci('useky/Poznamka.txt');
  assert.equal(h.vysledek, 'OK', JSON.stringify(h));
  assert.equal(h.hodnoty.poznamka, 'Test přepisu vlastníka ' + new Date().getFullYear());
  const csv = await ext.evaluate(async () => {
    const d = new Date();
    const jm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.csv`;
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('Klikac');
    const bajty = new Uint8Array(await (await (await (await root.getDirectoryHandle('vystupy')).getFileHandle(jm)).getFile()).arrayBuffer());
    return { bom: [...bajty.slice(0, 3)].join(','), text: new TextDecoder().decode(bajty) };
  });
  assert.equal(csv.bom, '239,187,191'); // UTF-8 BOM kvůli Excelu
  assert.ok(csv.text.startsWith('čas;scénář;výsledek;'));
  assert.match(csv.text, /;useky\/Poznamka;OK;.*Test přepisu vlastníka/);
  // panel na stránce nabízí nový úsek i s popisem
  await cekej(async () => (await pohled()).useky.some((u) => u.cesta === 'useky/Poznamka.txt' && u.popis === 'zapsáno mimo rozšíření'), 'úsek v panelu');
});

if (chyby.length) {
  console.error('Chyby v konzoli:\n' + chyby.join('\n'));
  await konec(1);
}
console.log(`\nVšech ${testu} testů prošlo.`);
await konec(0);
