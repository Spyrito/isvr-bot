// Cvičná „stará notářská aplikace“ pro vyzkoušení Klikače a pro testy:
// frameset s rámcem main, ASP.NET postbacky (__doPostBack, AutoPostBack), confirm() před uložením,
// alert() hned po postbacku, popisky v buňkách tabulky, pole s maskou a zpožděné odpovědi.
//
//   node test/cvicna-aplikace.mjs [port]      → http://localhost:5178/Subjekty/Novy.aspx
import http from 'node:http';

const ulozene = [];
let dalsiId = 1200;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function platneRc(rc) {
  const s = String(rc).replace('/', '');
  return /^\d{10}$/.test(s) && BigInt(s) % 11n === 0n;
}

function platneIco(s) {
  if (!/^\d{8}$/.test(s)) return false;
  let x = 0;
  for (let i = 0; i < 7; i++) x += Number(s[i]) * (8 - i);
  return (11 - (x % 11)) % 10 === Number(s[7]);
}

const TYPY = { PO: 'Právnická osoba', FO: 'Fyzická osoba', SP: 'Spolek' };
const POLE = ['ddlTyp', 'txtNazev', 'txtJmeno', 'txtPrijmeni', 'txtRC', 'txtICO', 'txtUlice', 'txtCP', 'txtObec', 'txtPSC'];

