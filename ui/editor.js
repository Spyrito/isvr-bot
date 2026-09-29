import * as U from '../lib/uloziste.js';
import { PRIKAZY, normalizujPrikaz, indexRovnitka, rozparsujRadek } from '../lib/dsl.js';
import { rozbal, jeScenar, jeUsek, najdiSoubor, NASTAVENI, VYCHOZI_NASTAVENI_TEXT } from '../lib/soubory.js';
import { Data, najdiVyrazy, zkontrolujVyraz, dosad, vyhodnot } from '../lib/promenne.js';
import { entity, funkce } from '../generatory/index.js';
import { jePlatneRc } from '../generatory/osoba.js';
import { jePlatneIco } from '../generatory/firma.js';
import { JMENA_MUZI, JMENA_ZENY, PRIJMENI, MESTA, ULICE } from '../generatory/seznamy.js';
import { rozparsujCsv } from '../lib/csv.js';
import { vytvorZip, prectiZip } from '../lib/zip.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const S = globalThis.KlikacSelektor;
const VYSKA_RADKU = 20;

const ta = $('text');
const pre = $('zvyrazneni');
const cisla = $('cisla');

let soubory = {};
let vystupy = [];
let aktualni = null; // cesta otevřeného souboru
let puvodni = ''; // text při načtení/uložení
let naDisku = null; // text ze složky, když se liší od puvodni
let oblibene = [];
let vysledkyKontroly = [];
let nahrady = [];
let cilTabId = null;

// ---------- složka ----------

async function obnovStavSlozky() {
  const s = await U.stav();
  $('slozka').textContent = s.rezim === 'slozka' ? `📁 ${s.slozka || 'Klikac'}` : '🗄 scénáře uložené v rozšíření';
  const p = $('pristup');
  if (s.rezim === 'slozka' && s.pristup === 'potvrdit') {
    p.innerHTML = `<span class="box var">Chrome potřebuje potvrdit přístup ke složce <button id="btn-povolit-hl" class="hl">Povolit přístup</button></span>`;
    $('btn-povolit-hl').onclick = povolit;
  } else if (s.rezim === 'slozka' && s.pristup !== 'ok') {
    p.innerHTML = `<span class="box chyba">Složka není dostupná <button id="btn-vybrat-hl">Vybrat složku</button></span>`;
    $('btn-vybrat-hl').onclick = vybratSlozku;
  } else p.innerHTML = '';
  return s;
}

async function povolit() {
  try {
    if (await U.povolPristup()) {
      await nactiSoubory();
      hlaska('Přístup ke složce povolen.');
    }
  } catch (e) {
    hlaska('Přístup se nepodařilo povolit: ' + e.message, true);
  }
  await obnovStavSlozky();
}

async function vybratSlozku() {
  if (!U.podporujeSlozku()) {
    hlaska('Tento Chrome neumí vybrat složku – scénáře zůstanou v rozšíření.', true);
    return;
  }
  try {
    const predtim = (await U.nactiVse()).soubory;
    const nazev = await U.vyberSlozku();
    await nactiSoubory();
    const scen = Object.keys(soubory).filter(jeScenar);
    if (!scen.length) {
      const zRozsireni = Object.keys(predtim).filter((c) => c !== NASTAVENI || !soubory[NASTAVENI]);
      if (zRozsireni.length && confirm(`Složka ${nazev} je prázdná. Zkopírovat do ní ${zRozsireni.length} souborů, které máš zatím v rozšíření?`)) {
        for (const c of zRozsireni) await U.zapis(c, predtim[c]);
      } else if (confirm('Vytvořit ve složce ukázkové scénáře?')) {
        await U.nahrajUkazky();
      }
      await nactiSoubory();
    }
    hlaska(`Pracovní složka: ${nazev}`);
  } catch (e) {
    if (e.name !== 'AbortError') hlaska('Složku se nepodařilo vybrat: ' + e.message, true);
  }
  await obnovStavSlozky();
  vykresliNastaveni();
}

// ---------- soubory ----------

async function nactiSoubory() {
  const r = await U.nactiVse();
  soubory = r.soubory;
  vystupy = await U.seznamVystupu();
  ({ oblibene = [] } = await chrome.storage.local.get('oblibene'));
  vykresliStrom();
  if (aktualni && !aktualni.startsWith('vystupy/')) {
    const t = soubory[aktualni];
    if (t == null) {
      // smazaný jinde
    } else if (t !== puvodni) {
      if (ta.value === puvodni) nastavText(t, true);
      else {
        naDisku = t;
        $('zmena-na-disku').classList.remove('skryte');
      }
    }
  }
  return r;
}

function zmeneno() {
  return aktualni && !aktualni.startsWith('vystupy/') && ta.value !== puvodni;
}

function vykresliStrom() {
  const q = $('filtr').value.trim().toLowerCase();
  const cesty = Object.keys(soubory).filter((c) => !q || c.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b, 'cs'));
  const skupiny = [
    ['zalozeni', 'Založení'],
    ['useky', 'Úseky'],
    ['data', 'Data'],
  ];
  let h = '';
  for (const [kor, nadpis] of skupiny) {
    const pol = cesty.filter((c) => c.startsWith(kor + '/'));
    h += `<h4><span>${nadpis}</span><button data-novy="${kor}" title="Nový soubor v ${kor}/">+</button></h4>`;
    const slozky = new Set();
    for (const c of pol) {
      const casti = c.split('/');
      for (let i = 1; i < casti.length - 1; i++) {
        const s = casti.slice(0, i + 1).join('/');
        if (!slozky.has(s)) {
          slozky.add(s);
          h += `<div class="uzel" style="--u:${i - 1}"><span class="adr">▾ ${esc(casti[i])}/</span></div>`;
        }
      }
      const jm = casti[casti.length - 1].replace(kor === 'data' ? /$^/ : /\.txt$/i, '');
      const hv = kor === 'useky' ? `<button class="hv ${oblibene.includes(c) ? 'on' : ''}" data-hvezda="${esc(c)}" title="Oblíbený – tlačítko v panelu">${oblibene.includes(c) ? '★' : '☆'}</button>` : '';
      h += `<div class="uzel ${c === aktualni ? 'akt' : ''}" style="--u:${casti.length - 2}" data-cesta="${esc(c)}" title="${esc(c)}">
        <span class="jm">${esc(jm)}${c === aktualni && zmeneno() ? ' <span class="zm">●</span>' : ''}</span>${hv}</div>`;
    }
    if (!pol.length) h += `<div class="uzel tlumeny" style="--u:0">${q ? '–' : 'prázdné'}</div>`;
  }
  if (!q || NASTAVENI.includes(q)) {
    h += `<h4><span>Nastavení</span></h4><div class="uzel ${aktualni === NASTAVENI ? 'akt' : ''}" style="--u:0" data-cesta="${NASTAVENI}"><span class="jm">nastaveni.txt</span></div>`;
  }
  h += `<h4><span>Výstupy</span></h4>`;
  h += vystupy.length
    ? vystupy.map((c) => `<div class="uzel ${c === aktualni ? 'akt' : ''}" style="--u:0" data-cesta="${esc(c)}"><span class="jm">${esc(c.slice(8))}</span></div>`).join('')
    : `<div class="uzel tlumeny" style="--u:0">zatím žádné</div>`;
  $('strom').innerHTML = h;
}

