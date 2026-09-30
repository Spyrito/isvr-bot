import { registruj } from './registr.js';
import { RUIAN, RUIAN_OVERENE } from './ruian-data.js';

// Rejstříkové soudy (podle kraje sídla se subjektu přiřadí soud, zkratka je na konci čísla zápisu Fj …/MSPH).
export const SOUDY = {
  MSPH: 'Městský soud v Praze',
  KSCB: 'Krajský soud v Českých Budějovicích',
  KSPL: 'Krajský soud v Plzni',
  KSUL: 'Krajský soud v Ústí nad Labem',
  KSHK: 'Krajský soud v Hradci Králové',
  KSBR: 'Krajský soud v Brně',
  KSOS: 'Krajský soud v Ostravě',
};

const kodRadku = (r) => r.split('|')[0].trim();
const obecRadku = (r) => (r.split('|')[5] || '').trim();
const kodyZ = (ctx, nazev) => new Set((ctx.seznam(nazev, null) || []).map(kodRadku).filter(Boolean));

// Z adres pro daný soud vybere ty, které ISVR opravdu dohledá:
//  1. ověřené – vestavěné RUIAN_OVERENE, celý data/ruian.txt (vlastní výběr) a data/ruian-overene.txt
//     (kódy, které Klikač v ISVR úspěšně dohledal),
//  2. když pro soud žádná ověřená není, neověřené – bez kódů z data/ruian-vyrazene.txt (na ty ISVR spadlo)
//     a bez obcí, kde už nějaký kód selhal (ISVR tu obec nejspíš vůbec nezná).
export function adresyKVyberu(ctx, soud) {
  const vlastni = ctx.seznam('ruian', null);
  const vse = vlastni && vlastni.length ? vlastni : RUIAN;
  const overene = new Set([...(vlastni && vlastni.length ? vlastni : RUIAN_OVERENE).map(kodRadku), ...kodyZ(ctx, 'ruian-overene')]);
  const vyrazene = kodyZ(ctx, 'ruian-vyrazene');
  let seznam = vse.filter((r) => !vyrazene.has(kodRadku(r)));
  if (soud) {
    seznam = seznam.filter((r) => (r.split('|')[7] || '').trim().toUpperCase() === soud);
    if (!seznam.length) throw new Error(`v databázi RÚIAN není žádná použitelná adresa pro soud ${soud} (doplň data/ruian.txt)`);
  }
  const jiste = seznam.filter((r) => overene.has(kodRadku(r)));
  if (jiste.length) return { adresy: jiste, overene: true };
  const spatneObce = new Set(vse.filter((r) => vyrazene.has(kodRadku(r))).map(obecRadku));
  const zbytek = seznam.filter((r) => !spatneObce.has(obecRadku(r)));
  return { adresy: zbytek.length ? zbytek : seznam, overene: false };
}

// Adresa je vždy skutečné adresní místo z RÚIAN, aby ji aplikace dohledala podle kódu ({adresa.ruian}).
// „nova adresa soud=KSBR“ vybere adresu v obvodu daného rejstříkového soudu.
registruj({
  nazev: 'adresa',
  typ: 'entita',
  lokalni: true,
  popis: 'skutečná adresa z RÚIAN (kód, ulice, číslo, obec, PSČ, rejstříkový soud)',
  vytvor(ctx, volby = {}) {
    let soud = '';
    if (volby.soud) {
      soud = String(volby.soud).trim().toUpperCase();
      if (!SOUDY[soud]) throw new Error(`neznámý rejstříkový soud „${volby.soud}“ (znám: ${Object.keys(SOUDY).join(', ')})`);
    }
    const { adresy, overene } = adresyKVyberu(ctx, soud);
    const radek = ctx.vyber(adresy);
    const [ruian, ulice, cp, co, cast, mesto, pscRaw, soudAdresy] = radek.split('|').map((s) => (s || '').trim());
    const psc = pscRaw.replace(/\s/g, '');
    const cislo = co ? `${cp}/${co}` : cp;
    const pscMezera = psc ? `${psc.slice(0, 3)} ${psc.slice(3)}` : '';
    return {
      ruian,
      ulice,
      cp,
      co,
      cislo,
      cast_obce: cast,
      mesto,
      obec: mesto,
      psc,
      psc_mezera: pscMezera,
      cela: `${ulice || cast} ${cislo}, ${pscMezera} ${mesto}`.trim(),
      soud: soudAdresy.toUpperCase(),
      soud_nazev: SOUDY[soudAdresy.toUpperCase()] || '',
      _overena: overene, // background podle toho hlídá, jestli ji ISVR dohledá
    };
  },
  sber(data, prefix) {
    return { [prefix]: data.cela, [prefix + '_ruian']: data.ruian };
  },
});
