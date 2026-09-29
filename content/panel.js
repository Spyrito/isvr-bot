// Plovoucí panel na stránce: oblíbené úseky, průběh běhu, krokování, chyby, ruční pauza, výsledek, nahrávání.
// U framesetů (horní dokument nemá body) se zobrazí v největším rámci.
(() => {
  'use strict';
  const K = (globalThis.Klikac ||= {});
  const N = K.najdi;

  let host = null;
  let koren = null;
  let pohled = null;
  let sbaleno = false;
  let pozice = null;
  let pocet = 1;
  let ukoncovani = false;
  let formular = { nazev: '', slozka: 'useky', popis: '' };
  let hlaska = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function nejvetsiRamec(w) {
    let nej = null;
    let plocha = -1;
    const projdi = (okno) => {
      let d;
      try {
        d = okno.document;
      } catch {
        return;
      }
      for (const f of d.querySelectorAll('frame')) {
        const cw = f.contentWindow;
        let fd;
        try {
          fd = cw.document;
        } catch {
          continue;
        }
        if (fd.body && fd.body.tagName === 'FRAMESET') projdi(cw);
        else if (cw.innerWidth * cw.innerHeight > plocha) {
          plocha = cw.innerWidth * cw.innerHeight;
          nej = cw;
        }
      }
    };
    projdi(w);
    return nej;
  }

  function jsemHostitel() {
    if (window === window.top) return !(document.body && document.body.tagName === 'FRAMESET');
    try {
      const b = window.top.document.body;
      return !!b && b.tagName === 'FRAMESET' && nejvetsiRamec(window.top) === window;
    } catch {
      return false;
    }
  }

  function adresaStranky() {
    try {
      return window.top.location.href;
    } catch {
      return location.href;
    }
  }

  function maZobrazit(p) {
    if (!p) return false;
    if (p.beh || p.nahravani || p.vysledek || p.panel) return true;
    if (!p.adresa) return false;
    try {
      return adresaStranky().startsWith(p.adresa) || new URL(adresaStranky()).origin === new URL(p.adresa).origin;
    } catch {
      return false;
    }
  }

  function posli(z) {
    return chrome.runtime.sendMessage(z).then(
      (r) => {
        if (r && r.ok === false && r.chyba) ukazHlasku(r.chyba, true);
        return r;
      },
      () => ukazHlasku('Rozšíření neodpovídá – obnov stránku (F5).', true),
    );
  }

  function ukazHlasku(text, chyba = false) {
    hlaska = { text, chyba };
    vykresli();
    setTimeout(() => {
      if (hlaska && hlaska.text === text) {
        hlaska = null;
        vykresli();
      }
    }, 6000);
  }

  async function kopiruj(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-klikac', 'schranka');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.documentElement.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function vybranyText() {
    let w = window;
    try {
      if (window.top.document) w = window.top;
    } catch {
      /* jiná doména */
    }
    for (const d of N.vsechnyDokumenty(w)) {
      const s = d.getSelection && String(d.getSelection()).trim();
      if (s) return N.norm(s);
    }
    return '';
  }

  const CSS_PANELU = `
    :host { all: initial; }
    .p { position: fixed; z-index: 2147483647; width: 310px; max-height: 70vh; display: flex; flex-direction: column;
      font: 13px/1.4 "Segoe UI", system-ui, sans-serif; color: #202124; background: #fff; border: 1px solid #c4c7c5;
      border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18); overflow: hidden; }
    .h { display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 12px; background: #1a4d8f; color: #fff; cursor: move; user-select: none; }
    .h b { flex: 1; font-weight: 600; letter-spacing: .2px; }
    .h .st { font-size: 11px; padding: 1px 7px; border-radius: 9px; background: rgba(255,255,255,.2); }
    .h button { background: transparent; border: 0; color: #fff; font-size: 15px; width: 24px; height: 22px; border-radius: 5px; cursor: pointer; padding: 0; }
    .h button:hover { background: rgba(255,255,255,.2); }
    .b { padding: 10px 12px 12px; overflow: auto; }
    .r { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; align-items: center; }
    button.t { font: inherit; padding: 5px 10px; border-radius: 6px; border: 1px solid #c4c7c5; background: #f8f9fa; color: #202124; cursor: pointer; }
    button.t:hover { background: #eef1f4; }
    button.t.hl { background: #1a4d8f; border-color: #1a4d8f; color: #fff; }
    button.t.hl:hover { background: #163f75; }
    button.t.st { color: #b3261e; border-color: #e6b3ae; }
    .us { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .us button { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .m { color: #5f6368; font-size: 12px; }
    .kod { font: 12px/1.45 Consolas, "Cascadia Mono", monospace; background: #f1f3f4; border-radius: 6px; padding: 6px 8px; margin-top: 6px; white-space: pre-wrap; word-break: break-all; }
    .bar { height: 6px; background: #e8eaed; border-radius: 3px; margin-top: 8px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: #1a73e8; }
    .box { border-radius: 8px; padding: 8px 10px; margin-top: 4px; }
    .chy { background: #fce8e6; color: #8c1d18; }
    .ruc { background: #fef7e0; color: #5c4400; }
    .ok { background: #e6f4ea; color: #0d652d; }
    .hod { margin-top: 8px; display: grid; grid-template-columns: auto 1fr auto; gap: 3px 8px; align-items: center; }
    .hod span:nth-child(3n+1) { color: #5f6368; font-size: 12px; }
    .hod span:nth-child(3n+2) { font-weight: 600; word-break: break-all; }
    .hod button { border: 0; background: transparent; cursor: pointer; color: #1a73e8; font: inherit; padding: 0 2px; }
    input.n { width: 42px; font: inherit; padding: 4px; border: 1px solid #c4c7c5; border-radius: 6px; }
    input.w, select.w { width: 100%; box-sizing: border-box; font: inherit; padding: 5px 7px; border: 1px solid #c4c7c5; border-radius: 6px; margin-top: 3px; }
    label.f { display: block; margin-top: 8px; font-size: 12px; color: #5f6368; }
    .hl2 { margin-top: 8px; padding: 6px 8px; border-radius: 6px; background: #e8f0fe; color: #174ea6; }
    .hl2.chy { background: #fce8e6; color: #8c1d18; }
    @media (prefers-color-scheme: dark) {
      .p { background: #202124; color: #e8eaed; border-color: #5f6368; }
      button.t { background: #303134; color: #e8eaed; border-color: #5f6368; }
      button.t:hover { background: #3c4043; }
      .kod { background: #303134; } .m, .hod span:nth-child(3n+1) { color: #9aa0a6; }
      .chy { background: #5c1f1b; color: #f6d6d3; } .ruc { background: #4d3b00; color: #fde293; } .ok { background: #0d3d1f; color: #c4eed0; }
      input.n, input.w, select.w { background: #303134; color: #e8eaed; border-color: #5f6368; }
      .hl2 { background: #1f3760; color: #d2e3fc; }
    }`;

  function zajistiHost() {
    if (host && host.isConnected) return;
    document.querySelectorAll('[data-klikac=panel]').forEach((e) => e.remove());
    host = document.createElement('div');
    host.setAttribute('data-klikac', 'panel');
    koren = host.attachShadow({ mode: 'open' });
    koren.addEventListener('click', priKliku);
    koren.addEventListener('input', (e) => {
      const t = e.target;
      if (t.name === 'pocet') pocet = Math.max(1, Math.min(500, parseInt(t.value, 10) || 1));
      if (t.name in formular) formular[t.name] = t.value;
    });
    koren.addEventListener('change', (e) => {
      if (e.target.name in formular) formular[e.target.name] = e.target.value;
    });
    koren.addEventListener('mousedown', zacniTahat);
    document.documentElement.appendChild(host);
  }

  function zacniTahat(e) {
    const h = e.target.closest && e.target.closest('.h');
    if (!h || e.target.closest('button')) return;
    const p = koren.querySelector('.p');
    const r = p.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const pohyb = (m) => {
      pozice = {
        x: Math.max(0, Math.min(window.innerWidth - r.width, m.clientX - dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, m.clientY - dy)),
      };
      p.style.left = pozice.x + 'px';
      p.style.top = pozice.y + 'px';
      p.style.right = p.style.bottom = 'auto';
    };
    const konec = () => {
      document.removeEventListener('mousemove', pohyb, true);
      document.removeEventListener('mouseup', konec, true);
      chrome.storage.local.set({ panelPozice: pozice, panelSbaleno: sbaleno }).catch(() => {});
    };
    document.addEventListener('mousemove', pohyb, true);
    document.addEventListener('mouseup', konec, true);
    e.preventDefault();
  }

  function priKliku(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const d = b.dataset;
    switch (a) {
      case 'sbal':
        sbaleno = !sbaleno;
        chrome.storage.local.set({ panelSbaleno: sbaleno }).catch(() => {});
        vykresli();
        break;
      case 'spust':
        posli({ typ: 'spust', soubor: d.soubor, pocet });
        break;
      case 'ovl':
        posli({ typ: 'ovladani', akce: d.akce });
        break;
      case 'kopiruj':
        kopiruj(d.hodnota).then((ok) => ukazHlasku(ok ? 'Zkopírováno' : 'Kopírování se nepovedlo', !ok));
        break;
      case 'kopiruj-vse': {
        const h = (pohled.vysledek && pohled.vysledek.hodnoty) || {};
        kopiruj(Object.entries(h).map(([k, v]) => `${k}\t${v}`).join('\r\n')).then(() => ukazHlasku('Zkopírováno vše'));
        break;
      }
      case 'nah':
        if (d.akce === 'cekani') posli({ typ: 'nahravani', akce: 'pridej', radek: 'cekej     1000' });
        else if (d.akce === 'text') {
          const t = vybranyText() || prompt('Na jaký text se má čekat? (Příště ho stačí na stránce označit myší.)');
          if (t) posli({ typ: 'nahravani', akce: 'pridej', radek: `cekej-na  text:"${t.replace(/"/g, '')}"` });
        } else if (d.akce === 'ukoncit') {
          ukoncovani = true;
          vykresli();
        } else if (d.akce === 'zpet-form') {
          ukoncovani = false;
          vykresli();
        } else if (d.akce === 'ulozit') {
          posli({ typ: 'nahravani', akce: 'konec', ...formular }).then((r) => {
            if (r && r.ok) {
              ukoncovani = false;
              formular = { nazev: '', slozka: 'useky', popis: '' };
              ukazHlasku('Uloženo do ' + r.cesta);
            }
          });
        } else posli({ typ: 'nahravani', akce: d.akce });
        break;
    }
  }

  const STAVY = { bezi: 'běží', krokovani: 'krokování', chyba: 'chyba', rucne: 'ruční zásah' };

  function radekKroku(k) {
    return k ? `<div class="kod">${esc(k.soubor)}:${k.radek}\n${esc(k.text)}</div>` : '';
  }

  function tlacitka(...t) {
    return `<div class="r">${t.join('')}</div>`;
  }
  const T = (akce, text, trida = '') => `<button class="t ${trida}" data-a="ovl" data-akce="${akce}">${text}</button>`;

  function seznamUseku(p, nadpis) {
    if (!p.useky.length) return `<div class="m">Ve složce useky/ zatím nic není.</div>`;
    return `${nadpis ? `<div class="m" style="margin:8px 0 4px">${nadpis}</div>` : ''}
      <div class="us">${p.useky.map((u) => `<button class="t" data-a="spust" data-soubor="${esc(u.cesta)}" title="${esc(u.popis || u.nazev)}">${esc(u.nazev)}</button>`).join('')}</div>
      <div class="r"><span class="m">kolikrát</span><input class="n" name="pocet" type="number" min="1" max="500" value="${pocet}"></div>`;
  }

  function hodnoty(h) {
    const e = Object.entries(h || {});
    if (!e.length) return '';
    return `<div class="hod">${e
      .map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span><button data-a="kopiruj" data-hodnota="${esc(v)}" title="Kopírovat">⧉</button>`)
      .join('')}</div>`;
  }

  function obsah(p) {
    if (p.nahravani) {
      if (ukoncovani) {
        return `<div><b>Uložit nahrávku</b> <span class="m">(${p.nahravani.pocet} kroků)</span></div>
          <label class="f">Název<input class="w" name="nazev" value="${esc(formular.nazev)}" placeholder="např. Spolecnik"></label>
          <label class="f">Složka<select class="w" name="slozka">
            <option value="useky" ${formular.slozka === 'useky' ? 'selected' : ''}>useky/ – běží na otevřené stránce</option>
            <option value="zalozeni" ${formular.slozka === 'zalozeni' ? 'selected' : ''}>zalozeni/ – celé založení (začne otevri)</option></select></label>
          <label class="f">Popis<input class="w" name="popis" value="${esc(formular.popis)}" placeholder="co scénář dělá"></label>
          ${tlacitka(`<button class="t hl" data-a="nah" data-akce="ulozit">Uložit a otevřít v editoru</button>`, `<button class="t" data-a="nah" data-akce="zpet-form">Zpět</button>`)}`;
      }
      return `<div>⏺ Nahrávám · <b>${p.nahravani.pocet}</b> kroků</div>
        ${p.nahravani.posledni.length ? `<div class="kod">${esc(p.nahravani.posledni.join('\n'))}</div>` : '<div class="m">Projdi postup ručně, kroky se zapisují samy.</div>'}
        ${tlacitka(
          `<button class="t" data-a="nah" data-akce="cekani">+ čekání</button>`,
          `<button class="t" data-a="nah" data-akce="text" title="Označ text na stránce a klikni">+ čekat na text</button>`,
          `<button class="t" data-a="nah" data-akce="zpet" title="Smazat poslední krok">↶</button>`,
        )}
        ${tlacitka(`<button class="t hl" data-a="nah" data-akce="ukoncit">Ukončit</button>`, `<button class="t st" data-a="nah" data-akce="zrus">Zrušit</button>`)}`;
    }
    const b = p.beh;
    if (b) {
      const nadpis = `<div><b>${esc(b.nazev)}</b>${b.pocet > 1 ? ` <span class="m">(${b.iterace}/${b.pocet})</span>` : ''}${b.rodic ? ` <span class="m">v pauze „${esc(b.rodic)}“</span>` : ''}</div>`;
      if (b.stav === 'bezi') {
        return `${nadpis}<div class="bar"><i style="width:${Math.round((100 * b.pc) / Math.max(1, b.celkem))}%"></i></div>
          <div class="m" style="margin-top:4px">krok ${Math.min(b.pc + 1, b.celkem)} z ${b.celkem}</div>${radekKroku(b.krok)}
          ${tlacitka(T('krokovat', 'Krokovat'), T('stop', 'Stop', 'st'))}`;
      }
      if (b.stav === 'krokovani') {
        return `${nadpis}<div class="m" style="margin-top:6px">Další krok (${Math.min(b.pc + 1, b.celkem)} z ${b.celkem}):</div>${radekKroku(b.krok)}
          ${tlacitka(T('dalsi', 'Další', 'hl'), T('pokracuj', 'Pokračovat'), T('stop', 'Stop', 'st'))}`;
      }
      if (b.stav === 'chyba') {
        const c = b.chyba || {};
        return `${nadpis}<div class="box chy"><b>${esc(c.soubor)}:${c.radek}</b> – ${esc(c.zprava)}<div class="kod" style="background:transparent;padding:4px 0 0">${esc(c.text)}</div></div>
          ${tlacitka(T('znovu', 'Zkusit znovu', 'hl'), T('preskoc', 'Přeskočit'), T('stop', 'Stop', 'st'))}`;
      }
      if (b.stav === 'rucne') {
        return `${nadpis}<div class="box ruc">✋ ${esc(b.pokyn)}${b.dokud ? `<div class="m" style="margin-top:4px">Pokračuje samo, až se objeví <code>${esc(b.dokud)}</code>.</div>` : ''}</div>
          ${b.posledniUsek ? `<div class="m" style="margin-top:6px">Úsek „${esc(b.posledniUsek.nazev)}“: ${esc(b.posledniUsek.vysledek)}</div>` : ''}
          ${tlacitka(T('pokracuj', 'Pokračovat', 'hl'), T('stop', 'Stop', 'st'))}
          ${seznamUseku(p, 'Pomocné úseky během pauzy:')}`;
      }
    }
    let out = '';
    const v = p.vysledek;
    if (v) {
      const ok = v.vysledek === 'OK';
      out += `<div class="box ${ok ? 'ok' : 'chy'}"><b>${esc(v.nazev)}</b>: ${esc(v.vysledek)}${v.pocet > 1 ? ` (${v.iterace}/${v.pocet})` : ''}
        ${v.zprava ? `<div class="kod" style="background:transparent;padding:4px 0 0">${esc(v.zprava)}</div>` : ''}</div>
        ${hodnoty(v.hodnoty)}
        ${tlacitka(Object.keys(v.hodnoty || {}).length ? `<button class="t" data-a="kopiruj-vse">Kopírovat vše</button>` : '', T('zavrit', 'Zavřít'))}
        <div style="height:6px"></div>`;
    }
    return out + seznamUseku(p);
  }

  function vykresli() {
    if (!pohled || !maZobrazit(pohled) || !jsemHostitel()) {
      if (host) host.remove();
      host = null;
      return;
    }
    zajistiHost();
    const b = pohled.beh;
    const stav = pohled.nahravani ? 'nahrávání' : b ? STAVY[b.stav] || b.stav : '';
    const umisteni = pozice ? `left:${pozice.x}px;top:${pozice.y}px;` : 'right:16px;bottom:16px;';
    const aktivni = koren.activeElement;
    const aktivniJmeno = aktivni && aktivni.name;
    koren.innerHTML = `<style>${CSS_PANELU}</style>
      <div class="p" style="${umisteni}">
        <div class="h"><b>Klikač</b>${stav ? `<span class="st">${esc(stav)}</span>` : ''}
          <button data-a="sbal" title="${sbaleno ? 'Rozbalit' : 'Sbalit'}">${sbaleno ? '▴' : '▾'}</button>
          ${!b && !pohled.nahravani ? `<button data-a="ovl" data-akce="zavrit" title="Skrýt">×</button>` : ''}</div>
        ${sbaleno ? '' : `<div class="b">${obsah(pohled)}${hlaska ? `<div class="hl2 ${hlaska.chyba ? 'chy' : ''}">${esc(hlaska.text)}</div>` : ''}</div>`}
      </div>`;
    if (aktivniJmeno) {
      const el = koren.querySelector(`[name="${aktivniJmeno}"]`);
      if (el) el.focus();
    }
  }

  chrome.storage.local.get(['panelPozice', 'panelSbaleno']).then((r) => {
    pozice = r.panelPozice || null;
    if (pozice) pozice = { x: Math.min(pozice.x, window.innerWidth - 320), y: Math.min(pozice.y, window.innerHeight - 60) };
    sbaleno = !!r.panelSbaleno;
    vykresli();
  }, () => {});

  K.panel = {
    aktualizuj(p) {
      pohled = p;
      if (!p || !p.nahravani) ukoncovani = false;
      vykresli();
    },
  };
})();
