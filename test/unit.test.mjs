// Jednotkové testy jádra (parser, rozbalení, generátory, CSV). Spuštění: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rozparsujScenar, rozparsujRadek, rozdelNaRovnitku } from '../lib/dsl.js';
import { rozbal, najdiSoubor, prectiNastaveni } from '../lib/soubory.js';
import { Data, dosad, vyhodnot, sledovaneKlice, zkontrolujVyraz, najdiVyrazy } from '../lib/promenne.js';
import { RUIAN } from '../generatory/ruian-data.js';
import { SOUDY } from '../generatory/adresa.js';
import { entity } from '../generatory/registr.js';
import { jePlatneRc } from '../generatory/osoba.js';
import { jePlatneIco } from '../generatory/firma.js';
import { jePlatneCisloUctu } from '../generatory/ucet.js';
import { funkce } from '../generatory/index.js';
import { pridejRadek, rozparsujCsv } from '../lib/csv.js';

const nactiSlozku = (slozka) =>
  Object.fromEntries(
    JSON.parse(readFileSync(new URL(`../${slozka}/seznam.json`, import.meta.url))).map((c) => [c, readFileSync(new URL(`../${slozka}/${c}`, import.meta.url), 'utf8')]),
  );
// scénáře pro cvičnou aplikaci (ASP.NET) a ukázky pro ISVR, které dostane uživatel
const ukazky = nactiSlozku('test/cvicna');
const isvr = nactiSlozku('ukazka');

function novyBeh(soubor = 'zalozeni/Zaloz sro.txt') {
  const r = rozbal(soubor, ukazky);
  return { ...r, promenne: {}, globalni: {}, hodnoty: {}, pocitadla: {}, prefixy: [], posledni: {}, korenJeUsek: soubor.startsWith('useky/') };
}

test('rozdělení na = mimo závorky a uvozovky', () => {
  assert.deepEqual(rozdelNaRovnitku('[name="a=b"] = x'), ['[name="a=b"]', 'x']);
  assert.deepEqual(rozdelNaRovnitku('text:"a = b" = c = d'), ['text:"a = b"', 'c = d']);
  assert.deepEqual(rozdelNaRovnitku('#a'), ['#a', null]);
});

test('parser příkazů', () => {
  assert.deepEqual(
    { ...rozparsujRadek('vyber     @main #ddlTyp = "Právnická osoba"', 3) },
    { prikaz: 'vyber', radek: 3, text: 'vyber     @main #ddlTyp = "Právnická osoba"', sel: '@main #ddlTyp', hodnota: 'Právnická osoba' },
  );
  assert.equal(rozparsujRadek('Vyplň #x = 1', 1).prikaz, 'vypln');
  assert.equal(rozparsujRadek('čekej 2s', 1).cislo, 2000);
  const p = rozparsujRadek('pouzij Zaloz sro 3x', 1);
  assert.equal(p.usek, 'Zaloz sro');
  assert.equal(p.pocet, 3);
  const z = rozparsujRadek('zapamatuj id = text:"Subjekt uložen pod č." /(\\d+)/', 1);
  assert.equal(z.sel, 'text:"Subjekt uložen pod č."');
  assert.equal(z.regex.zdroj, '(\\d+)');
  const zp = rozparsujRadek('zapamatuj poznamka = Test přepisu vlastníka', 1);
  assert.equal(zp.hodnota, 'Test přepisu vlastníka');
  assert.equal(zp.sel, undefined);
  const r = rozparsujRadek('rucne Zadej společníky dokud text:"Společníci: 2"', 1);
  assert.equal(r.pokyn, 'Zadej společníky');
  assert.equal(r.dokud, 'text:"Společníci: 2"');
  const n = rozparsujRadek('nova osoba zmocnenec zena', 1);
  assert.deepEqual([n.entita, n.instance, n.pohlavi], ['osoba', 'zmocnenec', 'Z']);
  assert.equal(rozparsujRadek('# komentář', 1), null);
});

test('parser hlásí chyby s číslem řádku a návrhem', () => {
  const { chyby, popis } = rozparsujScenar('# popis: Test\nklikn #a\nvypln #b\n');
  assert.equal(popis, 'Test');
  assert.equal(chyby.length, 2);
  assert.match(chyby[0].zprava, /myslel jsi „klikni“/);
  assert.equal(chyby[0].radek, 2);
  assert.equal(chyby[1].radek, 3);
});

