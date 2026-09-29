// Dosazování proměnných {entita.vlastnost}, {funkce:arg}, {promenna} a kontext pro generátory.
// Sdílí background (přehrávání) i editor (kontrola, náhled dat).
import { entity, funkce } from '../generatory/index.js';
import { bezDiakritiky } from './dsl.js';

// ---------- náhoda ----------

export function nahodne(min, max) {
  const rozsah = max - min + 1;
  if (rozsah <= 0) return min;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % rozsah);
}

export function vyber(pole) {
  if (!pole || !pole.length) throw new Error('prázdný seznam');
  return pole[nahodne(0, pole.length - 1)];
}

const ZNAKY_KODU = 'ABCDEFGHJKLMNPRSTUVXYZ23456789';

function kod(delka) {
  let s = '';
  for (let i = 0; i < delka; i++) s += ZNAKY_KODU[nahodne(0, ZNAKY_KODU.length - 1)];
  return s;
}

export function datum(d) {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ---------- šablony ----------

// Najde {výrazy} v textu. „\{“ je obyčejná složená závorka.
export function najdiVyrazy(text) {
  const out = [];
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '{') {
      i++;
      continue;
    }
    if (s[i] !== '{') continue;
    const konec = s.indexOf('}', i + 1);
    if (konec < 0) break;
    out.push({ vyraz: s.slice(i + 1, konec).trim(), od: i, do: konec + 1 });
    i = konec;
  }
  return out;
}

