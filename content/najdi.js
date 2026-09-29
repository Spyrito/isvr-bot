// Hledání prvků podle selektoru napříč rámci, viditelnost, zvýraznění a tvorba selektorů pro nahrávač.
(() => {
  'use strict';
  const K = (globalThis.Klikac ||= {});
  const S = globalThis.KlikacSelektor;

  const KLIKATELNE = [
    'a[href]', 'a[onclick]', 'button', 'input[type=submit]', 'input[type=button]', 'input[type=reset]', 'input[type=image]',
    'input[type=checkbox]', 'input[type=radio]', '[role=button]', '[role=tab]', '[role=link]', '[role=menuitem]',
    '[onclick]', 'label', 'summary', 'area',
  ].join(',');
  const POLE = [
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset])',
    'select', 'textarea', '[contenteditable=""]', '[contenteditable=true]',
  ].join(',');

  class ChybaHledani extends Error {}

  const norm = (s) => String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim();
  const bezKoncovky = (s) => norm(s).replace(/[\s:*]+$/, '');

  function dokument(w) {
    try {
      return w && w.document && w.document.documentElement ? w.document : null;
    } catch {
      return null; // jiná doména
    }
  }

  function ramceV(doc) {
    return Array.from(doc.querySelectorAll('frame, iframe'));
  }

  function najdiRamec(w, nazev) {
    const doc = dokument(w);
    if (!doc) return null;
    const els = ramceV(doc);
    let el = els.find((f) => f.name === nazev) || els.find((f) => f.id === nazev);
    if (!el && /^\d+$/.test(nazev)) el = els[Number(nazev)];
    return el ? el.contentWindow : null;
  }

  // Všechny dostupné dokumenty (horní + same-origin rámce do hloubky).
  function vsechnyDokumenty(w = window, out = []) {
    const doc = dokument(w);
    if (!doc) return out;
    out.push(doc);
    for (const f of ramceV(doc)) vsechnyDokumenty(f.contentWindow, out);
    return out;
  }

  function dokumentyPro(sel) {
    if (!sel.ramce) return vsechnyDokumenty();
    let w = window;
    for (let i = 0; i < sel.ramce.length; i++) {
      w = najdiRamec(w, sel.ramce[i]);
      if (!w) throw new ChybaHledani(`rámec „${sel.ramce.slice(0, i + 1).join('/')}“ nenalezen`);
    }
    const doc = dokument(w);
    if (!doc) throw new ChybaHledani(`rámec „${sel.ramce.join('/')}“ je z jiné domény`);
    return [doc];
  }

  function viditelny(el) {
    if (!el || !el.isConnected) return false;
    if (el.tagName === 'OPTION') return true;
    if (!el.getClientRects().length) return false;
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.visibility !== 'collapse';
  }

  function aktivni(el) {
    return !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('fieldset[disabled]');
  }

  function textPrvku(el) {
    const t = el.tagName;
    if (t === 'INPUT') return norm(el.value || el.getAttribute('alt') || el.title || el.getAttribute('aria-label'));
    if (t === 'IMG' || t === 'AREA') return norm(el.alt || el.title);
    let s = norm(el.innerText != null ? el.innerText : el.textContent);
    if (!s) {
      const img = el.querySelector && el.querySelector('img[alt], img[title], input[type=image]');
      if (img) s = norm(img.alt || img.title);
    }
    return s || norm(el.title || el.getAttribute('aria-label'));
  }

  // Textové uzly obsahující text (rychlá cesta pro text: a label:).
  function textoveUzly(doc, test) {
    const out = [];
    if (!doc.body) return out;
    const tw = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || p.closest('script,style,noscript,[data-klikac]')) return NodeFilter.FILTER_REJECT;
        return test(norm(n.data)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    while (tw.nextNode()) out.push(tw.currentNode);
    return out;
  }

  const unikatni = (arr) => Array.from(new Set(arr.filter(Boolean)));

  // text:"…" pro klikání: nejdřív přesná shoda na tlačítku/odkazu, pak bez ohledu na velikost, pak „obsahuje“.
  function hledejKlikatelne(doc, text) {
    const t = norm(text);
    const tl = t.toLowerCase();
    const kand = Array.from(doc.querySelectorAll(KLIKATELNE)).filter((e) => !e.closest('[data-klikac]'));
    const texty = new Map(kand.map((e) => [e, textPrvku(e)]));
    let r = kand.filter((e) => texty.get(e) === t);
    if (r.length) return r;
    r = kand.filter((e) => texty.get(e).toLowerCase() === tl);
    if (r.length) return r;
    r = unikatni(textoveUzly(doc, (s) => s.toLowerCase() === tl).map((n) => n.parentElement.closest(KLIKATELNE) || n.parentElement));
    if (r.length) return r;
    return kand.filter((e) => texty.get(e).toLowerCase().includes(tl));
  }

  // text:"…" pro čekání a zapamatování: nejmenší prvky, jejichž text obsahuje hledaný text.
  function hledejText(doc, text) {
    const t = norm(text);
    if (!doc.body || !norm(doc.body.textContent).includes(t)) return [];
    const r = unikatni(textoveUzly(doc, (s) => s.includes(t)).map((n) => n.parentElement));
    if (r.length) return r;
    // text rozdělený do více uzlů („Společník <b>přidán</b>“)
    const zasahy = Array.from(doc.body.querySelectorAll('*')).filter(
      (e) => !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName) && !e.closest('[data-klikac]') && norm(e.textContent).includes(t),
    );
    const mnozina = new Set(zasahy);
    return zasahy.filter((e) => !Array.from(e.children).some((c) => mnozina.has(c)));
  }

  function poleZa(el, doc) {
    const bunka = el.closest('td, th');
    if (bunka) {
      const vBunce = Array.from(bunka.querySelectorAll(POLE));
      if (vBunce.length) return vBunce[0];
      for (let n = bunka.nextElementSibling; n; n = n.nextElementSibling) {
        const f = n.matches(POLE) ? n : n.querySelector(POLE);
        if (f) return f;
      }
    }
    return Array.from(doc.querySelectorAll(POLE)).find((f) => el.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING && !f.closest('[data-klikac]')) || null;
  }

  function hledejLabel(doc, text) {
    const t = bezKoncovky(text).toLowerCase();
    for (const test of [(s) => bezKoncovky(s).toLowerCase() === t, (s) => bezKoncovky(s).toLowerCase().startsWith(t)]) {
      const r = [];
      for (const l of doc.querySelectorAll('label')) {
        if (test(l.textContent)) r.push(l.control || l.querySelector(POLE));
      }
      for (const f of doc.querySelectorAll(POLE)) {
        if (test(f.getAttribute('aria-label') || '') || test(f.getAttribute('placeholder') || '')) r.push(f);
      }
      if (r.filter(Boolean).length) return unikatni(r);
      const pole = textoveUzly(doc, test).map((n) => poleZa(n.parentElement, doc));
      if (pole.filter(Boolean).length) return unikatni(pole);
    }
    return [];
  }

  // Prvky pro selektor. ucel: 'klik' (text: hledá tlačítka) nebo 'text' (text: hledá jakýkoli text).
  // Vyhodí ChybaHledani, když rámec (zatím) neexistuje, a Error pro neplatný selektor.
  function prvky(selText, ucel = 'klik') {
    const sel = typeof selText === 'string' ? S.rozparsuj(selText) : selText;
    const out = [];
    for (const doc of dokumentyPro(sel)) {
      let r;
      if (sel.typ === 'css') {
        try {
          r = Array.from(doc.querySelectorAll(sel.hodnota));
        } catch {
          throw new Error(`neplatný CSS selektor „${sel.hodnota}“`);
        }
      } else if (sel.typ === 'xpath') {
        let x;
        try {
          x = doc.evaluate(sel.hodnota, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        } catch {
          throw new Error(`neplatný XPath „${sel.hodnota}“`);
        }
        r = [];
        for (let i = 0; i < x.snapshotLength; i++) {
          const n = x.snapshotItem(i);
          r.push(n.nodeType === 1 ? n : n.parentElement);
        }
      } else if (sel.typ === 'label') {
        r = hledejLabel(doc, sel.hodnota);
      } else {
        r = ucel === 'klik' ? hledejKlikatelne(doc, sel.hodnota) : hledejText(doc, sel.hodnota);
      }
      out.push(...r.filter((e) => e && !e.closest('[data-klikac]')));
    }
    return out;
  }

  // ---------- zvýraznění ----------

  const BARVY = { info: '#1a73e8', chyba: '#d93025', ok: '#188038' };
  const zvyraznene = new Set();

  function zrusZvyrazneni() {
    for (const d of zvyraznene) d.remove();
    zvyraznene.clear();
  }

  function zvyrazni(el, barva = 'info', trvale = false) {
    const doc = el.ownerDocument;
    const r = el.getBoundingClientRect();
    const d = doc.createElement('div');
    d.setAttribute('data-klikac', 'zvyrazneni');
    const c = BARVY[barva] || barva;
    d.style.cssText = `position:fixed;left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;` +
      `border:3px solid ${c};border-radius:4px;box-shadow:0 0 0 4px ${c}33;z-index:2147483646;pointer-events:none;box-sizing:border-box;transition:opacity .4s`;
    (doc.body && doc.body.tagName !== 'FRAMESET' ? doc.body : doc.documentElement).appendChild(d);
    zvyraznene.add(d);
    if (!trvale) {
      setTimeout(() => (d.style.opacity = '0'), 2200);
      setTimeout(() => {
        d.remove();
        zvyraznene.delete(d);
      }, 2700);
    }
  }

  // ---------- rámce a selektory pro nahrávač ----------

  function cestaRamce(w = window) {
    const casti = [];
    while (w !== w.top) {
      let jm = '';
      try {
        const fe = w.frameElement;
        if (fe) jm = fe.name || fe.id || String(ramceV(fe.ownerDocument).indexOf(fe));
      } catch {
        /* rodič z jiné domény */
      }
      if (!jm) jm = w.name || '0';
      casti.unshift(jm);
      w = w.parent;
    }
    return casti.length ? '@' + casti.join('/') : '';
  }

  function jeTlacitko(el) {
    return el.matches('a, button, input[type=submit], input[type=button], input[type=reset], input[type=image], [role=button], [role=tab], [role=link], [role=menuitem]');
  }

  function cssCesta(el) {
    const doc = el.ownerDocument;
    const casti = [];
    for (let e = el; e && e.nodeType === 1 && e !== doc.documentElement; e = e.parentElement) {
      if (e.id && doc.querySelectorAll('#' + CSS.escape(e.id)).length === 1) {
        casti.unshift('#' + CSS.escape(e.id));
        break;
      }
      let cast = e.tagName.toLowerCase();
      const sourozenci = e.parentElement ? Array.from(e.parentElement.children).filter((c) => c.tagName === e.tagName) : [];
      if (sourozenci.length > 1) cast += `:nth-of-type(${sourozenci.indexOf(e) + 1})`;
      casti.unshift(cast);
    }
    return casti.join(' > ');
  }

  // Pořadí jako v návrhu: id → name → text tlačítka → CSS cesta; s rámcem (@main).
  function selektorPro(el) {
    const doc = el.ownerDocument;
    const ram = cestaRamce(doc.defaultView);
    const pred = ram ? ram + ' ' : '';
    const jedinecny = (css) => {
      try {
        return doc.querySelectorAll(css).length === 1;
      } catch {
        return false;
      }
    };
    if (el.id && !/^\d/.test(el.id) && jedinecny('#' + CSS.escape(el.id))) return pred + '#' + CSS.escape(el.id);
    const jm = el.getAttribute('name');
    if (jm && !jm.includes('"')) {
      let css = `[name="${jm}"]`;
      if (el.type === 'radio' && el.value && !el.value.includes('"')) css += `[value="${el.value}"]`;
      if (jedinecny(css)) return pred + css;
    }
    if (jeTlacitko(el)) {
      const t = textPrvku(el);
      if (t && t.length <= 60 && !t.includes('"')) {
        const r = hledejKlikatelne(doc, t);
        if (r.length === 1 && r[0] === el) return pred + `text:"${t}"`;
      }
    }
    return pred + cssCesta(el);
  }

  K.najdi = {
    ChybaHledani, norm, prvky, viditelny, aktivni, textPrvku, zvyrazni, zrusZvyrazneni,
    cestaRamce, selektorPro, vsechnyDokumenty, POLE, KLIKATELNE,
  };
})();