test('všechny ukázky jsou bez chyb a rozbalí se', () => {
  for (const c of Object.keys(ukazky).filter((c) => /^(zalozeni|useky)\//.test(c))) {
    const r = rozbal(c, ukazky);
    assert.deepEqual(r.chyby, [], c);
  }
  const r = rozbal('zalozeni/Zaloz sro.txt', ukazky);
  assert.equal(r.rozsahy.length, 1 + 1 + 2 + 1); // kořen, Adresa, 2× Spolecnik, Ulozit
  assert.equal(r.kroky.filter((k) => k.soubor === 'useky/Spolecnik.txt').length, 16);
});

test('ukázky pro ISVR: bez chyb, rozbalí se, proměnné existují', () => {
  const data = new Data(isvr);
  for (const c of Object.keys(isvr).filter((c) => /^(zalozeni|useky)\//.test(c))) {
    const r = rozbal(c, isvr);
    assert.deepEqual(r.chyby, [], c);
    for (const k of r.kroky) {
      for (const t of [k.sel, k.hodnota]) {
        if (!t) continue;
        for (const { vyraz } of najdiVyrazy(t)) assert.equal(zkontrolujVyraz(vyraz, data), null, `${k.soubor}:${k.radek} {${vyraz}}`);
      }
    }
  }
  const r = rozbal('zalozeni/Prvozapis sro 2 spolecnici.txt', isvr);
  assert.equal(r.rozsahy.filter((x) => x.soubor === 'useky/Spolecnik FO.txt').length, 2);
  assert.equal(r.rozsahy.filter((x) => x.soubor === 'useky/Adresa.txt').length, 2 + 2); // bydliště 2 společníků a 2 jednatelů
  assert.equal(r.rozsahy.filter((x) => x.soubor === 'useky/Adresa sidla.txt').length, 1);
  const nova = rozparsujRadek('nova adresa soud={soud}', 1);
  assert.deepEqual([nova.entita, nova.volby], ['adresa', { soud: '{soud}' }]);
  const menu = rozparsujRadek('pridej uzel:"Společníci" = Společník > Přidat fyzickou osobu', 1);
  assert.deepEqual([menu.prikaz, menu.sel, menu.hodnota], ['pridej', 'uzel:"Společníci"', 'Společník > Přidat fyzickou osobu']);
  assert.equal(prectiNastaveni(isvr['nastaveni.txt']).chyba, 'text:"Nastala interní chyba"');
});

test('adresa je skutečné adresní místo z RÚIAN', () => {
  assert.ok(RUIAN.length >= 500);
  const kody = new Set();
  for (const r of RUIAN) {
    const [kod, ulice, cp, co, cast, obec, psc] = r.split('|');
    assert.match(kod, /^\d{5,9}$/, r);
    assert.ok(cp && cast && obec, r);
    assert.match(psc, /^\d{5}$/, r);
    kody.add(kod);
    void ulice, co;
  }
  assert.equal(kody.size, RUIAN.length, 'kódy se neopakují');
  assert.ok(RUIAN.includes('21704970|Vodičkova|704|36|Nové Město|Praha|11000|MSPH'));
  // každý rejstříkový soud má adresy a sídlo jde vybrat podle soudu
  for (const soud of Object.keys(SOUDY)) {
    assert.ok(RUIAN.filter((r) => r.endsWith('|' + soud)).length >= 30, soud);
    for (let i = 0; i < 20; i++) {
      const a = entity.adresa.vytvor(new Data(isvr).ctx, { soud: soud.toLowerCase() });
      assert.equal(a.soud, soud);
      assert.equal(a.soud_nazev, SOUDY[soud]);
    }
  }
  assert.throws(() => entity.adresa.vytvor(new Data(isvr).ctx, { soud: 'XYZ' }), /neznámý rejstříkový soud/);
  assert.equal(RUIAN.find((r) => r.includes('|Brno|')).split('|')[7], 'KSBR');
  assert.equal(RUIAN.find((r) => r.includes('|Kladno|')).split('|')[7], 'MSPH');
  const data = new Data(isvr);
  const beh = novyBeh();
  const rozsah = { id: 1, nazev: 'adresa', rodic: 0 };
  const V = (v) => vyhodnot(v, beh, rozsah, data);
  const radek = RUIAN.find((x) => x.startsWith(V('adresa.ruian') + '|'));
  assert.ok(radek);
  assert.equal(radek.split('|')[5], V('adresa.mesto'));
  assert.ok(V('adresa.cela').includes(V('adresa.psc_mezera')));
});

test('pouzij hledá v useky/, zalozeni/ a hlásí cyklus', () => {
  assert.equal(najdiSoubor('spolecnik', 'zalozeni/x.txt', ukazky), 'useky/Spolecnik.txt');
  assert.equal(najdiSoubor('Zaloz sro', 'useky/x.txt', ukazky), 'zalozeni/Zaloz sro.txt');
  const r = rozbal('useky/A.txt', { 'useky/A.txt': 'pouzij B', 'useky/B.txt': 'pouzij A' });
  assert.match(r.chyby[0].zprava, /vkládá sám sebe/);
});

test('generátory: platné RČ, IČO, účet; data k sobě sedí', () => {
  const data = new Data(ukazky);
  const beh = novyBeh();
  for (let i = 0; i < 200; i++) {
    const rozsah = { id: 1, nazev: 'spolecnik', rodic: 0 };
    const V = (v) => vyhodnot(v, beh, rozsah, data);
    const rc = V('osoba.rc');
    assert.ok(jePlatneRc(rc), rc);
    assert.equal(V('osoba.rc_lomitko').replace('/', ''), rc);
    const zena = V('osoba.pohlavi') === 'Z';
    assert.equal(Number(rc.slice(2, 4)) > 50, zena);
    const [d, m, y] = V('osoba.datum_nar').split('.');
    assert.equal(rc.slice(0, 6), y.slice(2) + String(Number(m) + (zena ? 50 : 0)).padStart(2, '0') + d);
    if (zena) assert.match(V('osoba.prijmeni'), /(á|ová)$/);
    assert.ok(jePlatneCisloUctu(funkce.ucet.hodnota(undefined, data.ctx).split('/')[0]));
  }
  for (let i = 0; i < 200; i++) assert.ok(jePlatneIco(vyhodnot('firma.ico', { ...novyBeh(), globalni: {} }, { id: 0, rodic: null, nazev: 'x' }, data)));
});

test('firma je společná pro běh, osoba lokální pro úsek; sběr do výstupu', () => {
  const data = new Data(ukazky);
  const beh = novyBeh();
  const [koren, , s1, s2] = beh.rozsahy;
  const D = (t, r) => dosad(t, (v) => vyhodnot(v, beh, r, data));
  const nazev = D('{firma.nazev} s.r.o.', koren);
  assert.equal(D('{firma.nazev} s.r.o.', s1), nazev);
  assert.notEqual(D('{osoba.rc}', s1) + D('{osoba.jmeno}', s1), D('{osoba.rc}', s2) + D('{osoba.jmeno}', s2));
  assert.equal(D('{osoba.rc}', s1), D('{osoba.rc}', s1));
  assert.ok(beh.hodnoty.spolecnik1 && beh.hodnoty.spolecnik2_rc && beh.hodnoty.ico, JSON.stringify(beh.hodnoty));
  assert.deepEqual(sledovaneKlice('{firma.nazev} s.r.o.'), ['nazev_firmy']);
  assert.match(D('{firma.nazev:prijmeni}', koren), /^\S+ a \S+$/);
  assert.match(D('TEST {firma.nazev_unik} s.r.o.', koren), /^TEST .+ [A-Z0-9]{3} s\.r\.o\.$/);
  assert.match(D('{osoba:zmocnenec.jmeno}', koren), /\S/);
  assert.ok('zmocnenec' in beh.hodnoty);
  const spz = D('{spisova_znacka}', koren);
  assert.match(spz, /^NZ \d{3}\/\d{4}$/);
  assert.equal(D('{spisova_znacka}', koren), spz, 'vzor je v rámci úseku stálý');
  assert.match(D('{cislo:5-5}{vyber:x}{pismena:3}{nahodne:4}', koren), /^5x[A-Z]{3}\d{4}$/);
  assert.equal(D('\\{literal}', koren), '{literal}');
  assert.throws(() => D('{nesmysl}', koren), /neznámá proměnná/);
  assert.throws(() => D('{osoba.xyz}', koren), /neznámá vlastnost/);
});

test('kontrola výrazů pro editor', () => {
  const data = new Data(ukazky);
  assert.equal(zkontrolujVyraz('osoba.jmeno', data), null);
  assert.equal(zkontrolujVyraz('titul', data), null);
  assert.match(zkontrolujVyraz('cislo:abc', data), /rozsah/);
  assert.match(zkontrolujVyraz('osoba', data), /napiš i vlastnost/);
  assert.equal(zkontrolujVyraz('spz', data, new Set(['spz'])), null);
});

test('CSV: BOM, středníky, rozšiřování hlavičky', () => {
  let t = pridejRadek('', { cas: '24.09.2026 14:03', scenar: 'Zaloz sro', vysledek: 'OK', hodnoty: { spz: 'NZ 412/2026', ico: '27074358' } });
  t = pridejRadek(t, { cas: '24.09.2026 14:07', scenar: 'useky/Spolecnik', vysledek: 'chyba ř. 5', hodnoty: { spolecnik1: 'Petr Horák', poznamka: 'a;b "c"' } });
  assert.ok(t.startsWith('﻿čas;scénář;výsledek;spz;ico;spolecnik1;poznamka\r\n'));
  const r = rozparsujCsv(t);
  assert.deepEqual(r[1], ['24.09.2026 14:03', 'Zaloz sro', 'OK', 'NZ 412/2026', '27074358', '', '']);
  assert.deepEqual(r[2], ['24.09.2026 14:07', 'useky/Spolecnik', 'chyba ř. 5', '', '', 'Petr Horák', 'a;b "c"']);
});

test('nastavení', () => {
  const n = prectiNastaveni(ukazky['nastaveni.txt']);
  assert.deepEqual(n, { adresa: 'https://notar.local', pauza: 200, timeout: 10000, dialogy: 'ano' });
});