async function otevri(cesta, radek) {
  if (cesta !== aktualni && zmeneno() && !confirm(`Soubor ${aktualni} má neuložené změny. Zahodit je?`)) return;
  naDisku = null;
  $('zmena-na-disku').classList.add('skryte');
  aktualni = cesta;
  history.replaceState(null, '', '?soubor=' + encodeURIComponent(cesta));
  $('uvod').classList.add('skryte');
  $('nazev-souboru').textContent = cesta;
  const jeCsv = cesta.startsWith('vystupy/');
  $('editor').classList.toggle('skryte', jeCsv);
  $('csv').classList.toggle('skryte', !jeCsv);
  for (const id of ['btn-ulozit', 'btn-spustit', 'btn-krokovat', 'btn-odsud', 'btn-oblibeny', 'btn-prejmenovat', 'btn-smazat']) $(id).disabled = jeCsv;
  const scenar = jeScenar(cesta);
  for (const id of ['btn-spustit', 'btn-krokovat', 'btn-odsud']) $(id).disabled = !scenar;
  $('btn-oblibeny').classList.toggle('skryte', !jeUsek(cesta));
  $('btn-oblibeny').textContent = oblibene.includes(cesta) ? '★' : '☆';
  $('btn-smazat').disabled = jeCsv || cesta === NASTAVENI;
  $('btn-prejmenovat').disabled = jeCsv || cesta === NASTAVENI;
  if (jeCsv) {
    vykresliCsv(await U.ctiVystup(cesta));
  } else {
    let t = soubory[cesta];
    if (t == null) t = cesta === NASTAVENI ? VYCHOZI_NASTAVENI_TEXT : '';
    nastavText(t, true);
    if (radek) jdiNaRadek(radek);
    ta.focus();
  }
  vykresliStrom();
}

function nastavText(t, jakoUlozeny) {
  ta.value = t.replace(/\r\n/g, '\n');
  if (jakoUlozeny) puvodni = ta.value;
  poZmene();
}

async function ulozit() {
  if (!aktualni || aktualni.startsWith('vystupy/')) return true;
  try {
    const text = ta.value.replace(/\n/g, '\r\n'); // Poznámkový blok a Excel mají rádi CRLF
    await U.zapis(aktualni, text);
    soubory[aktualni] = text;
    puvodni = ta.value;
    naDisku = null;
    $('zmena-na-disku').classList.add('skryte');
    poZmene();
    hlaska('Uloženo');
    return true;
  } catch (e) {
    hlaska('Uložení se nepovedlo: ' + e.message, true);
    obnovStavSlozky();
    return false;
  }
}

