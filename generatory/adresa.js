import { registruj } from './registr.js';
import { RUIAN } from './ruian-data.js';

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

// Adresa je vždy skutečné adresní místo z RÚIAN, aby ji aplikace dohledala podle kódu ({adresa.ruian}).
// „nova adresa soud=KSBR“ vybere adresu v obvodu daného rejstříkového soudu.
registruj({
  nazev: 'adresa',
  typ: 'entita',
  lokalni: true,
  popis: 'skutečná adresa z RÚIAN (kód, ulice, číslo, obec, PSČ, rejstříkový soud)',
  vytvor(ctx, volby = {}) {
    let seznam = ctx.seznam('ruian', RUIAN);
    if (volby.soud) {
      const soud = String(volby.soud).trim().toUpperCase();
      if (!SOUDY[soud]) throw new Error(`neznámý rejstříkový soud „${volby.soud}“ (znám: ${Object.keys(SOUDY).join(', ')})`);
      seznam = seznam.filter((r) => (r.split('|')[7] || '').trim().toUpperCase() === soud);
      if (!seznam.length) throw new Error(`v databázi RÚIAN není žádná adresa pro soud ${soud}`);
    }
    const [ruian, ulice, cp, co, cast, mesto, pscRaw, soud] = ctx.vyber(seznam).split('|').map((s) => (s || '').trim());
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
      soud: soud.toUpperCase(),
      soud_nazev: SOUDY[soud.toUpperCase()] || '',
    };
  },
  sber(data, prefix) {
    return { [prefix]: data.cela, [prefix + '_ruian']: data.ruian };
  },
});