function stranka(titul, telo) {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>${titul}</title>
<style>body{font:13px Tahoma,sans-serif;margin:12px}td{padding:3px 6px}.zprava{color:green;font-weight:bold;margin:8px 0}
.chyba{color:#c00;font-weight:bold}fieldset{margin:8px 0}#nacitam{background:#ffc;padding:4px}</style></head><body>${telo}</body></html>`;
}

function formular(st) {
  const vs = Buffer.from(JSON.stringify(st)).toString('base64');
  const radek = (popisek, id, extra = '') => `<tr><td>${popisek}</td><td><input type="text" id="${id}" name="${id}" value="${esc(st[id])}" ${extra}></td></tr>`;
  let h = `<form method="post" action="/Subjekty/NovyObsah.aspx" id="form1">
<input type="hidden" name="__VIEWSTATE" value="${vs}"><input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET"><input type="hidden" name="__EVENTARGUMENT">
<script>function __doPostBack(t,a){var f=document.getElementById('form1');f.__EVENTTARGET.value=t;f.__EVENTARGUMENT.value=a;f.submit();}
function kontrolaIco(el){document.getElementById('icoChyba').textContent=/^\\d{8}$/.test(el.value)?'':' IČO musí mít 8 číslic';}
function maska(el){var d=el.value.replace(/\\D/g,'').slice(0,8),v=d.slice(0,2);if(d.length>2)v+='.'+d.slice(2,4);if(d.length>4)v+='.'+d.slice(4);el.value=v;}</script>
<h2>Nový subjekt</h2><div id="nacitam">Načítám…</div><script>setTimeout(function(){document.getElementById('nacitam').style.display='none'},500)</script>
<table>
<tr><td>Typ subjektu:</td><td><select id="ddlTyp" name="ddlTyp" onchange="javascript:setTimeout('__doPostBack(\\'ddlTyp\\',\\'\\')', 0)">
<option value="">-- vyberte --</option>${Object.entries(TYPY).map(([k, v]) => `<option value="${k}" ${st.ddlTyp === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`;
  if (st.ddlTyp === 'PO' || st.ddlTyp === 'SP') h += radek('Název:', 'txtNazev', 'size="40"');
  if (st.ddlTyp === 'FO') h += radek('Jméno:', 'txtJmeno') + radek('Příjmení:', 'txtPrijmeni') + radek('Rodné číslo:', 'txtRC');
  if (st.ddlTyp) {
    h += `<tr><td>IČO:</td><td><input type="text" id="txtICO" name="txtICO" value="${esc(st.txtICO)}" onblur="kontrolaIco(this)"><span id="icoChyba" class="chyba"></span></td></tr>`;
    h += radek('Ulice:', 'txtUlice') + radek('Č. p.:', 'txtCP') + radek('Obec:', 'txtObec') + radek('PSČ:', 'txtPSC');
  }
  h += '</table>';
  if (st.ddlTyp === 'PO') {
    h += `<h3>Společníci</h3><div>Společníci: ${st.spolecnici.length}</div><table border="1">${st.spolecnici
      .map((s) => `<tr><td>${esc(s.jmeno)} ${esc(s.prijmeni)}</td><td>${esc(s.rc)}</td><td>${esc(s.vklad)} Kč</td></tr>`)
      .join('')}</table>
<a id="lnkPridatSpolecnika" href="javascript:__doPostBack('lnkPridatSpolecnika','')">Přidat společníka</a>`;
    if (st.rezim === 'spolecnik') {
      h += `<fieldset><legend>Nový společník</legend><table>${radek('Jméno:', 'txtSpolJmeno')}${radek('Příjmení:', 'txtSpolPrijmeni')}${radek('Rodné číslo:', 'txtSpolRC')}${radek('Vklad:', 'txtSpolVklad')}</table>
<input type="submit" name="btnPotvrdit" value="Potvrdit"></fieldset>`;
    }
  }
  if (st.ddlTyp === 'SP') {
    h += `<h3>Jednatelé</h3><div>Jednatelé: ${st.jednatele.length}</div><ul>${st.jednatele.map((j) => `<li>${esc(j.jmeno)} ${esc(j.prijmeni)}, nar. ${esc(j.datum)}</li>`).join('')}</ul>
<a id="lnkPridatJednatele" href="#" onclick="__doPostBack('lnkPridatJednatele','');return false;">Přidat jednatele</a>`;
    if (st.rezim === 'jednatel') {
      h += `<fieldset><legend>Nový jednatel</legend><table>${radek('Jméno:', 'txtJedJmeno')}${radek('Příjmení:', 'txtJedPrijmeni')}${radek('Datum narození:', 'txtJedDatumNar', 'onkeyup="maska(this)" maxlength="10"')}</table>
<input type="submit" name="btnPotvrdit" value="Potvrdit"></fieldset>`;
    }
  }
  if (st.zprava) h += `<div class="zprava">${esc(st.zprava)}</div>`;
  if (st.chyba) h += `<div class="chyba">${esc(st.chyba)}</div>`;
  h += `<p><input type="submit" name="btnUlozit" id="btnUlozit" value="Uložit" onclick="return confirm('Opravdu uložit subjekt?')"></p></form>`;
  if (st.chyba) h += `<script>alert(${JSON.stringify(st.chyba)})</script>`;
  return stranka('Nový subjekt', h);
}

function zpracuj(st, f) {
  for (const p of POLE) if (p in f) st[p] = f[p];
  st.zprava = st.chyba = '';
  const udalost = f.__EVENTTARGET;
  if (udalost === 'ddlTyp') {
    st.rezim = '';
  } else if (udalost === 'lnkPridatSpolecnika') {
    st.rezim = 'spolecnik';
  } else if (udalost === 'lnkPridatJednatele') {
    st.rezim = 'jednatel';
  } else if ('btnPotvrdit' in f && st.rezim === 'spolecnik') {
    if (!f.txtSpolJmeno || !f.txtSpolPrijmeni) st.chyba = 'Vyplňte jméno a příjmení společníka.';
    else if (!platneRc(f.txtSpolRC)) st.chyba = `Neplatné rodné číslo ${f.txtSpolRC}.`;
    else {
      st.spolecnici.push({ jmeno: f.txtSpolJmeno, prijmeni: f.txtSpolPrijmeni, rc: f.txtSpolRC, vklad: f.txtSpolVklad });
      st.rezim = '';
      st.zprava = 'Společník přidán';
    }
  } else if ('btnPotvrdit' in f && st.rezim === 'jednatel') {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(f.txtJedDatumNar || '')) st.chyba = `Neplatné datum narození „${f.txtJedDatumNar}“.`;
    else {
      st.jednatele.push({ jmeno: f.txtJedJmeno, prijmeni: f.txtJedPrijmeni, datum: f.txtJedDatumNar });
      st.rezim = '';
      st.zprava = 'Jednatel přidán';
    }
  } else if ('btnUlozit' in f) {
    if (!st.ddlTyp) st.chyba = 'Vyberte typ subjektu.';
    else if (st.ddlTyp !== 'FO' && !st.txtNazev) st.chyba = 'Vyplňte název.';
    else if (st.ddlTyp === 'FO' && !platneRc(st.txtRC)) st.chyba = 'Neplatné rodné číslo.';
    else if (!platneIco(st.txtICO)) st.chyba = `Neplatné IČO ${st.txtICO}.`;
    else if (!st.txtObec || !/^\d{5}$/.test(st.txtPSC || '')) st.chyba = 'Vyplňte adresu.';
    else {
      const id = ++dalsiId;
      const spz = `NZ ${id % 900 + 100}/2026`;
      ulozene.push({ id, spz, ...st });
      return { ulozeno: { id, spz } };
    }
  }
  return {};
}

function prectiTelo(req) {
  return new Promise((ok) => {
    let t = '';
    req.on('data', (c) => (t += c));
    req.on('end', () => ok(Object.fromEntries(new URLSearchParams(t))));
  });
}

export function spustAplikaci(port = 5178) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const posli = (html, kod = 200, typ = 'text/html; charset=utf-8') => {
      res.writeHead(kod, { 'Content-Type': typ, 'Cache-Control': 'no-store' });
      res.end(html);
    };
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/Subjekty/Novy.aspx' });
      return res.end();
    }
    if (url.pathname === '/Subjekty/Novy.aspx') {
      return posli(`<!doctype html><html><head><meta charset="utf-8"><title>Notářská aplikace – nový subjekt</title></head>
<frameset cols="170,*"><frame name="menu" src="/Menu.aspx"><frame name="main" src="/Subjekty/NovyObsah.aspx"></frameset></html>`);
    }
    if (url.pathname === '/Menu.aspx') {
      return posli(stranka('Menu', '<b>Notářská aplikace</b><ul><li><a href="/Subjekty/NovyObsah.aspx" target="main">Nový subjekt</a></li><li>Řízení</li><li>Hledání</li></ul>'));
    }
    if (url.pathname === '/Subjekty/NovyObsah.aspx') {
      let st = { ddlTyp: '', spolecnici: [], jednatele: [], rezim: '' };
      if (req.method === 'POST') {
        const f = await prectiTelo(req);
        try {
          st = { ...st, ...JSON.parse(Buffer.from(f.__VIEWSTATE || '', 'base64').toString() || '{}') };
        } catch {
          /* nový formulář */
        }
        const r = zpracuj(st, f);
        if (r.ulozeno) {
          return posli(stranka('Uloženo', `<h2>Subjekt uložen</h2><p>Subjekt uložen pod č. <b>${r.ulozeno.id}</b></p>
<p>Spisová značka: <span id="lblSpisovaZnacka">${r.ulozeno.spz}</span></p><script>alert('Subjekt byl úspěšně uložen.')</script>`));
        }
        // „Přidat společníka“ odpovídá pomalu jako skutečná aplikace
        if (f.__EVENTTARGET === 'lnkPridatSpolecnika' || f.__EVENTTARGET === 'lnkPridatJednatele') await new Promise((r2) => setTimeout(r2, 400));
      }
      return posli(formular(st));
    }
    if (url.pathname === '/api/ulozene') return posli(JSON.stringify(ulozene), 200, 'application/json');
    if (url.pathname === '/api/reset') {
      ulozene.length = 0;
      return posli('{}', 200, 'application/json');
    }
    posli('nenalezeno', 404, 'text/plain');
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const port = Number(process.argv[2]) || 5178;
  await spustAplikaci(port);
  console.log(`Cvičná aplikace: http://localhost:${port}/Subjekty/Novy.aspx`);
}
