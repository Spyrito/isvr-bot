// Běží v kontextu stránky (world: MAIN) ještě před jejími skripty.
// 1) Když běží scénář, přebije alert/confirm/prompt, aby dialog nezablokoval přehrávání. Režim čte
//    synchronně ze sessionStorage (nastavuje ho content script), takže funguje i pro alert hned po postbacku.
// 2) Provádí kliknutí za přehrávač: odkaz „javascript:__doPostBack(…)“ Chrome z content scriptu nespustí,
//    z kontextu stránky ano.
// 3) Počítá běžící AJAXové požadavky, 4) zachytává chyby hlášené do logu Wicketu (viz níže).
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

  // 3) Počítá rozběhnuté AJAXové požadavky (Wicket, jQuery, fetch), aby přehrávač po akci počkal na odpověď.
  //    Stav je v atributu data-klikac-ajax na <html>, content script ho čte (sdílí s námi DOM).
  var beziAjax = 0;
  function ajax(zmena) {
    beziAjax = Math.max(0, beziAjax + zmena);
    var h = document.documentElement;
    if (!h) return;
    h.setAttribute('data-klikac-ajax', String(beziAjax));
    if (!beziAjax) h.setAttribute('data-klikac-ajax-konec', String(Date.now()));
  }
  var puvodniSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    ajax(1);
    var hotovo = false;
    this.addEventListener('loadend', function () {
      if (!hotovo) ajax(-1);
      hotovo = true;
    });
    try {
      return puvodniSend.apply(this, arguments);
    } catch (e) {
      if (!hotovo) ajax(-1);
      hotovo = true;
      throw e;
    }
  };
  if (window.fetch) {
    var puvodniFetch = window.fetch;
    window.fetch = function () {
      ajax(1);
      return puvodniFetch.apply(this, arguments).then(
        function (r) {
          ajax(-1);
          return r;
        },
        function (e) {
          ajax(-1);
          throw e;
        },
      );
    };
  }

  // 4) Chyby, které aplikace ohlásí jen do logu Wicketu (např. „Nastala interní chyba“ po AJAXu).
  //    Text jde do data-klikac-chyba; přehrávač ho před akcí smaže a po ní zkontroluje.
  function zapisChybu(text) {
    var h = document.documentElement;
    if (h && text) h.setAttribute('data-klikac-chyba', String(text).replace(/\s+/g, ' ').slice(0, 400));
  }
  function textChyby(s) {
    s = String(s || '');
    var m = s.match(/message\s*:\s*'([^']*)'/);
    return m ? m[1] : s;
  }
  function napojWicket() {
    var W = window.Wicket;
    if (!W || W.__klikac) return !!W;
    W.__klikac = true;
    try {
      if (W.Log && typeof W.Log.error === 'function') {
        var puvodniError = W.Log.error;
        W.Log.error = function () {
          var s = Array.prototype.join.call(arguments, ' ');
          if (/interní chyba|Exception|chyba/i.test(s)) zapisChybu(textChyby(s));
          return puvodniError.apply(this, arguments);
        };
      }
      if (W.Event && typeof W.Event.subscribe === 'function') {
        W.Event.subscribe('/ajax/call/failure', function () {
          zapisChybu('AJAXový požadavek aplikace selhal');
        });
      }
    } catch (e) {
      /* jiná verze Wicketu */
    }
    return true;
  }
  document.addEventListener('DOMContentLoaded', napojWicket);
  window.addEventListener('load', napojWicket);
})();
