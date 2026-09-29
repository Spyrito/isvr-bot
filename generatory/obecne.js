import { registruj } from './registr.js';

const PISMENA = 'ABCDEFGHJKLMNPRSTUVXYZ';

registruj({
  nazev: 'dnes', typ: 'funkce', priklad: '{dnes}, {dnes:+30}',
  popis: 'dnešní datum (d.m.rrrr), volitelně posunuté o dny',
  hodnota(arg, ctx) {
    const d = new Date();
    if (arg) {
      const n = parseInt(arg, 10);
      if (isNaN(n)) throw new Error(`{dnes:${arg}}: čekám počet dní, např. {dnes:-30}`);
      d.setDate(d.getDate() + n);
    }
    return ctx.datum(d);
  },
});

registruj({ nazev: 'rok', typ: 'funkce', priklad: '{rok}', popis: 'letošní rok', hodnota: () => String(new Date().getFullYear()) });

registruj({
  nazev: 'uid', typ: 'funkce', priklad: '{uid}', popis: 'krátký jedinečný kód (8 znaků)',
  hodnota: (arg, ctx) => (Date.now().toString(36).slice(-5) + ctx.kod(3)).toUpperCase(),
});

registruj({
  nazev: 'email', typ: 'funkce', priklad: '{email}', popis: 'náhodný e-mail na example.cz',
  hodnota: (arg, ctx) => `test.${ctx.kod(6).toLowerCase()}@example.cz`,
});

registruj({
  nazev: 'telefon', typ: 'funkce', priklad: '{telefon}', popis: 'mobilní číslo (9 číslic)',
  hodnota: (arg, ctx) => `${ctx.vyber(['6', '7'])}${ctx.nahodne(10, 99)}${String(ctx.nahodne(0, 999999)).padStart(6, '0')}`,
});

registruj({
  nazev: 'nahodne', typ: 'funkce', priklad: '{nahodne:6}', popis: 'náhodné číslice dané délky',
  hodnota(arg, ctx) {
    const n = Math.min(parseInt(arg || '6', 10) || 6, 50);
    let s = '';
    for (let i = 0; i < n; i++) s += ctx.nahodne(0, 9);
    return s;
  },
});

registruj({
  nazev: 'pismena', typ: 'funkce', priklad: '{pismena:4}', popis: 'náhodná velká písmena dané délky',
  hodnota(arg, ctx) {
    const n = Math.min(parseInt(arg || '4', 10) || 4, 50);
    let s = '';
    for (let i = 0; i < n; i++) s += PISMENA[ctx.nahodne(0, PISMENA.length - 1)];
    return s;
  },
});

registruj({
  nazev: 'cislo', typ: 'funkce', priklad: '{cislo:1-100}', popis: 'náhodné celé číslo v rozsahu',
  hodnota(arg, ctx) {
    const m = String(arg || '').match(/^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/);
    if (!m) throw new Error('{cislo:od-do}: čekám rozsah, např. {cislo:1-100}');
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    return String(ctx.nahodne(Math.min(a, b), Math.max(a, b)));
  },
});

registruj({
  nazev: 'vyber', typ: 'funkce', priklad: '{vyber:a|b|c}', popis: 'náhodně jedna z možností',
  hodnota(arg, ctx) {
    if (arg == null) throw new Error('{vyber:a|b|c}: chybí možnosti');
    return ctx.vyber(String(arg).split('|'));
  },
});
