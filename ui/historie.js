import * as U from '../lib/uloziste.js';
import { vytvorCsv } from '../lib/csv.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let historie = [];
let filtr = [];
let vybrany = null;

// chrome.storage vrací klíče seřazené abecedně, pořadí z běhu je v h.poradi
function hodnoty(h) {
  const o = h.hodnoty || {};
  const klice = h.poradi || Object.keys(o);
  return [...klice.filter((k) => k in o), ...Object.keys(o).filter((k) => !klice.includes(k))].map((k) => [k, o[k]]);
}

function trida(v) {
  return v === 'OK' ? 'ok' : /^chyba/.test(v) ? 'chyba' : 'jine';
}

function denZ(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filtruj() {
  const sc = $('f-scenar').value;
  const vy = $('f-vysledek').value;
  const od = $('f-od').value;
  const do_ = $('f-do').value;
  const q = $('f-text').value.trim().toLowerCase();
  filtr = historie.filter((h) => {
    if (sc && h.scenar !== sc) return false;
    if (vy === 'OK' && h.vysledek !== 'OK') return false;
    if (vy === 'chyba' && h.vysledek === 'OK') return false;
    const den = denZ(h.ts);
    if (od && den < od) return false;
    if (do_ && den > do_) return false;
    if (q && !Object.values(h.hodnoty || {}).join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  $('pocet').textContent = `${filtr.length} z ${historie.length}`;
  $('prazdno').classList.toggle('skryte', filtr.length > 0);
  $('radky').innerHTML = filtr
    .map(
      (h, i) => `<tr data-i="${i}" class="${h === vybrany ? 'vyb' : ''}"><td>${esc(h.cas)}</td><td>${esc(h.scenar)}</td>
      <td><span class="vys ${trida(h.vysledek)}">${esc(h.vysledek)}</span></td>
      <td class="hodn">${esc(hodnoty(h).map(([k, v]) => `${k}: ${v}`).join(' · '))}</td></tr>`,
    )
    .join('');
}

function detail(h) {
  vybrany = h;
  const hod = hodnoty(h);
  $('detail').innerHTML = `<h3>${esc(h.scenar)}</h3>
    <div class="tlumeny" style="margin-bottom:8px">${esc(h.cas)} · <span class="vys ${trida(h.vysledek)}">${esc(h.vysledek)}</span></div>
    ${hod.length ? `<div class="det">${hod.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span><button data-kop="${esc(v)}" title="Kopírovat">⧉</button>`).join('')}</div>` : '<p class="tlumeny">Bez hodnot.</p>'}
    <div class="radek" style="margin-top:10px"><button id="kop-vse">Kopírovat vše</button></div>`;
  $('kop-vse').onclick = () => navigator.clipboard.writeText(hod.map(([k, v]) => `${k}\t${v}`).join('\n'));
  filtruj();
}

async function nactiVystupy() {
  const seznam = await U.seznamVystupu();
  $('vystupy').innerHTML = seznam.length
    ? `<h3>Soubory výstupů</h3>${seznam.map((c) => `<a data-csv="${esc(c)}">${esc(c)}</a>`).join('')}`
    : '';
}

async function nacti() {
  ({ historie = [] } = await chrome.storage.local.get('historie'));
  const scenare = [...new Set(historie.map((h) => h.scenar))].sort((a, b) => a.localeCompare(b, 'cs'));
  const sel = $('f-scenar');
  const puv = sel.value;
  sel.innerHTML = '<option value="">všechny scénáře</option>' + scenare.map((s) => `<option>${esc(s)}</option>`).join('');
  sel.value = puv;
  filtruj();
}

for (const id of ['f-scenar', 'f-vysledek', 'f-od', 'f-do', 'f-text']) $(id).addEventListener('input', filtruj);
$('radky').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-i]');
  if (tr) detail(filtr[Number(tr.dataset.i)]);
});
$('detail').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kop]');
  if (b) navigator.clipboard.writeText(b.dataset.kop).then(() => (b.textContent = '✓'));
});
$('vystupy').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-csv]');
  if (!a) return;
  const t = await U.ctiVystup(a.dataset.csv);
  if (t == null) return;
  const url = URL.createObjectURL(new Blob([t], { type: 'text/csv' }));
  const l = document.createElement('a');
  l.href = url;
  l.download = a.dataset.csv.split('/').pop();
  l.click();
});
$('btn-export').onclick = () => {
  const klice = [...new Set(filtr.flatMap((h) => hodnoty(h).map(([k]) => k)))];
  const radky = [['čas', 'scénář', 'výsledek', ...klice], ...filtr.map((h) => [h.cas, h.scenar, h.vysledek, ...klice.map((k) => (h.hodnoty || {})[k] ?? '')])];
  const l = document.createElement('a');
  l.href = URL.createObjectURL(new Blob([vytvorCsv(radky)], { type: 'text/csv' }));
  l.download = 'klikac-historie.csv';
  l.click();
};
$('btn-smazat').onclick = async () => {
  if (!confirm('Smazat celou historii v rozšíření? Soubory ve vystupy/ zůstanou.')) return;
  await chrome.storage.local.set({ historie: [] });
  vybrany = null;
  $('detail').innerHTML = '';
  nacti();
};
chrome.storage.onChanged.addListener((z, o) => {
  if (o === 'local' && z.historie) nacti();
});

nacti();
nactiVystupy();
