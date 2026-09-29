// Parser scénářů. Sdílí ho editor (kontrola, zvýraznění, nápověda) i background (přehrávání).
// Jeden řádek = jeden krok: „příkaz selektor = hodnota“. Řádky s # jsou komentáře.
import './selektor.js';

const S = globalThis.KlikacSelektor;

// arg: jak se čte zbytek řádku za příkazem
//   sel        selektor
//   sel=hod    selektor = hodnota
//   sel[=hod]  selektor, volitelně = hodnota
//   jm=hod     název = hodnota
//   cas        číslo v ms (nebo 2s)
//   text       volný text
export const PRIKAZY = {
  otevri: { arg: 'text', tvar: 'otevri URL', popis: 'otevře adresu (první řádek celého založení); relativní adresa se doplní z nastaveni.txt' },
  klikni: { arg: 'sel', tvar: 'klikni SEL', popis: 'klikne na tlačítko, odkaz, záložku', akce: true },
  vypln: { arg: 'sel=hod', tvar: 'vypln SEL = hodnota', popis: 'vyplní pole a vyvolá focus/input/change/blur, aby proběhly validace aplikace', akce: true },
  pis: { arg: 'sel=hod', tvar: 'pis SEL = hodnota', popis: 'píše po znacích (pole s maskou nebo onkeyup)', akce: true },
  vyber: { arg: 'sel=hod', tvar: 'vyber SEL = text', popis: 'vybere položku v rozbalovacím seznamu (podle textu, případně hodnoty)', akce: true },
  pridej: { arg: 'sel[=hod]', tvar: 'pridej uzel:"Společníci" = Společník > Přidat fyzickou osobu', popis: 'klikne na zelené + u uzlu stromu a vybere z nabídky (úrovně odděl „>“); „pridej strom = Předměty podnikání“ = + pod názvem subjektu', akce: true },
  menu: { arg: 'sel=hod', tvar: 'menu SEL = Položka > Podpoložka', popis: 'otevře nabídku tlačítkem SEL a vybere položku, úrovně odděl „>“', akce: true },
  zaskrtni: { arg: 'sel', tvar: 'zaskrtni SEL', popis: 'zaškrtne checkbox (když už je zaškrtnutý, nic nedělá)', akce: true },
  odskrtni: { arg: 'sel', tvar: 'odskrtni SEL', popis: 'odškrtne checkbox', akce: true },
  cekej: { arg: 'cas', tvar: 'cekej 1000', popis: 'pevná pauza v ms (nebo 2s)' },
  'cekej-na': { arg: 'sel', tvar: 'cekej-na SEL', popis: 'počká, až se prvek nebo text objeví' },
  zmiz: { arg: 'sel', tvar: 'zmiz SEL', popis: 'počká, až prvek zmizí („Načítám…“)' },
  pouzij: { arg: 'text', tvar: 'pouzij Název / pouzij Název 2x', popis: 'vloží jiný scénář (hledá v useky/, pak zalozeni/), případně opakovaně' },
  nastav: { arg: 'jm=hod', tvar: 'nastav x = hodnota', popis: 'vlastní proměnná, dál ve scénáři jako {x}' },
  nova: { arg: 'text', tvar: 'nova osoba / nova firma', popis: 'vygeneruje novou sadu dat; nova osoba zena, nova osoba zmocnenec muz, nova adresa soud=KSBR' },
  zapamatuj: { arg: 'jm=hod', tvar: 'zapamatuj x = SEL /regex/', popis: 'uloží hodnotu ze stránky (nebo pevný text) do výstupu a do {x}' },
  pauza: { arg: 'cas', tvar: 'pauza 300', popis: 'výchozí pauza mezi kroky od tohoto řádku' },
  timeout: { arg: 'cas', tvar: 'timeout 10000', popis: 'jak dlouho nejvýš čekat na prvek' },
  dialogy: { arg: 'text', tvar: 'dialogy ano / dialogy ne', popis: 'odpověď na confirm(); alert() se odklikne vždy' },
  stop: { arg: 'nic', tvar: 'stop', popis: 'zastaví a přepne do krokování (ladicí bod)' },
  rucne: { arg: 'text', tvar: 'rucne Pokyn [dokud SEL]', popis: 'pozastaví běh pro ruční zásah; pokračuje se tlačítkem Pokračovat (nebo samo, až se objeví SEL)' },
};