function vykresliCsv(text) {
  const r = rozparsujCsv(text || '');
  if (!r.length) {
    $('csv').innerHTML = '<p class="tlumeny">Soubor je prázdný.</p>';
    return;
  }
  $('csv').innerHTML = `<div class="radek" style="margin-bottom:8px"><button id="btn-stahnout-csv">Stáhnout pro Excel</button>
      <span class="tlumeny">${r.length - 1} řádků</span></div>
    <table><thead><tr>${r[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${r.slice(1).reverse().map((x) => `<tr>${x.map((b) => `<td>${esc(b)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('btn-stahnout-csv').onclick = () => stahni(new Blob([text], { type: 'text/csv' }), aktualni.split('/').pop());
}

function stahni(blob, nazev) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nazev;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- zvýraznění syntaxe ----------

function obalRetezce(t) {
  return t
    .split(/("[^"]*")/)
    .map((c, i) => (i % 2 ? `<span class="k-str">${esc(c)}</span>` : esc(c)))
    .join('');
}

function zvyrazniText(s) {
  let out = '';
  let pos = 0;
  for (const v of najdiVyrazy(s)) {
    out += obalRetezce(s.slice(pos, v.od));
    const chybny = chybneVyrazy.has(v.vyraz);
    out += `<span class="${chybny ? 'k-var-chyba' : 'k-var'}">${esc(s.slice(v.od, v.do))}</span>`;
    pos = v.do;
  }
  return out + obalRetezce(s.slice(pos));
}

function zvyrazniSelektor(s) {
  const m = s.match(/^(\s*)(@\S+)?(\s*)((?:text|label|xpath|css):)?([\s\S]*)$/i);
  return esc(m[1]) + (m[2] ? `<span class="k-ram">${esc(m[2])}</span>` : '') + esc(m[3]) + (m[4] ? `<span class="k-typ">${esc(m[4])}</span>` : '') + zvyrazniText(m[5]);
}

function zvyrazniRadekScenare(r) {
  const m = r.match(/^(\s*)(\S*)(\s*)([\s\S]*)$/);
  if (!m[2]) return esc(r);
  if (m[2][0] === '#') return `<span class="k-kom${/^#\s*popis\s*:/i.test(r.trim()) ? ' k-popis' : ''}">${esc(r)}</span>`;
  const p = normalizujPrikaz(m[2]);
  const def = PRIKAZY[p];
  let h = esc(m[1]) + `<span class="${def ? 'k-prik' : 'k-nezn'}">${esc(m[2])}</span>` + esc(m[3]);
  const zb = m[4];
  if (!def) return h + esc(zb);
  if (def.arg === 'sel') return h + zvyrazniSelektor(zb);
  if (def.arg === 'cas') return h + `<span class="k-cis">${esc(zb)}</span>`;
  if (def.arg === 'sel=hod' || def.arg === 'jm=hod') {
    const i = indexRovnitka(zb);
    if (i < 0) return h + (def.arg === 'sel=hod' ? zvyrazniSelektor(zb) : esc(zb));
    const L = zb.slice(0, i);
    const R = zb.slice(i + 1);
    h += (def.arg === 'sel=hod' ? zvyrazniSelektor(L) : `<span class="k-ram">${esc(L)}</span>`) + '<span class="k-rov">=</span>';
    if (p === 'zapamatuj') {
      const rm = R.match(/^([\s\S]*?)(\s+\/(?:\\.|[^/\\])+\/[gimsuy]*\s*)$/);
      const hl = rm ? rm[1] : R;
      return h + (S.vypadaJakoSelektor(hl) ? zvyrazniSelektor(hl) : zvyrazniText(hl)) + (rm ? `<span class="k-regex">${esc(rm[2])}</span>` : '');
    }
    return h + zvyrazniText(R);
  }
  if (p === 'pouzij') return h + `<span class="k-usek" title="Ctrl+klik otevře úsek">${esc(zb)}</span>`;
  if (p === 'rucne') {
    const i = zb.search(/\s+dokud\s+/i);
    if (i < 0) return h + zvyrazniText(zb);
    const d = zb.slice(i).match(/^(\s+dokud\s+)([\s\S]*)$/i);
    return h + zvyrazniText(zb.slice(0, i)) + `<span class="k-prik">${esc(d[1])}</span>` + zvyrazniSelektor(d[2]);
  }
  return h + zvyrazniText(zb);
}

function zvyrazniRadekDat(r) {
  const t = r.trim();
  if (!t) return esc(r);
  if (t[0] === '#') return `<span class="k-kom">${esc(r)}</span>`;
  const m = r.match(/^(\s*)(seznam|vzor)(\s+)([A-Za-z_]\w*)(\s*=)([\s\S]*)$/i);
  if (m) return esc(m[1]) + `<span class="k-prik">${m[2]}</span>${m[3]}<span class="k-ram">${esc(m[4])}</span><span class="k-rov">${esc(m[5])}</span>` + zvyrazniText(m[6]);
  const n = r.match(/^(\s*[\wěščřžýáíéůú]+\s*)(=)([\s\S]*)$/i);
  if (n && aktualni === NASTAVENI) return `<span class="k-ram">${esc(n[1])}</span><span class="k-rov">=</span>${esc(n[3])}`;
  return zvyrazniText(r);
}

let chybneVyrazy = new Set();

function vykresliZvyrazneni() {
  const radky = ta.value.split('\n');
  const scenar = aktualni && jeScenar(aktualni);
  const chybneRadky = new Set(vysledkyKontroly.filter((c) => c.soubor === aktualni && c.uroven === 'chyba').map((c) => c.radek));
  pre.innerHTML =
    radky
      .map((r, i) => {
        const h = scenar ? zvyrazniRadekScenare(r) : zvyrazniRadekDat(r);
        return chybneRadky.has(i + 1) ? `<span class="r-chyba">${h}</span>` : h;
      })
      .join('\n') + '\n ';
  vykresliCisla(radky.length);
  srovnejPosun();
}

function vykresliCisla(pocet) {
  const u = new Map();
  for (const c of vysledkyKontroly) if (c.soubor === aktualni && u.get(c.radek) !== 'c') u.set(c.radek, c.uroven === 'chyba' ? 'c' : 'v');
  const kurzor = ta.value.slice(0, ta.selectionStart).split('\n').length;
  let h = '';
  for (let i = 1; i <= pocet; i++) {
    const t = u.get(i) || (i === kurzor ? 'kurzor' : '');
    h += (t ? `<span class="${t}">${i}</span>` : i) + '\n';
  }
  cisla.innerHTML = h + ' ';
}

function srovnejPosun() {
  pre.scrollTop = ta.scrollTop;
  pre.scrollLeft = ta.scrollLeft;
  cisla.scrollTop = ta.scrollTop;
}

function aktualizujPozici() {
  const pred = ta.value.slice(0, ta.selectionStart).split('\n');
  $('pozice').textContent = `Ř ${pred.length}, Sl ${pred[pred.length - 1].length + 1}`;
}

function jdiNaRadek(n) {
  const radky = ta.value.split('\n');
  let pos = 0;
  for (let i = 0; i < Math.min(n - 1, radky.length); i++) pos += radky[i].length + 1;
  ta.focus();
  ta.setSelectionRange(pos, pos + (radky[n - 1] || '').length);
  ta.scrollTop = Math.max(0, (n - 1) * VYSKA_RADKU - ta.clientHeight / 3);
  srovnejPosun();
  aktualizujPozici();
}

function radekKurzoru() {
  return ta.value.slice(0, ta.selectionStart).split('\n').length;
}

function vloz(text) {
  ta.focus();
  document.execCommand('insertText', false, text); // zachová Ctrl+Z
}

// ---------- kontrola ----------

let casovacKontroly = null;

function poZmene() {
  vykresliZvyrazneni();
  aktualizujPozici();
  $('zmeneno').classList.toggle('skryte', !zmeneno());
  clearTimeout(casovacKontroly);
  casovacKontroly = setTimeout(() => {
    zkontroluj();
    vykresliZvyrazneni();
  }, 250);
}

function zkontroluj() {
  vysledkyKontroly = [];
  chybneVyrazy = new Set();
  if (!aktualni) return vykresliKontrolu();
  const vse = { ...soubory, [aktualni]: ta.value };
  const data = new Data(vse);
  if (aktualni === 'data/vlastni.txt') {
    ta.value.split('\n').forEach((r, i) => {
      const t = r.trim();
      if (t && t[0] !== '#' && !/^(seznam|vzor)\s+[A-Za-z_]\w*\s*=/.test(t)) {
        vysledkyKontroly.push({ soubor: aktualni, radek: i + 1, uroven: 'chyba', zprava: 'čekám „seznam název = a|b|c“ nebo „vzor název = šablona“' });
      }
    });
  }
  if (jeScenar(aktualni)) {
    const r = rozbal(aktualni, vse);
    for (const c of r.chyby) vysledkyKontroly.push({ ...c, uroven: 'chyba' });
    const zname = new Set(r.kroky.filter((k) => k.prikaz === 'nastav' || k.prikaz === 'zapamatuj').map((k) => k.nazev));
    const videno = new Set();
    for (const k of r.kroky) {
      for (const pole of [k.sel, k.hodnota, k.pokyn, k.dokud]) {
        if (typeof pole !== 'string') continue;
        for (const { vyraz } of najdiVyrazy(pole)) {
          const e = zkontrolujVyraz(vyraz, data, zname);
          const klic = `${k.soubor}:${k.radek}:${vyraz}`;
          if (!e || videno.has(klic)) continue;
          videno.add(klic);
          const neznama = /^neznámá proměnná/.test(e);
          // v úseku může proměnnou nastavit scénář, který ho vkládá
          const uroven = neznama && jeUsek(aktualni) ? 'varovani' : 'chyba';
          vysledkyKontroly.push({ soubor: k.soubor, radek: k.radek, zprava: e + (uroven === 'varovani' ? ' – v pořádku, pokud ji nastaví scénář, který úsek vkládá' : ''), uroven });
          if (k.soubor === aktualni && uroven === 'chyba') chybneVyrazy.add(vyraz);
        }
      }
    }
    const prvni = r.kroky.find((k) => k.soubor === aktualni);
    if (aktualni.startsWith('zalozeni/') && prvni && prvni.prikaz !== 'otevri') {
      vysledkyKontroly.push({ soubor: aktualni, radek: prvni.radek, uroven: 'varovani', zprava: 'Celé založení obvykle začíná příkazem otevri (jinak běží na právě otevřené stránce).' });
    }
    if (r.kroky.length) vysledkyKontroly.info = `${r.kroky.length} kroků po rozbalení úseků`;
  }
  vykresliKontrolu();
}

function vykresliKontrolu() {
  const el = $('z-kontrola');
  const chyb = vysledkyKontroly.filter((c) => c.uroven === 'chyba').length;
  $('pocet-chyb').textContent = vysledkyKontroly.length ? `(${vysledkyKontroly.length})` : '';
  if (!aktualni) {
    el.innerHTML = '<p class="tlumeny">Otevři soubor.</p>';
    return;
  }
  el.innerHTML =
    (vysledkyKontroly.length
      ? vysledkyKontroly
          .map(
            (c, i) => `<div class="polozka box ${c.uroven === 'chyba' ? 'chyba' : 'var'}" data-i="${i}">
          <div class="kde">${c.soubor === aktualni ? 'ř. ' + c.radek : esc(c.soubor) + ':' + c.radek}</div>${esc(c.zprava)}</div>`,
          )
          .join('')
      : `<div class="box ok">✓ Bez chyb${vysledkyKontroly.info ? ' · ' + vysledkyKontroly.info : ''}</div>`) +
    (chyb ? '' : '') +
    `<p class="tlumeny" style="margin-top:14px">Dvojklik na řádek se selektorem ho zkusí najít na stránce aplikace.<br>Ctrl+klik na <code>pouzij</code> otevře vložený úsek.</p>`;
}

// ---------- nápověda ----------

function vykresliNapovedu() {
  const data = new Data(soubory);
  const sel = [
    ['#txtJmeno, [name="prijmeni"]', 'CSS selektor'],
    ['text:"Uložit"', 'tlačítko nebo odkaz s tímto textem; u cekej-na jakýkoli text'],
    ['label:"Příjmení"', 'pole u popisku (&lt;label&gt; nebo vedlejší buňka tabulky)'],
    ['xpath://td[2]/input', 'XPath pro obtížné případy'],
    ['@main #txtJmeno', 'hledá jen v rámci main (framesety), vnořené @a/b'],
  ];
  let h = `<h3>Příkazy</h3><table>${Object.values(PRIKAZY)
    .map((p) => `<tr><td><span class="vlozit" data-vloz="${esc(p.tvar.split(' / ')[0].split(' ')[0])} ">${esc(p.tvar)}</span></td><td>${esc(p.popis)}</td></tr>`)
    .join('')}</table>`;
  h += `<h3>Selektory</h3><table>${sel.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${b}</td></tr>`).join('')}</table>`;
  h += `<h3>Proměnné</h3><table>`;
  for (const [n, def] of Object.entries(entity)) {
    const d = def.vytvor(data.ctx, {});
    h += `<tr><td colspan="2"><b>${n}</b> <span class="tlumeny">– ${esc(def.popis || '')}${def.lokalni ? '' : ' (společná pro celé spuštění)'}</span></td></tr>`;
    h += Object.keys(d)
      .filter((k) => k[0] !== '_')
      .map((k) => `<tr><td><span class="vlozit" data-vloz="{${n}.${k}}">{${n}.${k}}</span></td><td class="tlumeny">${esc(d[k])}</td></tr>`)
      .join('');
    if (d._styly) h += `<tr><td><span class="vlozit" data-vloz="{${n}.nazev:prijmeni}">{${n}.nazev:prijmeni}</span></td><td class="tlumeny">${esc(d._styly.prijmeni)}</td></tr><tr><td><span class="vlozit" data-vloz="{${n}.nazev:kratky}">{${n}.nazev:kratky}</span></td><td class="tlumeny">${esc(d._styly.kratky)}</td></tr>`;
  }
  h += `<tr><td colspan="2"><b>obecné</b></td></tr>`;
  for (const [n, f] of Object.entries(funkce)) {
    h += `<tr><td><span class="vlozit" data-vloz="${esc((f.priklad || `{${n}}`).split(',')[0].trim())}">${esc(f.priklad || `{${n}}`)}</span></td><td class="tlumeny">${esc(f.popis || '')}</td></tr>`;
  }
  const { seznamy, vzory } = data.znameNazvy();
  if (seznamy.length || vzory.length) {
    h += `<tr><td colspan="2"><b>vlastní</b> <span class="tlumeny">– z data/vlastni.txt</span></td></tr>`;
    for (const n of [...seznamy, ...vzory]) h += `<tr><td><span class="vlozit" data-vloz="{${n}}">{${n}}</span></td><td class="tlumeny">${seznamy.includes(n) ? 'seznam' : 'vzor'}</td></tr>`;
  }
  h += `<tr><td><span class="vlozit" data-vloz="{posledni.spz}">{posledni.spz}</span></td><td class="tlumeny">hodnota z posledního úspěšného běhu</td></tr>`;
  h += `<tr><td><code>{osoba:zmocnenec.jmeno}</code></td><td class="tlumeny">pojmenovaná osoba (víc osob v jednom souboru)</td></tr>`;
  h += `<tr><td><code>\\{</code></td><td class="tlumeny">obyčejná složená závorka</td></tr></table>`;
  h += `<h3>Platnost dat</h3><p>osoba a adresa jsou lokální pro soubor – každé <code>pouzij Spolecnik</code> = nový člověk. firma a spolek jsou společné pro celé spuštění.
    <code>nova osoba</code> vygeneruje novou sadu ručně (<code>nova osoba zena</code>, <code>nova osoba zmocnenec muz</code>).</p>`;
  h += `<h3>Klávesy</h3><table>
    <tr><td>Ctrl+S</td><td>uložit</td></tr><tr><td>F5</td><td>spustit</td></tr><tr><td>Ctrl+Enter</td><td>spustit od řádku s kurzorem</td></tr>
    <tr><td>dvojklik</td><td>zkusit selektor na řádku</td></tr><tr><td>Ctrl+klik</td><td>otevřít úsek z pouzij</td></tr></table>`;
  $('z-napoveda').innerHTML = h;
}

// ---------- náhled dat ----------

function vykresliData() {
  const data = new Data(soubory);
  const beh = { promenne: {}, globalni: {}, hodnoty: {}, pocitadla: {}, prefixy: [], posledni: {} };
  const rozsah = { id: 0, rodic: null, nazev: 'nahled' };
  let h = `<div class="radek" style="margin-bottom:10px"><button id="btn-znovu-data" class="hl">Vygenerovat znovu</button><span class="tlumeny">klik na proměnnou ji vloží do scénáře</span></div>`;
  for (const [n, def] of Object.entries(entity)) {
    const d = def.vytvor(data.ctx, {});
    h += `<div class="data-sada"><b>${n}</b><table>${Object.keys(d)
      .filter((k) => k[0] !== '_')
      .map((k) => `<tr><td><span class="vlozit" data-vloz="{${n}.${k}}">${k}</span></td><td>${esc(d[k])}</td></tr>`)
      .join('')}</table></div>`;
  }
  const { seznamy, vzory } = data.znameNazvy();
  const vlastni = [...seznamy, ...vzory];
  if (vlastni.length) {
    h += `<div class="data-sada"><b>vlastní</b><table>${vlastni
      .map((n) => {
        let v;
        try {
          v = dosad(`{${n}}`, (x) => vyhodnot(x, beh, rozsah, data));
        } catch (e) {
          v = '⚠ ' + e.message;
        }
        return `<tr><td><span class="vlozit" data-vloz="{${n}}">${n}</span></td><td>${esc(v) || '<span class="tlumeny">(prázdné)</span>'}</td></tr>`;
      })
      .join('')}</table></div>`;
  }
  $('z-data').innerHTML = h;
  $('btn-znovu-data').onclick = vykresliData;
}

// ---------- náhrady po nahrání ----------

const JMENA = new Set([...JMENA_MUZI, ...JMENA_ZENY]);
const PRIJMENI_VSE = new Set(PRIJMENI.flatMap((p) => p.split('|')));
const MESTA_VSE = new Set(MESTA.map((m) => m.split('|')[0]));
const ULICE_VSE = new Set(ULICE);

function navrhni(h, sel) {
  if (/^\d{6}\/\d{3,4}$/.test(h) && jePlatneRc(h)) return ['{osoba.rc_lomitko}', 'rodné číslo'];
  if (/^\d{9,10}$/.test(h) && jePlatneRc(h) && (h.length === 10 || /rc|rodn/i.test(sel))) return ['{osoba.rc}', 'rodné číslo'];
  if (/^\d{8}$/.test(h) && jePlatneIco(h)) return ['{firma.ico}', 'IČO'];
  if (/^CZ\d{8}$/i.test(h)) return ['{firma.dic}', 'DIČ'];
  if (/^\d{1,2}\.\s?\d{1,2}\.\s?\d{4}$/.test(h)) return ['{osoba.datum_nar}', 'datum'];
  if (/^\d{3}\s?\d{2}$/.test(h) && /ps[cč]|zip/i.test(sel)) return ['{adresa.psc}', 'PSČ'];
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(h)) return ['{osoba.email}', 'e-mail'];
  if (/^(\+420\s?)?[67]\d{2}\s?\d{3}\s?\d{3}$/.test(h)) return ['{osoba.telefon}', 'telefon'];
  if (JMENA.has(h)) return ['{osoba.jmeno}', 'křestní jméno'];
  if (PRIJMENI_VSE.has(h)) return ['{osoba.prijmeni}', 'příjmení'];
  if (MESTA_VSE.has(h)) return ['{adresa.mesto}', 'město'];
  if (ULICE_VSE.has(h)) return ['{adresa.ulice}', 'ulice'];
  const f = h.match(/^(.+?)(,?\s+(s\.\s?r\.\s?o\.|spol\. s r\. o\.|a\.\s?s\.|v\.\s?o\.\s?s\.|k\.\s?s\.))$/i);
  if (f) return [`{firma.nazev}${f[2]}`, 'název firmy'];
  return null;
}

function najdiNahrady() {
  nahrady = [];
  if (!aktualni || !jeScenar(aktualni)) return vykresliNahrady();
  ta.value.split('\n').forEach((r, i) => {
    let k;
    try {
      k = rozparsujRadek(r, i + 1);
    } catch {
      return;
    }
    if (!k || !['vypln', 'pis', 'vyber'].includes(k.prikaz) || k.hodnota == null) return;
    const h = k.hodnota.trim();
    if (!h || h.includes('{')) return;
    const n = navrhni(h, k.sel);
    if (n) nahrady.push({ radek: i + 1, hodnota: h, promenna: n[0], duvod: n[1] });
  });
  vykresliNahrady();
}

function vykresliNahrady() {
  $('pocet-nahrad').textContent = nahrady.length ? `(${nahrady.length})` : '';
  const el = $('z-nahrady');
  el.innerHTML =
    `<p class="tlumeny">Hodnoty zapsané při nahrávání jdou nahradit proměnnými, aby každé spuštění dalo nová data. Každou náhradu potvrď zvlášť.</p>
    <div class="radek" style="margin-bottom:10px"><button id="btn-hledat-nahrady">Hledat znovu</button></div>` +
    (nahrady.length
      ? nahrady
          .map(
            (n, i) => `<div class="nahrada"><div><b>ř. ${n.radek}</b> <span class="tlumeny">${esc(n.duvod)}</span></div>
          <div><code>${esc(n.hodnota)}</code> → <code>${esc(n.promenna)}</code></div>
          <div class="radek"><button class="hl" data-nahradit="${i}">Nahradit</button><button data-preskocit="${i}">Nechat</button><button data-radek="${n.radek}">Ukázat</button></div></div>`,
          )
          .join('')
      : '<div class="box ok">Žádné další náhrady.</div>');
  $('btn-hledat-nahrady').onclick = najdiNahrady;
}

function nahrad(i) {
  const n = nahrady[i];
  const radky = ta.value.split('\n');
  const r = radky[n.radek - 1] || '';
  const pozRovna = indexRovnitka(r);
  const idx = r.lastIndexOf(n.hodnota);
  if (idx < 0 || idx < pozRovna) {
    hlaska('Řádek se mezitím změnil.', true);
    return najdiNahrady();
  }
  let start = 0;
  for (let j = 0; j < n.radek - 1; j++) start += radky[j].length + 1;
  ta.focus();
  ta.setSelectionRange(start + idx, start + idx + n.hodnota.length);
  vloz(n.promenna);
  nahrady.splice(i, 1);
  vykresliNahrady();
}

// ---------- spouštění ----------

async function spust(volby) {
  if (!aktualni || !jeScenar(aktualni)) return;
  if (zmeneno() && !(await ulozit())) return;
  const r = await chrome.runtime.sendMessage({ typ: 'spust', naCilove: true, soubor: aktualni, ...volby });
  if (!r || !r.ok) {
    stavBehu(r?.chyba || 'Nepodařilo se spustit.', 'chyba');
    if (r && r.chyby) {
      vysledkyKontroly = r.chyby.map((c) => ({ ...c, uroven: 'chyba' }));
      vykresliKontrolu();
      prepniZalozku('kontrola');
    }
  } else stavBehu('Spuštěno…');
  obnovCil();
}

function stavBehu(text, trida = '') {
  const el = $('stav-behu');
  el.textContent = text;
  el.className = 'stav-behu ' + trida;
}

async function obnovCil() {
  const t = await chrome.runtime.sendMessage({ typ: 'cilova-zalozka' }).catch(() => null);
  cilTabId = t ? t.id : null;
  $('cil').textContent = t ? `Cíl: ${t.title || t.url}` : 'Cíl: žádná stránka aplikace není otevřená';
}

async function obnovStavBehu() {
  if (cilTabId == null) return;
  const p = await chrome.runtime.sendMessage({ typ: 'pohled', tabId: cilTabId }).catch(() => null);
  if (!p) return;
  const b = p.beh;
  if (b) {
    const st = { bezi: 'běží', krokovani: 'krokování', chyba: 'chyba', rucne: 'ruční zásah' }[b.stav] || b.stav;
    stavBehu(`${b.nazev}: ${st} (krok ${Math.min(b.pc + 1, b.celkem)}/${b.celkem})${b.chyba ? ' – ' + b.chyba.soubor + ':' + b.chyba.radek + ' ' + b.chyba.zprava : ''}`, b.stav === 'chyba' ? 'chyba' : '');
  } else if (p.vysledek) {
    const v = p.vysledek;
    stavBehu(`${v.nazev}: ${v.vysledek}${v.zprava ? ' – ' + v.zprava : ''}`, v.vysledek === 'OK' ? 'ok' : 'chyba');
    if (aktualni && aktualni.startsWith('vystupy/')) otevri(aktualni);
  }
}

// ---------- dialogy ----------

function dialogNovy({ nadpis = 'Nový soubor', slozka = 'useky', nazev = '' } = {}) {
  const d = $('dlg-novy');
  $('dlg-novy-nadpis').textContent = nadpis;
  d.querySelector('[name=slozka]').value = slozka;
  d.querySelector('[name=nazev]').value = nazev;
  d.showModal();
  d.querySelector('[name=nazev]').select();
  return new Promise((ok) => {
    d.onclose = () => {
      if (d.returnValue !== 'ok') return ok(null);
      const s = d.querySelector('[name=slozka]').value;
      let n = d.querySelector('[name=nazev]').value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (!n) return ok(null);
      if (!/\.txt$/i.test(n)) n += '.txt';
      ok(`${s}/${n}`);
    };
  });
}

const SABLONY = {
  zalozeni: '# popis: \notevri    /Subjekty/Novy.aspx\n',
  useky: '# popis: \n',
  data: '# jedno slovo nebo vzor na řádek\n',
};

async function novySoubor(slozka) {
  if (zmeneno() && !confirm('Zahodit neuložené změny?')) return;
  const cesta = await dialogNovy({ slozka });
  if (!cesta) return;
  if (soubory[cesta] != null) return hlaska(`${cesta} už existuje.`, true);
  try {
    const text = SABLONY[cesta.split('/')[0]] || '';
    await U.zapis(cesta, text);
    soubory[cesta] = text;
    puvodni = ta.value; // nic k zahození
    await otevri(cesta);
    ta.setSelectionRange(10, 10);
  } catch (e) {
    hlaska(e.message, true);
  }
}

async function prejmenovat() {
  if (!aktualni || aktualni === NASTAVENI) return;
  const [slozka, ...zbytek] = aktualni.split('/');
  const cil = await dialogNovy({ nadpis: 'Přejmenovat / přesunout', slozka, nazev: zbytek.join('/').replace(/\.txt$/i, '') });
  if (!cil || cil === aktualni) return;
  try {
    if (zmeneno()) await ulozit();
    await U.prejmenuj(aktualni, cil);
    if (oblibene.includes(aktualni)) {
      oblibene = oblibene.map((o) => (o === aktualni ? cil : o));
      await chrome.storage.local.set({ oblibene });
    }
    await nactiSoubory();
    puvodni = ta.value;
    await otevri(cil);
    hlaska('Přejmenováno. Odkazy „pouzij“ v jiných scénářích uprav ručně.');
  } catch (e) {
    hlaska(e.message, true);
  }
}

async function smazat() {
  if (!aktualni || aktualni === NASTAVENI) return;
  if (!confirm(`Opravdu smazat ${aktualni}?`)) return;
  try {
    await U.smaz(aktualni);
    await nactiSoubory();
    aktualni = null;
    puvodni = ta.value = '';
    $('nazev-souboru').textContent = '—';
    $('uvod').classList.remove('skryte');
    $('editor').classList.add('skryte');
    vykresliStrom();
    zkontroluj();
  } catch (e) {
    hlaska(e.message, true);
  }
}

async function prepniOblibeny(cesta) {
  oblibene = oblibene.includes(cesta) ? oblibene.filter((o) => o !== cesta) : [...oblibene, cesta];
  await chrome.storage.local.set({ oblibene });
  if (cesta === aktualni) $('btn-oblibeny').textContent = oblibene.includes(cesta) ? '★' : '☆';
  vykresliStrom();
}

async function vykresliNastaveni() {
  const s = await U.stav();
  const podpora = U.podporujeSlozku();
  $('nast-stav').innerHTML =
    s.rezim === 'slozka'
      ? `Scénáře se čtou ze složky <b>${esc(s.slozka)}</b>. ${s.pristup === 'ok' ? 'Přístup je povolený.' : 'Přístup je potřeba potvrdit.'}`
      : `Scénáře jsou uložené uvnitř rozšíření. ${podpora ? 'Doporučuji vybrat složku (např. Dokumenty\\Klikac).' : 'Tento Chrome neumí vybrat složku.'}`;
  $('btn-vybrat-slozku').disabled = !podpora;
  $('btn-povolit').classList.toggle('skryte', !(s.rezim === 'slozka' && s.pristup === 'potvrdit'));
  $('btn-interni').classList.toggle('skryte', s.rezim !== 'slozka');
}

function hlasNast(text, chyba = false) {
  $('nast-hlaska').innerHTML = `<div class="box ${chyba ? 'chyba' : 'ok'}">${esc(text)}</div>`;
}

async function importuj(files) {
  let n = 0;
  try {
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        const obsah = await prectiZip(await f.arrayBuffer());
        for (const [c, t] of Object.entries(obsah)) {
          const cesta = c.replace(/^Klikac\//i, '');
          if (!/^(zalozeni|useky|data)\/.+\.txt$|^nastaveni\.txt$/i.test(cesta)) continue;
          if (soubory[cesta] != null && soubory[cesta] !== t && !confirm(`${cesta} už existuje. Přepsat?`)) continue;
          await U.zapis(cesta, t);
          n++;
        }
      } else {
        const t = await f.text();
        const prvni = t.split(/\r?\n/).map((r) => r.trim()).find((r) => r && r[0] !== '#') || '';
        const slozka = /^otev[rř]i\b/i.test(prvni) ? 'zalozeni' : 'useky';
        const cesta = f.name.toLowerCase() === 'nastaveni.txt' ? NASTAVENI : `${slozka}/${f.name}`;
        if (soubory[cesta] != null && !confirm(`${cesta} už existuje. Přepsat?`)) continue;
        await U.zapis(cesta, t);
        n++;
      }
    }
    await nactiSoubory();
    hlasNast(`Importováno ${n} souborů.`);
  } catch (e) {
    hlasNast('Import se nepovedl: ' + e.message, true);
  }
}

async function exportuj() {
  const { soubory: vse } = await U.nactiVse();
  const out = {};
  for (const [c, t] of Object.entries(vse)) out['Klikac/' + c] = t;
  for (const c of await U.seznamVystupu()) {
    const t = await U.ctiVystup(c);
    if (t != null) out['Klikac/' + c] = t;
  }
  const d = new Date();
  stahni(vytvorZip(out), `Klikac-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.zip`);
  hlasNast(`Exportováno ${Object.keys(out).length} souborů.`);
}

// ---------- drobnosti ----------

let casovacHlasky = null;
function hlaska(text, chyba = false) {
  stavBehu(text, chyba ? 'chyba' : 'ok');
  clearTimeout(casovacHlasky);
  if (!chyba) casovacHlasky = setTimeout(() => stavBehu(''), 4000);
}

function prepniZalozku(z) {
  for (const b of document.querySelectorAll('.zalozky button')) b.classList.toggle('akt', b.dataset.z === z);
  for (const el of document.querySelectorAll('.zal')) el.classList.toggle('skryte', el.id !== 'z-' + z);
  if (z === 'napoveda') vykresliNapovedu();
  if (z === 'data') vykresliData();
  if (z === 'nahrady') najdiNahrady();
}

async function zkusSelektor() {
  let k;
  try {
    k = rozparsujRadek(ta.value.split('\n')[radekKurzoru() - 1] || '', radekKurzoru());
  } catch {
    return;
  }
  const sel = k && (k.sel || k.dokud);
  if (!sel) return;
  if (najdiVyrazy(sel).length) return hlaska('Selektor obsahuje proměnnou – vyzkouší se až při běhu.', true);
  const r = await chrome.runtime.sendMessage({ typ: 'zkus-selektor', sel });
  if (r && r.ok) hlaska(`Nalezeno a zvýrazněno na stránce: ${r.pocet} ${r.pocet === 1 ? 'prvek' : r.pocet < 5 ? 'prvky' : 'prvků'}`);
  else hlaska(`Selektor ${sel}: ${r?.chyba || 'nic nenalezeno'}`, true);
}

// ---------- události ----------

ta.addEventListener('input', () => {
  poZmene();
  vykresliStrom();
});
ta.addEventListener('scroll', srovnejPosun);
for (const u of ['click', 'keyup', 'select']) ta.addEventListener(u, () => {
  aktualizujPozici();
  vykresliCisla(ta.value.split('\n').length);
});
ta.addEventListener('dblclick', (e) => {
  e.preventDefault();
  zkusSelektor();
});
ta.addEventListener('click', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const r = ta.value.split('\n')[radekKurzoru() - 1] || '';
  let k;
  try {
    k = rozparsujRadek(r, 1);
  } catch {
    return;
  }
  if (k && k.prikaz === 'pouzij') {
    const cil = najdiSoubor(k.usek, aktualni, soubory);
    if (cil) otevri(cil);
    else hlaska(`Úsek „${k.usek}“ nenalezen.`, true);
  }
});
ta.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    const radek = ta.value.slice(0, ta.selectionStart).split('\n').pop();
    const sirka = 10 - (radek.length % 10);
    vloz(' '.repeat(sirka || 10));
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    ulozit();
  } else if (e.key === 'F5') {
    e.preventDefault();
    spust({});
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    spust({ odRadku: radekKurzoru() });
  }
});

