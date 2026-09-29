import * as U from '../lib/uloziste.js';
import { seznamScenaru } from '../lib/soubory.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let tab = null;
let scenare = [];
let vybrany = null;

const STAVY = { bezi: 'běží', krokovani: 'krokování', chyba: 'chyba', rucne: 'čeká na ruční zásah' };

async function nactiStavSlozky() {
  const s = await U.stav();
  $('slozka').textContent = s.rezim === 'slozka' ? '📁 ' + (s.slozka || 'Klikac') : 'scénáře v rozšíření';
  const p = $('pristup');
  p.classList.add('skryte');
  if (s.rezim === 'slozka' && s.pristup !== 'ok') {
    p.classList.remove('skryte');
    if (s.pristup === 'potvrdit') {
      p.innerHTML = `Chrome po restartu potřebuje znovu potvrdit přístup ke složce <b>${esc(s.slozka)}</b>.
        <div class="radek" style="margin-top:6px"><button id="povolit" class="hl">Povolit přístup</button></div>`;
      $('povolit').onclick = async () => {
        try {
          if (await U.povolPristup()) return obnov();
        } catch {
          /* v popupu dialog nemusí jít – zkusí to editor */
        }
        otevriEditor();
      };
    } else {
      p.innerHTML = `Složka Klikac není vybraná. <a href="#" id="vybrat">Vybrat v editoru</a>`;
      $('vybrat').onclick = () => otevriEditor();
    }
  }
}

function vykresliSeznam() {
  const q = $('hledat').value.trim().toLowerCase();
  const filtr = scenare.filter((s) => !q || (s.nazev + ' ' + s.popis).toLowerCase().includes(q));
  if (!scenare.length) {
    $('seznam').innerHTML = `<div id="prazdno" class="tlumeny">Zatím tu nejsou žádné scénáře.<br>Založ je v editoru nebo nahraj.</div>`;
    return;
  }
  const skupina = (nadpis, pol) =>
    pol.length
      ? `<h4>${nadpis}</h4>` +
        pol.map((s) => `<div class="pol ${s.cesta === vybrany ? 'vyb' : ''}" data-cesta="${esc(s.cesta)}" title="${esc(s.cesta)}"><b>${esc(s.nazev)}</b>${s.popis ? `<div>${esc(s.popis)}</div>` : ''}</div>`).join('')
      : '';
  $('seznam').innerHTML = skupina('Založení', filtr.filter((s) => !s.usek)) + skupina('Úseky', filtr.filter((s) => s.usek)) || '<div id="prazdno" class="tlumeny">Nic nenalezeno.</div>';
  const v = $('seznam').querySelector('.vyb');
  if (v) v.scrollIntoView({ block: 'nearest' });
}

async function vykresliBeh() {
  const el = $('beh');
  if (!tab) return el.classList.add('skryte');
  const p = await chrome.runtime.sendMessage({ typ: 'pohled', tabId: tab.id }).catch(() => null);
  const b = p && p.beh;
  if (!b && !(p && p.nahravani)) return el.classList.add('skryte');
  el.classList.remove('skryte');
  if (p.nahravani) {
    el.innerHTML = `⏺ Nahrává se (${p.nahravani.pocet} kroků). Ukonči ho v panelu na stránce.`;
    return;
  }
  el.innerHTML = `<b>${esc(b.nazev)}</b> – ${STAVY[b.stav] || b.stav} (krok ${Math.min(b.pc + 1, b.celkem)}/${b.celkem})
    ${b.chyba ? `<div class="box chyba" style="margin-top:6px">${esc(b.chyba.soubor)}:${b.chyba.radek} – ${esc(b.chyba.zprava)}</div>` : ''}
    <div class="radek">${b.stav === 'rucne' || b.stav === 'krokovani' ? '<button id="pokr" class="hl">Pokračovat</button>' : ''}<button id="stop" class="st">Stop</button></div>`;
  if ($('pokr')) $('pokr').onclick = () => chrome.runtime.sendMessage({ typ: 'ovladani', tabId: tab.id, akce: 'pokracuj' }).then(vykresliBeh);
  $('stop').onclick = () => chrome.runtime.sendMessage({ typ: 'ovladani', tabId: tab.id, akce: 'stop' }).then(vykresliBeh);
}

function otevriEditor(parametry = {}) {
  chrome.runtime.sendMessage({ typ: 'otevri-editor', ...parametry });
  window.close();
}

async function spust(krokovat) {
  if (!vybrany || !tab) return;
  const pocet = Math.max(1, Math.min(500, parseInt($('pocet').value, 10) || 1));
  await chrome.storage.local.set({ popupVyber: { cesta: vybrany, pocet } });
  const r = await chrome.runtime.sendMessage({ typ: 'spust', tabId: tab.id, soubor: vybrany, pocet, krokovat });
  if (r && r.ok) window.close();
  else {
    $('upozorneni').classList.remove('skryte');
    $('upozorneni').innerHTML = `<div class="box chyba" style="white-space:pre-wrap">${esc(r?.chyba || 'Nepodařilo se spustit.')}</div>`;
  }
}

async function obnov() {
  await nactiStavSlozky();
  const { soubory } = await U.nactiVse();
  scenare = seznamScenaru(soubory);
  if (vybrany && !scenare.some((s) => s.cesta === vybrany)) vybrany = null;
  vykresliSeznam();
}

async function start() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const web = tab && /^(https?|file):/i.test(tab.url || '');
  if (!web) {
    tab = null;
    $('upozorneni').classList.remove('skryte');
    $('upozorneni').textContent = 'Scénáře se spouštějí na stránce aplikace – přepni se na ni.';
    for (const id of ['spustit', 'krokovat', 'nahravat', 'panel']) $(id).disabled = true;
  }
  const { popupVyber } = await chrome.storage.local.get('popupVyber');
  if (popupVyber) {
    vybrany = popupVyber.cesta;
    $('pocet').value = popupVyber.pocet || 1;
  }
  await obnov();
  vykresliBeh();
}

$('hledat').addEventListener('input', () => {
  vykresliSeznam();
  const prvni = $('seznam').querySelector('.pol');
  if (prvni && $('hledat').value) {
    vybrany = prvni.dataset.cesta;
    vykresliSeznam();
  }
});
$('hledat').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') spust(false);
});
$('seznam').addEventListener('click', (e) => {
  const p = e.target.closest('.pol');
  if (!p) return;
  vybrany = p.dataset.cesta;
  vykresliSeznam();
});
$('seznam').addEventListener('dblclick', (e) => {
  if (e.target.closest('.pol')) spust(false);
});
$('spustit').onclick = () => spust(false);
$('krokovat').onclick = () => spust(true);
$('editor').onclick = () => otevriEditor(vybrany ? { soubor: vybrany } : {});
$('historie').onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('ui/historie.html') });
  window.close();
};
$('nahravat').onclick = async () => {
  const r = await chrome.runtime.sendMessage({ typ: 'nahravani', tabId: tab.id, akce: 'start' });
  if (r && r.ok) window.close();
  else {
    $('upozorneni').classList.remove('skryte');
    $('upozorneni').innerHTML = `<div class="box chyba">${esc(r?.chyba || 'Nahrávání nejde spustit.')}</div>`;
  }
};
$('panel').onclick = async () => {
  await chrome.runtime.sendMessage({ typ: 'ovladani', tabId: tab.id, akce: 'panel' });
  window.close();
};

chrome.runtime.onMessage.addListener((z) => {
  if (z && z.typ === 'zmena-stavu' && tab && z.tabId === tab.id) vykresliBeh();
});

start();