export function bezDiakritiky(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Index prvního „=“ mimo uvozovky a hranaté/kulaté závorky (-1, když není),
// takže [name="x"] i text:"a = b" zůstanou celé.
export function indexRovnitka(s) {
  let uvoz = null;
  let hloubka = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (uvoz) {
      if (c === '\\') i++;
      else if (c === uvoz) uvoz = null;
      continue;
    }
    if (c === '"') uvoz = c;
    else if (c === '[' || c === '(') hloubka++;
    else if (c === ']' || c === ')') hloubka--;
    else if (c === '=' && hloubka <= 0) return i;
  }
  return -1;
}

// „selektor = hodnota“ → [selektor, hodnota]; bez „=“ je hodnota null.
export function rozdelNaRovnitku(s) {
  const i = indexRovnitka(s);
  return i < 0 ? [s.trim(), null] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

export function prectiCas(s) {
  const m = String(s).trim().match(/^(\d+(?:[.,]\d+)?)\s*(ms|s)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Math.round(m[2] && m[2].toLowerCase() === 's' ? n * 1000 : n);
}

const NAZEV_PROMENNE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class ChybaScenare extends Error {
  constructor(zprava, radek) {
    super(zprava);
    this.radek = radek;
  }
}

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

export function navrhniPrikaz(slovo) {
  let nej = null;
  let vzd = 3;
  for (const p of Object.keys(PRIKAZY)) {
    const v = levenshtein(slovo, p);
    if (v < vzd) {
      vzd = v;
      nej = p;
    }
  }
  return nej;
}

export function normalizujPrikaz(slovo) {
  return bezDiakritiky(slovo).toLowerCase();
}

function zkontrolujSelektor(sel, radek) {
  try {
    S.rozparsuj(sel);
  } catch (e) {
    throw new ChybaScenare(e.message, radek);
  }
}

// Z hodnoty „SEL /regex/i“ oddělí regulární výraz.
export function oddelRegex(hodnota) {
  const m = hodnota.match(/^([\s\S]*?)\s+\/((?:\\.|[^/\\])+)\/([gimsuy]*)\s*$/);
  if (!m) return { zbytek: hodnota, regex: null };
  try {
    new RegExp(m[2], m[3]);
  } catch (e) {
    return { zbytek: hodnota, regex: null, chyba: 'neplatný regulární výraz: ' + e.message };
  }
  return { zbytek: m[1].trim(), regex: { zdroj: m[2], priznaky: m[3] } };
}

// Rozebere jeden řádek. Vrací null pro prázdný řádek a komentář, jinak krok. Při chybě vyhodí ChybaScenare.
export function rozparsujRadek(radek, cislo) {
  const t = radek.trim();
  if (!t || t[0] === '#') return null;
  const m = t.match(/^(\S+)\s*([\s\S]*)$/);
  const prikaz = normalizujPrikaz(m[1]);
  const zbytek = m[2].trim();
  const def = PRIKAZY[prikaz];
  if (!def) {
    const navrh = navrhniPrikaz(prikaz);
    throw new ChybaScenare(`neznámý příkaz „${m[1]}“` + (navrh ? ` (myslel jsi „${navrh}“?)` : ''), cislo);
  }
  const krok = { prikaz, radek: cislo, text: t };
  switch (def.arg) {
    case 'nic':
      break;
    case 'sel':
      if (!zbytek) throw new ChybaScenare(`${prikaz}: chybí selektor`, cislo);
      zkontrolujSelektor(zbytek, cislo);
      krok.sel = zbytek;
      break;
    case 'sel=hod': {
      const [sel, hod] = rozdelNaRovnitku(zbytek);
      if (!sel) throw new ChybaScenare(`${prikaz}: chybí selektor`, cislo);
      if (hod === null) throw new ChybaScenare(`${prikaz}: chybí „= hodnota“`, cislo);
      zkontrolujSelektor(sel, cislo);
      krok.sel = sel;
      krok.hodnota = S.oduvozovkuj(hod);
      break;
    }
    case 'sel[=hod]': {
      const [sel, hod] = rozdelNaRovnitku(zbytek);
      if (!sel) throw new ChybaScenare(`${prikaz}: chybí selektor`, cislo);
      if (!/^strom$/i.test(sel)) zkontrolujSelektor(sel, cislo);
      krok.sel = sel;
      if (hod !== null) krok.hodnota = S.oduvozovkuj(hod);
      break;
    }
    case 'jm=hod': {
      const [jm, hod] = rozdelNaRovnitku(zbytek);
      if (!jm || hod === null) throw new ChybaScenare(`${prikaz}: čekám „${prikaz} název = hodnota“`, cislo);
      if (!NAZEV_PROMENNE.test(jm)) throw new ChybaScenare(`${prikaz}: název „${jm}“ smí obsahovat jen písmena bez háčků, číslice a _`, cislo);
      krok.nazev = jm;
      if (prikaz === 'zapamatuj') {
        const r = oddelRegex(hod);
        if (r.chyba) throw new ChybaScenare(r.chyba, cislo);
        if (S.vypadaJakoSelektor(r.zbytek)) {
          zkontrolujSelektor(r.zbytek, cislo);
          krok.sel = r.zbytek;
          krok.regex = r.regex;
        } else {
          krok.hodnota = S.oduvozovkuj(hod);
        }
      } else {
        krok.hodnota = S.oduvozovkuj(hod);
      }
      break;
    }
    case 'cas': {
      const ms = prectiCas(zbytek);
      if (ms === null) throw new ChybaScenare(`${prikaz}: čekám číslo v ms (např. ${prikaz} 1000)`, cislo);
      krok.cislo = ms;
      break;
    }
    case 'text':
      rozeberText(krok, zbytek, cislo);
      break;
  }
  return krok;
}

function rozeberText(krok, zbytek, cislo) {
  const p = krok.prikaz;
  if (p === 'otevri') {
    if (!zbytek) throw new ChybaScenare('otevri: chybí adresa', cislo);
    krok.hodnota = S.oduvozovkuj(zbytek);
  } else if (p === 'pouzij') {
    const m = zbytek.match(/^(.+?)(?:\s+(\d+)\s*[x×])?$/i);
    if (!zbytek || !m) throw new ChybaScenare('pouzij: chybí název úseku', cislo);
    krok.usek = S.oduvozovkuj(m[1].trim()).replace(/\.txt$/i, '');
    krok.pocet = m[2] ? parseInt(m[2], 10) : 1;
    if (krok.pocet < 1 || krok.pocet > 500) throw new ChybaScenare('pouzij: počet opakování musí být 1–500', cislo);
  } else if (p === 'nova') {
    const slova = zbytek.split(/\s+/).filter(Boolean).map((s) => bezDiakritiky(s).toLowerCase());
    if (!slova.length) throw new ChybaScenare('nova: napiš co, např. „nova osoba“ nebo „nova firma“', cislo);
    krok.entita = slova[0];
    for (const s of slova.slice(1)) {
      const volba = s.match(/^([a-z_][a-z0-9_]*)=(.+)$/);
      if (volba) (krok.volby ||= {})[volba[1]] = volba[2];
      else if (s === 'muz' || s === 'm') krok.pohlavi = 'M';
      else if (s === 'zena' || s === 'z') krok.pohlavi = 'Z';
      else if (NAZEV_PROMENNE.test(s)) krok.instance = s;
      else throw new ChybaScenare(`nova: nerozumím „${s}“`, cislo);
    }
  } else if (p === 'dialogy') {
    const v = bezDiakritiky(zbytek).toLowerCase();
    if (v !== 'ano' && v !== 'ne') throw new ChybaScenare('dialogy: napiš „dialogy ano“ nebo „dialogy ne“', cislo);
    krok.ano = v === 'ano';
  } else if (p === 'rucne') {
    const i = zbytek.search(/\s+dokud\s+/i);
    if (i >= 0) {
      krok.pokyn = zbytek.slice(0, i).trim();
      krok.dokud = zbytek.slice(i).replace(/^\s+dokud\s+/i, '').trim();
      zkontrolujSelektor(krok.dokud, cislo);
    } else {
      krok.pokyn = zbytek;
    }
    if (!krok.pokyn) krok.pokyn = 'Proveď ruční zásah a dej Pokračovat';
  }
}

// Celý soubor → { popis, kroky, chyby }. Chyby nevyhazuje, sbírá je (editor je ukáže všechny naráz).
export function rozparsujScenar(text) {
  const radky = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  const kroky = [];
  const chyby = [];
  let popis = '';
  radky.forEach((r, i) => {
    const t = r.trim();
    if (!popis) {
      const m = t.match(/^#\s*popis\s*:\s*(.*)$/i);
      if (m) popis = m[1].trim();
    }
    try {
      const k = rozparsujRadek(r, i + 1);
      if (k) kroky.push(k);
    } catch (e) {
      chyby.push({ radek: e.radek || i + 1, zprava: e.message });
    }
  });
  return { popis, kroky, chyby };
}

export function popisScenare(text) {
  const m = String(text || '').match(/^\s*#\s*popis\s*:\s*(.*)$/im);
  return m ? m[1].trim() : '';
}
