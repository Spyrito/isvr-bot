// Přehrávač: běží v horním rámci a provádí jednotlivé kroky, které posílá background.
// Do same-origin rámců sahá přímo. Každý krok čeká, až je prvek vidět a je aktivní.
(() => {
  'use strict';
  const K = (globalThis.Klikac ||= {});
  const N = K.najdi;
  let generace = 0;

  const spi = (ms) => new Promise((r) => setTimeout(r, ms));
  const sekundy = (ms) => `${Math.round(ms / 100) / 10} s`.replace('.', ',');

  class Selhani extends Error {
    constructor(zprava, prvek) {
      super(zprava);
      this.prvek = prvek;
    }
  }

  // Opakuje fn, dokud nevrátí něco pravdivého. ChybaHledani (např. rámec se ještě načítá) = zkoušet dál.
  async function cekej(fn, timeout, popisChyby) {
    const moje = generace;
    const konec = Date.now() + timeout;
    let posledni = null;
    for (;;) {
      if (moje !== generace) throw new Selhani('zastaveno');
      try {
        const r = fn();
        if (r) return r;
      } catch (e) {
        if (e instanceof N.ChybaHledani) posledni = e.message;
        else throw e;
      }
      if (Date.now() >= konec) {
        const p = popisChyby();
        throw posledni && !p.prvek ? new Selhani(posledni) : new Selhani(p.zprava, p.prvek);
      }
      await spi(100);
    }
  }

  async function najdiPouzitelny(sel, ucel, timeout, potrebaAktivni = true) {
    let stav = 'nenalezen';
    let kandidat = null;
    return cekej(
      () => {
        const vse = N.prvky(sel, ucel);
        if (!vse.length) {
          stav = 'nenalezen';
          return null;
        }
        const vid = vse.filter(N.viditelny);
        if (!vid.length) {
          stav = 'skryty';
          kandidat = vse[0];
          return null;
        }
        const akt = potrebaAktivni ? vid.filter(N.aktivni) : vid;
        if (!akt.length) {
          stav = 'neaktivni';
          kandidat = vid[0];
          return null;
        }
        return akt[0];
      },
      timeout,
      () => ({
        zprava: { nenalezen: `prvek nenalezen do ${sekundy(timeout)}`, skryty: `prvek je skrytý (čekáno ${sekundy(timeout)})`, neaktivni: `prvek je neaktivní (čekáno ${sekundy(timeout)})` }[stav],
        prvek: kandidat,
      }),
    );
  }

  // ---------- události ----------

  function zamer(el) {
    const d = el.ownerDocument;
    try {
      el.focus();
    } catch {
      /* nic */
    }
    if (d.activeElement !== el || !d.hasFocus()) {
      el.dispatchEvent(new FocusEvent('focus'));
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    }
  }

  function rozmer(el) {
    const d = el.ownerDocument;
    const melFocus = d.activeElement === el && d.hasFocus();
    try {
      el.blur();
    } catch {
      /* nic */
    }
    if (!melFocus) {
      el.dispatchEvent(new FocusEvent('blur'));
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    }
  }

  const udalost = (el, typ) => el.dispatchEvent(new Event(typ, { bubbles: true, cancelable: true }));

  function jeTextovePole(el) {
    if (el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return el.tagName === 'INPUT' && !/^(checkbox|radio|submit|button|reset|image|file|hidden)$/i.test(el.type);
  }

  function klikni(el) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    el.dispatchEvent(new PointerEvent('pointerup', init));
    el.dispatchEvent(new MouseEvent('mouseup', init));
    // Klik provede page-dialogs.js v kontextu stránky (kvůli odkazům javascript:), jinak klikneme sami.
    const provedenoStrankou = !el.dispatchEvent(new CustomEvent('klikac-klik', { bubbles: true, cancelable: true, composed: true }));
    if (!provedenoStrankou) el.click();
  }

  function vypln(el, hodnota) {
    if (el.tagName === 'SELECT') return vyberMoznost(el, hodnota);
    if (!jeTextovePole(el)) throw new Selhani(`vypln: prvek <${el.tagName.toLowerCase()} type=${el.type || ''}> není textové pole (na checkbox použij zaskrtni)`, el);
    zamer(el);
    if (el.isContentEditable) el.textContent = hodnota;
    else el.value = hodnota;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: hodnota }));
    udalost(el, 'change');
    rozmer(el);
  }

  async function pis(el, hodnota) {
    if (!jeTextovePole(el) || el.isContentEditable) throw new Selhani('pis: prvek není textové pole', el);
    zamer(el);
    el.value = '';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    for (const ch of String(hodnota)) {
      const kod = ch.charCodeAt(0);
      const zaklad = { key: ch, bubbles: true, cancelable: true, composed: true };
      const dolu = el.dispatchEvent(new KeyboardEvent('keydown', { ...zaklad, keyCode: ch.toUpperCase().charCodeAt(0), which: ch.toUpperCase().charCodeAt(0) }));
      const stisk = el.dispatchEvent(new KeyboardEvent('keypress', { ...zaklad, keyCode: kod, charCode: kod, which: kod }));
      // maska, která si znak vloží sama, zruší keypress – pak nevkládáme
      if (dolu && stisk) {
        try {
          const a = el.selectionStart ?? el.value.length;
          const b = el.selectionEnd ?? el.value.length;
          el.setRangeText(ch, a, b, 'end');
        } catch {
          el.value += ch; // type=email/number nemají výběr
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
      }
      el.dispatchEvent(new KeyboardEvent('keyup', { ...zaklad, keyCode: ch.toUpperCase().charCodeAt(0), which: ch.toUpperCase().charCodeAt(0) }));
      await spi(15);
    }
    udalost(el, 'change');
    rozmer(el);
  }

  function najdiMoznost(el, hodnota) {
    const t = N.norm(hodnota);
    const tl = t.toLowerCase();
    const o = Array.from(el.options);
    return (
      o.find((x) => N.norm(x.text) === t) ||
      o.find((x) => x.value === hodnota) ||
      o.find((x) => N.norm(x.text).toLowerCase() === tl) ||
      o.find((x) => N.norm(x.text).toLowerCase().includes(tl))
    );
  }

  function vyberMoznost(el, hodnota) {
    const o = najdiMoznost(el, hodnota);
    if (!o) {
      const je = Array.from(el.options).map((x) => N.norm(x.text)).filter(Boolean);
      throw new Selhani(`položka „${hodnota}“ v seznamu neexistuje (je tam: ${je.slice(0, 12).join(', ')}${je.length > 12 ? ', …' : ''})`, el);
    }
    if (el.value === o.value && o.selected) return; // už vybráno – nevyvolávat zbytečný postback
    zamer(el);
    el.selectedIndex = o.index;
    udalost(el, 'input');
    udalost(el, 'change');
    rozmer(el);
  }

  function hodnotaPrvku(el) {
    if (el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type)) return el.checked ? 'ano' : 'ne';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value;
    if (el.tagName === 'SELECT') return el.selectedIndex >= 0 ? N.norm(el.options[el.selectedIndex].text) : '';
    return N.norm(el.innerText != null ? el.innerText : el.textContent);
  }

  function checkboxZ(el) {
    if (el.tagName === 'LABEL' && el.control) return el.control;
    if (el.tagName !== 'INPUT') {
      const vnitrni = el.querySelector && el.querySelector('input[type=checkbox], input[type=radio]');
      if (vnitrni) return vnitrni;
    }
    return el;
  }

  // Tlačítka, na která Klikač nikdy neklikne („zakazane = A | B“ v nastaveni.txt), např. zápis do rejstříku.
  function hlidejZakaz(el, k) {
    const zak = (k.zakazane || []).map((z) => N.norm(z).toLowerCase()).filter(Boolean);
    if (!zak.length) return;
    const t = N.textPrvku(el).toLowerCase();
    const shoda = zak.find((z) => t === z);
    if (shoda) throw new Selhani(`klik na „${N.textPrvku(el)}“ je zakázaný (zakazane v nastaveni.txt) – udělej ho ručně`, el);
  }

  // ---------- nabídky (jQuery UI menu za zeleným + ve stromu ISVR) ----------

  // Najetí myší: jQuery UI otevírá podnabídku a nastavuje aktivní položku na mouseenter (= mouseover).
  // relatedTarget = seznam, ze kterého myš „přijela“ – jinak jQuery pošle mouseenter i nadřazené položce
  // a aktivní (vybraná) zůstane ta nadřazená.
  function najed(el) {
    const r = el.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true, composed: true, view: el.ownerDocument.defaultView,
      clientX: r.left + Math.min(10, r.width / 2), clientY: r.top + r.height / 2, relatedTarget: el.parentElement,
    };
    el.dispatchEvent(new PointerEvent('pointerover', init));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }));
    el.dispatchEvent(new MouseEvent('mousemove', init));
  }

  // Aktivní položka jQuery UI menu má třídu ui-state-focus (starší verze ui-state-active na odkazu).
  const jeAktivni = (li) => li.matches('.ui-state-focus, .ui-state-active') || !!li.querySelector(':scope > .ui-state-focus, :scope > .ui-state-active');

  // Tlačítko, které nabídku otevírá: přímo zadané, nebo + u uzlu stromu.
  function spoustecMenu(el) {
    if (el.matches('.context-menu-invoker')) return el;
    const uzel = el.closest('.tree-node');
    // + s nabídkou (context-menu-invoker), nebo obyčejné + skupiny (Předměty podnikání přidá rovnou další)
    const inv = uzel && uzel.querySelector('.context-menu-invoker, a[id^="addButton"]');
    return inv || el;
  }

  function korenMenu() {
    for (const d of N.vsechnyDokumenty()) {
      const el = d.querySelector('[id^="addMasterItemsButton"] .context-menu-invoker') || d.querySelector('.tree .context-menu-invoker, .context-menu-invoker');
      if (el) return el;
    }
    return null;
  }

  const vlastniText = (li) =>
    N.norm(Array.from(li.childNodes).filter((n) => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map((n) => n.textContent).join(' '));

  function polozkyMenu(nabidka) {
    if (nabidka) {
      const seznam = nabidka.matches('ul, ol') ? nabidka : nabidka.querySelector('ul, ol');
      return seznam ? Array.from(seznam.children).filter((e) => e.tagName === 'LI') : [];
    }
    // neznámá nabídka: viditelné položky kdekoli na stránce
    return N.vsechnyDokumenty().flatMap((d) => Array.from(d.querySelectorAll('[role=menuitem], .ui-menu-item')).filter(N.viditelny));
  }

  function polozkaMenu(nabidka, text) {
    const t = N.norm(text).toLowerCase();
    const vse = polozkyMenu(nabidka).filter((li) => !li.matches('.ui-state-disabled, [aria-disabled=true]'));
    return vse.find((li) => vlastniText(li).toLowerCase() === t) || vse.find((li) => vlastniText(li).toLowerCase().startsWith(t)) || null;
  }

  // menu SEL = A > B     otevře nabídku tlačítkem SEL (u uzlu stromu jeho +) a vybere A, v ní B
  // pridej SEL [= A > B]  klikne na + u uzlu stromu; když se objeví nabídka, vybere z ní
  // SEL „strom“ = + pod názvem subjektu; když tam položka A není, protože skupina A už ve stromu je
  // (např. Předměty podnikání), použije se + té skupiny.
  async function vyberZMenu(k, t) {
    let cesta = String(k.hodnota || '').split('>').map((s) => N.norm(s)).filter(Boolean);
    if (!cesta.length && k.prikaz === 'menu') throw new Selhani('menu: chybí položka (menu SEL = Položka > Podpoložka)');
    const strom = /^strom$/i.test(String(k.sel).trim());
    let najdiSpoustec = async () =>
      strom
        ? cekej(korenMenu, t, () => ({ zprava: 'strom: tlačítko + pod názvem subjektu nenalezeno' }))
        : spoustecMenu(await najdiPouzitelny(k.sel, 'klik', t));
    const nabidkaK = (s) => s.parentElement && s.parentElement.querySelector(':scope > .context-menu, :scope > [role=menu]');

    // Klikne na tlačítko. ISVR po kliknutí na + nabídku znovu vykreslí AJAXem – počkat a najít tlačítko
    // i nabídku znovu, jinak by se najíždělo na položky staré, už odpojené nabídky.
    async function otevri() {
      const s = await najdiSpoustec();
      hlidejZakaz(s, k);
      klikni(s);
      await spi(300);
      await klid(Math.min(t, 10000));
      let znovu = s;
      if (!s.isConnected) znovu = await najdiSpoustec().catch(() => s);
      let nabidka = nabidkaK(znovu);
      if (nabidka) {
        await cekej(
          () => {
            nabidka = nabidkaK(znovu) || nabidka;
            return N.viditelny(nabidka);
          },
          3000,
          () => ({ zprava: '' }),
        ).catch(() => {}); // neviditelná nabídka nevadí, položky dostanou události i tak
      }
      return [znovu, nabidka];
    }

    let [spoustec, nabidka] = await otevri();
    if (!cesta.length) return; // pridej bez nabídky: stačilo kliknout na +

    if (strom && !polozkaMenu(nabidka, cesta[0])) {
      const selSkupiny = 'uzel:"' + cesta[0].replace(/"/g, '') + '"';
      const skupina = N.prvky(selSkupiny).find(N.viditelny);
      if (skupina) {
        klikni(spoustec.ownerDocument.body); // zavřít nabídku stromu
        najdiSpoustec = async () => spoustecMenu(N.prvky(selSkupiny).find(N.viditelny) || skupina);
        cesta = cesta.slice(1);
        [spoustec, nabidka] = await otevri();
        if (!cesta.length) return;
      }
    }

    for (let i = 0; i < cesta.length; i++) {
      const pol = await cekej(
        () => polozkaMenu(nabidka, cesta[i]),
        Math.min(t, 5000),
        () => ({
          zprava: `${k.prikaz}: položka „${cesta[i]}“ nenalezena (je tam: ${polozkyMenu(nabidka).map(vlastniText).filter(Boolean).join(', ') || 'nic'})`,
          prvek: spoustec,
        }),
      );
      najed(pol);
      if (i < cesta.length - 1) {
        nabidka = pol.querySelector(':scope > ul, :scope > ol, :scope > [role=menu]');
        // jQuery UI otevírá podnabídku se zpožděním (~300 ms)
        await cekej(() => !nabidka || N.viditelny(nabidka), 2000, () => ({ zprava: '' })).catch(() => {});
      } else {
        // kdyby menu položku neoznačilo, výběr by se poslal pro nadřazenou položku – radši chyba
        if (/\bui-menu-item\b/.test(pol.className)) {
          await cekej(() => jeAktivni(pol), 1000, () => ({ zprava: `${k.prikaz}: položku „${cesta[i]}“ se nepodařilo označit`, prvek: pol }));
        }
        hlidejZakaz(pol, k);
        klikni(pol);
      }
    }
  }

  // ---------- klid po akci ----------

  const ajaxBezi = () => N.vsechnyDokumenty().some((d) => (d.documentElement.getAttribute('data-klikac-ajax') || '0') !== '0');

  function smazChybyAplikace() {
    for (const d of N.vsechnyDokumenty()) d.documentElement.removeAttribute('data-klikac-chyba');
  }

  // Počká, až doběhnou AJAXové požadavky a 400 ms žádný nezačne (nejdéle timeout – pak se jde dál),
  // a zkontroluje chyby aplikace:
  // chybu zachycenou z logu Wicketu a viditelný prvek podle „chyba =“ v nastaveni.txt.
  async function klid(timeout, chybaSel) {
    const konec = Date.now() + timeout;
    let od = null;
    while (Date.now() < konec) {
      if (ajaxBezi()) {
        od = null;
      } else {
        if (od === null) od = Date.now();
        // ISVR posílá AJAX až ~150 ms po kliknutí (strom), proto se čeká na delší klid
        if (Date.now() - od >= 400) break;
      }
      await spi(50);
    }
    for (const d of N.vsechnyDokumenty()) {
      const c = d.documentElement.getAttribute('data-klikac-chyba');
      if (c) return { ok: false, chyba: 'aplikace hlásí chybu: ' + c };
    }
    if (chybaSel) {
      try {
        const el = N.prvky(chybaSel, 'text').find(N.viditelny);
        if (el) {
          N.zvyrazni(el, 'chyba', true);
          return { ok: false, chyba: 'aplikace hlásí chybu: ' + N.textPrvku(el).slice(0, 300) };
        }
      } catch {
        /* neplatný selektor v nastavení – nekontrolovat */
      }
    }
    return { ok: true };
  }

  // ---------- kroky ----------

  async function proved(k) {
    const t = k.timeout || 10000;
    switch (k.prikaz) {
      case 'menu':
      case 'pridej':
        await vyberZMenu(k, t);
        return {};
      case 'klikni': {
        const el = await najdiPouzitelny(k.sel, 'klik', t);
        hlidejZakaz(el, k);
        klikni(el);
        return {};
      }
      case 'vypln':
      case 'pis':
      case 'vyber': {
        const el = await najdiPouzitelny(k.sel, 'pole', t);
        if (k.prikaz === 'vyber') {
          if (el.tagName !== 'SELECT') throw new Selhani('vyber: prvek není rozbalovací seznam (select)', el);
          // položky se můžou dotahovat (kaskádové seznamy) – chvíli počkat
          await cekej(() => najdiMoznost(el, k.hodnota), Math.min(t, 3000), () => ({ zprava: '', prvek: el })).catch(() => {});
          vyberMoznost(el, k.hodnota);
        } else if (k.prikaz === 'pis') await pis(el, k.hodnota);
        else vypln(el, k.hodnota);
        return {};
      }
      case 'zaskrtni':
      case 'odskrtni': {
        const el = checkboxZ(await najdiPouzitelny(k.sel, 'klik', t));
        if (el.tagName !== 'INPUT' || !/^(checkbox|radio)$/i.test(el.type)) throw new Selhani(`${k.prikaz}: prvek není checkbox`, el);
        const chci = k.prikaz === 'zaskrtni';
        if (!chci && el.type === 'radio') throw new Selhani('odskrtni: přepínač (radio) nejde odškrtnout, klikni na jiný', el);
        if (el.checked !== chci) klikni(el);
        if (el.checked !== chci && el.isConnected) throw new Selhani(`${k.prikaz}: stránka změnu nepovolila`, el);
        return {};
      }
      case 'cekej-na':
        await najdiPouzitelny(k.sel, 'text', t, false);
        return {};
      case 'zmiz':
        await cekej(
          () => {
            try {
              return !N.prvky(k.sel, 'text').some(N.viditelny);
            } catch (e) {
              if (e instanceof N.ChybaHledani) return true;
              throw e;
            }
          },
          t,
          () => ({ zprava: `prvek nezmizel do ${sekundy(t)}` }),
        );
        return {};
      case 'zapamatuj': {
        const re = k.regex ? new RegExp(k.regex.zdroj, k.regex.priznaky) : null;
        let text = '';
        const hodnota = await cekej(
          () => {
            const vse = N.prvky(k.sel, 'text');
            if (!vse.length) return null;
            const el = vse.find(N.viditelny) || vse[0];
            text = hodnotaPrvku(el);
            if (!re) return { h: text };
            const m = text.match(re);
            return m ? { h: m[1] !== undefined ? m[1] : m[0] } : null;
          },
          t,
          () => ({ zprava: text ? `regulární výraz /${k.regex.zdroj}/ v textu „${text.slice(0, 80)}“ nic nenašel` : `prvek nenalezen do ${sekundy(t)}` }),
        );
        return { hodnota: hodnota.h };
      }
      default:
        throw new Selhani(`přehrávač nezná příkaz ${k.prikaz}`);
    }
  }

  // ---------- hlídání „rucne … dokud SEL“ ----------

  let hlidani = null;

  function hlidejDokud(pohled) {
    const b = pohled && pohled.beh;
    const klic = b && b.stav === 'rucne' && b.dokud ? `${b.id}:${b.pc}` : null;
    if (hlidani && hlidani.klic === klic) return;
    if (hlidani) clearInterval(hlidani.t);
    hlidani = null;
    if (!klic) return;
    hlidani = {
      klic,
      t: setInterval(() => {
        try {
          if (!N.prvky(b.dokud, 'text').some(N.viditelny)) return;
        } catch {
          return;
        }
        clearInterval(hlidani.t);
        chrome.runtime.sendMessage({ typ: 'ovladani', akce: 'pokracuj', jenVeStavu: 'rucne', behId: b.id });
      }, 500),
    };
  }

  K.prehravac = {
    async proved(krok) {
      N.zrusZvyrazneni();
      try {
        if (krok.akce) smazChybyAplikace();
        return { ok: true, ...(await proved(krok)) };
      } catch (e) {
        if (e.prvek) {
          try {
            N.zvyrazni(e.prvek, 'chyba', true);
          } catch {
            /* nic */
          }
        }
        return { ok: false, chyba: e.message };
      }
    },
    zrus() {
      generace++;
    },
    klid,
    zvyrazni(sel, barva = 'info', trvale = false) {
      N.zrusZvyrazneni();
      let vse;
      try {
        vse = N.prvky(sel, 'klik');
        if (!vse.length) vse = N.prvky(sel, 'text');
      } catch (e) {
        return { ok: false, chyba: e.message };
      }
      const vid = vse.filter(N.viditelny);
      if (!vid.length) return { ok: false, pocet: vse.length, chyba: vse.length ? `nalezeno ${vse.length}, ale nic není vidět` : 'nic nenalezeno' };
      vid[0].scrollIntoView({ block: 'center', inline: 'nearest' });
      vid.forEach((el, i) => N.zvyrazni(el, i === 0 ? barva : '#f9ab00', trvale));
      return { ok: true, pocet: vid.length };
    },
    hlidejDokud,
  };
})();