export function dosad(text, vyhodnot) {
  if (text == null) return text;
  const s = String(text);
  let out = '';
  let pos = 0;
  for (const v of najdiVyrazy(s)) {
    out += s.slice(pos, v.od) + vyhodnot(v.vyraz);
    pos = v.do;
  }
  out += s.slice(pos);
  return out.replace(/\\\{/g, '{');
}

// {osoba.jmeno}, {osoba:zmocnenec.jmeno}, {firma.nazev:kratky}, {posledni.spz}, {cislo:1-9}, {spz}
export function rozeberVyraz(v) {
  const e = v.match(/^([A-Za-z_]\w*)(?::(\w+))?\.(\w+)(?::([\s\S]*))?$/);
  if (e && (entity[e[1]] || e[1] === 'posledni')) {
    return { druh: 'entita', entita: e[1], instance: e[2] || '', vlastnost: e[3], arg: e[4] };
  }
  const f = v.match(/^([A-Za-z_]\w*)(?::([\s\S]*))?$/);
  if (f) return { druh: 'nazev', nazev: f[1], arg: f[2] };
  return null;
}

// ---------- data ze složky data/ ----------

function radkySeznamu(text) {
  return String(text || '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r && r[0] !== '#');
}

// Kontext dat: seznamy z data/*.txt a vlastní seznamy/vzory z data/vlastni.txt.
export class Data {
  constructor(soubory = {}) {
    this.soubory = soubory;
    this.seznamy = {};
    this.vzory = {};
    for (const r of radkySeznamu(soubory['data/vlastni.txt'])) {
      const m = r.match(/^(seznam|vzor)\s+([A-Za-z_]\w*)\s*=\s?(.*)$/i);
      if (!m) continue;
      if (m[1].toLowerCase() === 'seznam') this.seznamy[m[2]] = m[3].split('|').map((s) => s.trim());
      else this.vzory[m[2]] = m[3].trim();
    }
    const self = this;
    this.ctx = {
      nahodne,
      vyber,
      datum,
      kod,
      bezDiakritiky,
      seznam: (nazev, vestaveny) => self.seznam(nazev, vestaveny),
      sablona: (text) => dosad(text, (v) => self.vyhodnotJednoduse(v, 0)),
    };
  }

  seznam(nazev, vestaveny) {
    const t = this.soubory[`data/${nazev}.txt`];
    const r = t != null ? radkySeznamu(t) : [];
    return r.length ? r : vestaveny;
  }

  // Funkce, vlastní seznamy a vzory – bez vazby na běh (šablony uvnitř generátorů, náhled v editoru).
  vyhodnotJednoduse(v, hloubka) {
    const r = rozeberVyraz(v);
    if (!r || r.druh !== 'nazev') throw new Error(`{${v}} tady nejde použít`);
    const x = this.vlastniNeboFunkce(r, (t) => dosad(t, (w) => this.vyhodnotJednoduse(w, hloubka + 1)), hloubka);
    if (x === undefined) throw new Error(`neznámá proměnná {${v}}`);
    return x;
  }

  vlastniNeboFunkce(r, dosadVzor, hloubka) {
    if (hloubka > 10) throw new Error('vzor se odkazuje sám na sebe');
    if (funkce[r.nazev]) return String(funkce[r.nazev].hodnota(r.arg, this.ctx));
    if (this.seznamy[r.nazev]) return vyber(this.seznamy[r.nazev]);
    if (this.vzory[r.nazev] != null) return dosadVzor(this.vzory[r.nazev]);
    return undefined;
  }

  // Všechno, co jde napsat do {…}, pro nápovědu a kontrolu v editoru.
  znameNazvy() {
    return {
      entity: Object.keys(entity),
      funkce: Object.keys(funkce),
      seznamy: Object.keys(this.seznamy),
      vzory: Object.keys(this.vzory),
    };
  }
}

// ---------- vyhodnocení v běhu ----------
//
// beh (serializovatelný, žije v chrome.storage.session):
//   globalni: { 'firma:': {...} }          entity společné pro celé spuštění
//   rozsahy[i].entita: { 'osoba:': {...} } lokální entity úseku
//   rozsahy[i].vlastni: { titul: 'Ing.' }  vlastní seznamy/vzory, stálé v rámci úseku
//   promenne, hodnoty (výstup), pocitadla, prefixy, posledni, korenJeUsek

function klicEntity(entita, instance) {
  return `${entita}:${instance || ''}`;
}

function pridelPrefix(beh, rozsah, entita, instance) {
  let zaklad;
  if (rozsah.rodic == null && !beh.korenJeUsek) {
    zaklad = instance || entita;
  } else {
    if (!rozsah.prefix) {
      beh.pocitadla[rozsah.nazev] = (beh.pocitadla[rozsah.nazev] || 0) + 1;
      rozsah.prefix = rozsah.nazev + beh.pocitadla[rozsah.nazev];
    }
    zaklad = rozsah.prefix + (instance ? '_' + instance : entita !== 'osoba' ? '_' + entita : '');
  }
  let p = zaklad;
  for (let k = 2; beh.prefixy.includes(p); k++) p = `${zaklad}_${k}`;
  beh.prefixy.push(p);
  return p;
}

// Vytvoří (nebo s nova=true přegeneruje) entitu v rozsahu a zapíše její hodnoty do výstupu.
export function ziskejEntitu(beh, rozsah, data, entita, instance, { nova = false, volby = {} } = {}) {
  const def = entity[entita];
  if (!def) throw new Error(`neznámý generátor „${entita}“ (znám: ${Object.keys(entity).join(', ')})`);
  const kontejner = def.lokalni ? (rozsah.entita ||= {}) : beh.globalni;
  const klic = klicEntity(entita, instance);
  if (!nova && kontejner[klic]) return kontejner[klic];
  const d = def.vytvor(data.ctx, volby);
  if (def.sber) {
    let hodnoty;
    if (def.lokalni) {
      hodnoty = def.sber(d, pridelPrefix(beh, rozsah, entita, instance));
    } else {
      hodnoty = {};
      for (const [k, v] of Object.entries(def.sber(d, instance))) hodnoty[instance ? `${instance}_${k}` : k] = v;
    }
    Object.assign(beh.hodnoty, hodnoty);
  }
  kontejner[klic] = d;
  return d;
}

export function vyhodnot(v, beh, rozsah, data, hloubka = 0) {
  const r = rozeberVyraz(v);
  if (!r) throw new Error(`nerozumím proměnné {${v}}`);
  if (r.druh === 'entita') {
    if (r.entita === 'posledni') {
      const x = beh.posledni && beh.posledni[r.vlastnost];
      if (x == null) throw new Error(`{posledni.${r.vlastnost}}: žádný úspěšný běh tuhle hodnotu nemá`);
      return String(x);
    }
    const def = entity[r.entita];
    const d = ziskejEntitu(beh, rozsah, data, r.entita, r.instance);
    if (def.vlastnost) {
      const x = def.vlastnost(d, r.vlastnost, r.arg, data.ctx);
      if (x !== undefined) return String(x);
    }
    if (r.vlastnost[0] === '_' || !(r.vlastnost in d)) {
      const zname = Object.keys(d).filter((k) => k[0] !== '_');
      throw new Error(`{${r.entita}.${r.vlastnost}}: neznámá vlastnost (znám: ${zname.join(', ')})`);
    }
    return String(d[r.vlastnost]);
  }
  if (r.arg === undefined && Object.prototype.hasOwnProperty.call(beh.promenne, r.nazev)) {
    return String(beh.promenne[r.nazev]);
  }
  // vlastní seznamy a vzory jsou v rámci úseku stálé, aby šla hodnota použít dvakrát
  if (r.arg === undefined && (data.seznamy[r.nazev] || data.vzory[r.nazev] != null)) {
    rozsah.vlastni ||= {};
    if (rozsah.vlastni[r.nazev] == null) {
      rozsah.vlastni[r.nazev] = data.vlastniNeboFunkce(r, (t) => dosad(t, (w) => vyhodnot(w, beh, rozsah, data, hloubka + 1)), hloubka);
    }
    return rozsah.vlastni[r.nazev];
  }
  const x = data.vlastniNeboFunkce(r, (t) => dosad(t, (w) => vyhodnot(w, beh, rozsah, data, hloubka + 1)), hloubka);
  if (x !== undefined) return x;
  if (entity[r.nazev]) throw new Error(`{${r.nazev}}: napiš i vlastnost, např. {${r.nazev}.${r.nazev === 'firma' ? 'nazev' : 'jmeno'}}`);
  throw new Error(`neznámá proměnná {${v}}`);
}

// Klíče výstupu, pod které se má uložit vyplněný text (např. „{firma.nazev} s.r.o.“ → nazev_firmy).
export function sledovaneKlice(text) {
  const out = [];
  for (const { vyraz } of najdiVyrazy(text)) {
    const r = rozeberVyraz(vyraz);
    if (!r || r.druh !== 'entita') continue;
    const def = entity[r.entita];
    if (def && def.sledujVyplneni && r.vlastnost.startsWith('nazev')) {
      out.push(r.instance ? `${r.instance}_${def.sledujVyplneni}` : def.sledujVyplneni);
    }
  }
  return out;
}

// Kontrola pro editor: vrátí text chyby, nebo null.
export function zkontrolujVyraz(v, data, znamePromenne = new Set()) {
  const r = rozeberVyraz(v);
  if (!r) return `nerozumím proměnné {${v}}`;
  if (r.druh === 'entita') {
    if (r.entita === 'posledni') return null;
    try {
      const d = entity[r.entita].vytvor(data.ctx, {});
      const def = entity[r.entita];
      if (def.vlastnost && def.vlastnost(d, r.vlastnost, r.arg, data.ctx) !== undefined) return null;
      if (!(r.vlastnost in d) || r.vlastnost[0] === '_') {
        return `{${r.entita}.${r.vlastnost}}: neznámá vlastnost (znám: ${Object.keys(d).filter((k) => k[0] !== '_').join(', ')})`;
      }
    } catch (e) {
      return e.message;
    }
    return null;
  }
  if (znamePromenne.has(r.nazev) || funkce[r.nazev] || data.seznamy[r.nazev] || data.vzory[r.nazev] != null) {
    if (funkce[r.nazev]) {
      try {
        funkce[r.nazev].hodnota(r.arg, data.ctx);
      } catch (e) {
        return e.message;
      }
    }
    return null;
  }
  if (entity[r.nazev]) return `{${r.nazev}}: napiš i vlastnost, např. {${r.nazev}.${r.nazev === 'firma' ? 'nazev' : 'jmeno'}}`;
  return `neznámá proměnná {${v}}`;
}
