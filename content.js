// Content script: v horním rámci přehrávač a panel, v každém rámci nahrávač a přeposílání dialogů.
(() => {
  'use strict';
  const K = globalThis.Klikac;
  // Po znovunačtení rozšíření je starý content script odpojený – nový se pak musí zaregistrovat znovu.
  if (!K || (K.spusteno && K.zije())) return;
  K.spusteno = true;
  K.zije = () => {
    try {
      return !!chrome.runtime.id;
    } catch {
      return false;
    }
  };
  const horni = window === window.top;

  function nastavDialogy(rezim) {
    try {
      if (rezim) sessionStorage.setItem('klikac-dialogy', rezim);
      else sessionStorage.removeItem('klikac-dialogy');
    } catch {
      /* stránka bez sessionStorage */
    }
  }

  function aplikuj(pohled) {
    if (!pohled) return;
    nastavDialogy(pohled.dialogy);
    K.nahravac.nastav(!!pohled.nahravani);
    K.panel.aktualizuj(pohled);
    if (horni) K.prehravac.hlidejDokud(pohled);
  }

  chrome.runtime.onMessage.addListener((z, s, odpoved) => {
    switch (z && z.typ) {
      case 'ping':
        if (horni) odpoved({ ok: true });
        return false;
      case 'stav':
        aplikuj(z.pohled);
        return false;
      case 'krok':
        if (!horni) return false;
        K.prehravac.proved(z.krok).then(odpoved);
        return true;
      case 'zvyrazni':
        if (!horni) return false;
        odpoved(K.prehravac.zvyrazni(z.sel, z.barva, z.trvale));
        return false;
      case 'zrus':
        if (horni) K.prehravac.zrus();
        return false;
      default:
        return false;
    }
  });

  // page-dialogs.js (kontext stránky) zapisuje odkliknuté dialogy do fronty v sessionStorage
  function vyzvedniDialogy() {
    let fronta = [];
    try {
      fronta = JSON.parse(sessionStorage.getItem('klikac-dialogy-fronta') || '[]');
      sessionStorage.removeItem('klikac-dialogy-fronta');
    } catch {
      return;
    }
    for (const d of fronta) chrome.runtime.sendMessage({ typ: 'dialog', druh: d.druh, text: d.text, odpoved: d.odpoved }).catch(() => {});
  }
  document.addEventListener('klikac-dialog', vyzvedniDialogy);
  vyzvedniDialogy();

  chrome.runtime
    .sendMessage({ typ: 'ready', horni })
    .then((r) => r && aplikuj(r.pohled))
    .catch(() => {});
})();
