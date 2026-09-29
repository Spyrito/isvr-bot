// Nahrávač: běží v každém rámci a posílá zaznamenané kroky do backgroundu.
// Kliknutí do textových polí a na prázdná místa nezapisuje; změny polí zapisuje až při „change“.
(() => {
  'use strict';
  const K = (globalThis.Klikac ||= {});
  const N = K.najdi;
  let zapnuto = false;

  const TLACITKA_INPUT = 'input[type=submit], input[type=button], input[type=reset], input[type=image]';

  function zNasehoPanelu(e) {
    return e.composedPath().some((n) => n && n.nodeType === 1 && n.hasAttribute('data-klikac'));
  }

  function posli(krok) {
    try {
      chrome.runtime.sendMessage({ typ: 'nahravani-krok', krok }).catch(() => {});
    } catch {
      /* rozšíření bylo znovu načteno */
    }
  }

  function priKliku(e) {
    if (!zapnuto || !e.isTrusted || zNasehoPanelu(e)) return;
    const cil = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    const el = cil && cil.closest(N.KLIKATELNE);
    if (!el) return; // prázdné místo
    if (el.matches('input, select, textarea, option') && !el.matches(TLACITKA_INPUT)) return; // pole řeší „change“
    if (el.tagName === 'LABEL' && el.control) return; // label k poli nebo checkboxu
    posledniKlik = Date.now();
    posli({ prikaz: 'klikni', sel: N.selektorPro(el) });
  }

  function priZmene(e) {
    if (!zapnuto || !e.isTrusted || zNasehoPanelu(e)) return;
    const el = e.target;
    if (!el || el.nodeType !== 1) return;
    const sel = N.selektorPro(el);
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      posli({ prikaz: 'vyber', sel, hodnota: o ? N.norm(o.text) : '' });
    } else if (el.type === 'checkbox') {
      posli({ prikaz: el.checked ? 'zaskrtni' : 'odskrtni', sel });
    } else if (el.type === 'radio') {
      posli({ prikaz: 'klikni', sel });
    } else if (el.type === 'file') {
      posli({ prikaz: 'rucne', radek: 'rucne     Vyber soubor a dej Pokračovat' });
    } else if (el.matches('input, textarea')) {
      posli({ prikaz: 'vypln', sel, hodnota: el.value });
    }
  }

  // Enter v poli odešle formulář bez kliknutí – zapíšeme klik na tlačítko, které formulář odeslalo.
  let posledniKlik = 0;
  function priOdeslani(e) {
    if (!zapnuto || zNasehoPanelu(e)) return;
    if (Date.now() - posledniKlik < 500 || !e.submitter) return;
    posli({ prikaz: 'klikni', sel: N.selektorPro(e.submitter) });
  }

  document.addEventListener('click', priKliku, true);
  document.addEventListener('change', priZmene, true);
  document.addEventListener('submit', priOdeslani, true);

  K.nahravac = {
    nastav(z) {
      zapnuto = !!z;
    },
  };
})();
