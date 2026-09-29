// Běží v kontextu stránky (world: MAIN) ještě před jejími skripty.
// 1) Když běží scénář, přebije alert/confirm/prompt, aby dialog nezablokoval přehrávání. Režim čte
//    synchronně ze sessionStorage (nastavuje ho content script), takže funguje i pro alert hned po postbacku.
// 2) Provádí kliknutí za přehrávač: odkaz „javascript:__doPostBack(…)“ Chrome z content scriptu nespustí,
//    z kontextu stránky ano.
(function () {
  'use strict';
  if (window.__klikacDialogy) return;
  window.__klikacDialogy = true;
  var KLIC = 'klikac-dialogy';
  var puvodni = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };

  function rezim() {
    try {
      return window.sessionStorage.getItem(KLIC);
    } catch (e) {
      return null;
    }
  }

  // Záznam jde do fronty v sessionStorage: alert ze startovního skriptu stránky přijde dřív,
  // než content script začne poslouchat; frontu si vyzvedne po načtení.
  function oznam(druh, text, odpoved) {
    try {
      var fronta = JSON.parse(window.sessionStorage.getItem('klikac-dialogy-fronta') || '[]');
      fronta.push({ druh: druh, text: String(text == null ? '' : text), odpoved: odpoved });
      window.sessionStorage.setItem('klikac-dialogy-fronta', JSON.stringify(fronta));
      document.dispatchEvent(new CustomEvent('klikac-dialog'));
    } catch (e) {
      /* nic */
    }
  }

  window.alert = function (text) {
    if (!rezim()) return puvodni.alert.apply(window, arguments);
    oznam('alert', text);
  };
  window.confirm = function (text) {
    var r = rezim();
    if (!r) return puvodni.confirm.apply(window, arguments);
    var odpoved = r !== 'ne';
    oznam('confirm', text, odpoved ? 'ano' : 'ne');
    return odpoved;
  };
  document.addEventListener(
    'klikac-klik',
    function (e) {
      var el = e.target;
      if (!el || typeof el.click !== 'function') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      el.click();
    },
    true,
  );

  window.prompt = function (text, vychozi) {
    if (!rezim()) return puvodni.prompt.apply(window, arguments);
    oznam('prompt', text, vychozi == null ? '' : String(vychozi));
    return vychozi == null ? '' : String(vychozi);
  };
})();
