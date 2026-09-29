// CSV pro Excel: středníky, UTF-8 s BOM, CRLF. Hlavička se rozšiřuje o nové sloupce,
// starší řádky dostanou prázdné hodnoty.

export const PEVNE_SLOUPCE = ['čas', 'scénář', 'výsledek'];

export function rozparsujCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const radky = [];
  let radek = [];
  let pole = '';
  let uvoz = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (uvoz) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          pole += '"';
          i++;
        } else uvoz = false;
      } else pole += c;
    } else if (c === '"') uvoz = true;
    else if (c === ';') {
      radek.push(pole);
      pole = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      radek.push(pole);
      radky.push(radek);
      radek = [];
      pole = '';
    } else pole += c;
  }
  if (pole !== '' || radek.length) {
    radek.push(pole);
    radky.push(radek);
  }
  return radky;
}

function bunka(v) {
  const s = v == null ? '' : String(v);
  return /[;"\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function vytvorCsv(radky) {
  return '﻿' + radky.map((r) => r.map(bunka).join(';')).join('\r\n') + '\r\n';
}

export function casProCsv(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function nazevVystupu(d = new Date()) {
  return `vystupy/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.csv`;
}

// Přidá záznam { cas, scenar, vysledek, hodnoty } do existujícího CSV (může být prázdné).
export function pridejRadek(existujici, zaznam) {
  const radky = rozparsujCsv(existujici).filter((r) => r.some((b) => b !== ''));
  let hlavicka = radky.length ? radky.shift() : [...PEVNE_SLOUPCE];
  for (const s of PEVNE_SLOUPCE) if (!hlavicka.includes(s)) hlavicka.unshift(s);
  for (const k of Object.keys(zaznam.hodnoty || {})) if (!hlavicka.includes(k)) hlavicka.push(k);
  const hodnoty = { čas: zaznam.cas, scénář: zaznam.scenar, výsledek: zaznam.vysledek, ...zaznam.hodnoty };
  const doplnene = radky.map((r) => hlavicka.map((_, i) => (r[i] == null ? '' : r[i])));
  doplnene.push(hlavicka.map((h) => (hodnoty[h] == null ? '' : hodnoty[h])));
  return vytvorCsv([hlavicka, ...doplnene]);
}
