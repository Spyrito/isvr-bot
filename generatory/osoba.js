import { registruj } from './registr.js';
import { JMENA_MUZI, JMENA_ZENY, PRIJMENI } from './seznamy.js';

// Odvodí ženský tvar příjmení, když data/prijmeni.txt obsahuje jen mužský.
export function zenskyTvar(p) {
  if (/[ýí]$/.test(p)) return p.slice(0, -1) + 'á';
  if (/ek$/.test(p)) return p.slice(0, -2) + 'ková';
  if (/ec$/.test(p)) return p.slice(0, -2) + 'cová';
  if (/[aeo]$/.test(p)) return p.slice(0, -1) + 'ová';
  if (/á$/.test(p)) return p;
  return p + 'ová';
}

const dvojmistne = (n) => String(n).padStart(2, '0');

// Rodné číslo po roce 1954: RRMMDDXXXC, u žen měsíc + 50, celé číslo dělitelné 11.
export function rodneCislo(datum, pohlavi, nahodne) {
  const rr = dvojmistne(datum.getFullYear() % 100);
  const mm = dvojmistne(datum.getMonth() + 1 + (pohlavi === 'Z' ? 50 : 0));
  const dd = dvojmistne(datum.getDate());
  for (;;) {
    const xxx = String(nahodne(0, 999)).padStart(3, '0');
    const prvnich9 = rr + mm + dd + xxx;
    const c = Number(BigInt(prvnich9) % 11n);
    if (c === 10) continue; // kontrolní číslice 10 se po roce 1985 nevydává
    return prvnich9 + c;
  }
}

export function jePlatneRc(rc) {
  const s = String(rc).replace('/', '');
  if (!/^\d{9,10}$/.test(s)) return false;
  if (s.length === 9) return true;
  const mm = parseInt(s.slice(2, 4), 10) % 50;
  const dd = parseInt(s.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  return BigInt(s) % 11n === 0n;
}

registruj({
  nazev: 'osoba',
  typ: 'entita',
  lokalni: true,
  popis: 'fyzická osoba; jméno odpovídá pohlaví, rodné číslo datu narození',
  vytvor(ctx, volby = {}) {
    const pohlavi = volby.pohlavi || ctx.vyber(['M', 'Z']);
    const jmeno = ctx.vyber(ctx.seznam(pohlavi === 'M' ? 'jmena-muzi' : 'jmena-zeny', pohlavi === 'M' ? JMENA_MUZI : JMENA_ZENY));
    const [muz, zena] = ctx.vyber(ctx.seznam('prijmeni', PRIJMENI)).split('|').map((s) => s.trim());
    const prijmeni = pohlavi === 'M' ? muz : zena || zenskyTvar(muz);
    // věk 21–70 let, rok narození nejdřív 1954 (starší RČ mají jiný formát)
    const dnes = new Date();
    const rok = Math.max(1954, dnes.getFullYear() - ctx.nahodne(21, 70));
    const datum = new Date(rok, ctx.nahodne(0, 11), 1);
    const dnuVMesici = new Date(rok, datum.getMonth() + 1, 0).getDate();
    datum.setDate(ctx.nahodne(1, dnuVMesici));
    const rc = rodneCislo(datum, pohlavi, ctx.nahodne);
    const login = ctx.bezDiakritiky(`${jmeno}.${prijmeni}`).toLowerCase();
    return {
      pohlavi,
      jmeno,
      prijmeni,
      cele_jmeno: `${jmeno} ${prijmeni}`,
      datum_nar: ctx.datum(datum),
      rok_nar: String(rok),
      vek: String(dnes.getFullYear() - rok - (dnes < new Date(dnes.getFullYear(), datum.getMonth(), datum.getDate()) ? 1 : 0)),
      rc,
      rc_lomitko: `${rc.slice(0, 6)}/${rc.slice(6)}`,
      email: `${login}.${ctx.nahodne(10, 99)}@example.cz`,
      telefon: `${ctx.vyber(['6', '7'])}${ctx.nahodne(10, 99)}${String(ctx.nahodne(0, 999999)).padStart(6, '0')}`,
    };
  },
  sber(d, prefix) {
    return { [prefix]: d.cele_jmeno, [prefix + '_rc']: d.rc_lomitko };
  },
});