$('strom').addEventListener('click', (e) => {
  const hv = e.target.closest('[data-hvezda]');
  if (hv) return prepniOblibeny(hv.dataset.hvezda);
  const n = e.target.closest('[data-novy]');
  if (n) return novySoubor(n.dataset.novy);
  const u = e.target.closest('[data-cesta]');
  if (u) otevri(u.dataset.cesta);
});
$('filtr').addEventListener('input', vykresliStrom);
$('btn-novy').onclick = () => novySoubor(aktualni && /^(zalozeni|useky|data)\//.test(aktualni) ? aktualni.split('/')[0] : 'useky');
$('btn-ulozit').onclick = ulozit;
$('btn-spustit').onclick = () => spust({});
$('btn-krokovat').onclick = () => spust({ krokovat: true });
$('btn-odsud').onclick = () => spust({ odRadku: radekKurzoru() });
$('btn-oblibeny').onclick = () => aktualni && prepniOblibeny(aktualni);
$('btn-prejmenovat').onclick = prejmenovat;
$('btn-smazat').onclick = smazat;
$('btn-historie').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('ui/historie.html') });
$('btn-nacist-disk').onclick = () => {
  if (naDisku != null) nastavText(naDisku, true);
  naDisku = null;
  $('zmena-na-disku').classList.add('skryte');
};
$('btn-nechat').onclick = () => {
  puvodni = naDisku ?? puvodni;
  naDisku = null;
  $('zmena-na-disku').classList.add('skryte');
  poZmene();
};
document.querySelector('.zalozky').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-z]');
  if (b) prepniZalozku(b.dataset.z);
});
$('bok').addEventListener('click', (e) => {
  const v = e.target.closest('[data-vloz]');
  if (v && aktualni && !aktualni.startsWith('vystupy/')) return vloz(v.dataset.vloz);
  const k = e.target.closest('.polozka[data-i]');
  if (k) {
    const c = vysledkyKontroly[Number(k.dataset.i)];
    if (c.soubor === aktualni) jdiNaRadek(c.radek);
    else otevri(c.soubor, c.radek);
  }
  const nh = e.target.closest('[data-nahradit]');
  if (nh) nahrad(Number(nh.dataset.nahradit));
  const ps = e.target.closest('[data-preskocit]');
  if (ps) {
    nahrady.splice(Number(ps.dataset.preskocit), 1);
    vykresliNahrady();
  }
  const ur = e.target.closest('[data-radek]');
  if (ur) jdiNaRadek(Number(ur.dataset.radek));
});

$('btn-nastaveni').onclick = () => {
  $('nast-hlaska').innerHTML = '';
  vykresliNastaveni();
  $('dlg-nastaveni').showModal();
};
$('btn-zavrit-nast').onclick = () => $('dlg-nastaveni').close();
$('btn-vybrat-slozku').onclick = vybratSlozku;
$('btn-povolit').onclick = async () => {
  await povolit();
  vykresliNastaveni();
};
$('btn-interni').onclick = async () => {
  if (!confirm('Přepnout na úložiště v rozšíření? Poslední načtená verze scénářů zůstane k dispozici, složka se přestane používat.')) return;
  await U.prepniNaInterni();
  await nactiSoubory();
  await obnovStavSlozky();
  vykresliNastaveni();
};
$('btn-import').onclick = () => $('import-soubor').click();
$('import-soubor').onchange = (e) => {
  importuj([...e.target.files]);
  e.target.value = '';
};
$('btn-export').onclick = exportuj;
$('btn-ukazky').onclick = async () => {
  try {
    const n = await U.nahrajUkazky();
    await nactiSoubory();
    hlasNast(n ? `Přidáno ${n} ukázkových souborů.` : 'Ukázky už jsou všechny ve složce.');
  } catch (e) {
    hlasNast(e.message, true);
  }
};
$('btn-zkratky').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });

window.addEventListener('beforeunload', (e) => {
  if (zmeneno()) e.preventDefault();
});
window.addEventListener('focus', async () => {
  await obnovStavSlozky();
  await nactiSoubory();
  obnovCil();
});

chrome.runtime.onMessage.addListener((z) => {
  if (!z) return;
  if (z.typ === 'editor-otevri') {
    nactiSoubory().then(() => {
      otevri(z.soubor);
      if (z.nahrady) prepniZalozku('nahrady');
    });
  } else if (z.typ === 'zmena-stavu' && z.tabId === cilTabId) obnovStavBehu();
});

// ---------- start ----------

(async () => {
  await obnovStavSlozky();
  await nactiSoubory();
  obnovCil();
  const q = new URLSearchParams(location.search);
  const s = q.get('soubor');
  if (s && (soubory[s] != null || s.startsWith('vystupy/') || s === NASTAVENI)) await otevri(s);
  else {
    $('editor').classList.add('skryte');
    zkontroluj();
  }
  if (q.get('nahrady')) prepniZalozku('nahrady');
})();
