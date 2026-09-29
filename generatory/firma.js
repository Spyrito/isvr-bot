import { registruj } from './registr.js';
import { FIRMY_ZAKLAD, FIRMY_OBOR, FORMY, PRIJMENI } from './seznamy.js';

// IČO: 7 číslic s vahami 8..2, kontrolní číslice = (11 - součet mod 11) mod 10
export function kontrolniCisliceIco(prvnich7) {
  let s = 0;
  for (let i = 0; i < 7; i++) s += Number(prvnich7[i]) * (8 - i);
  return (11 - (s % 11)) % 10;
}

export function ico(nahodne) {
  const prvnich7 = String(nahodne(1, 9)) + String(nahodne(0, 999999)).padStart(6, '0');
  return prvnich7 + kontrolniCisliceIco(prvnich7);
}

export function jePlatneIco(s) {
  s = String(s);
  return /^\d{8}$/.test(s) && kontrolniCisliceIco(s) === Number(s[7]);
}

// v.o.s. a k.s. se oddělují čárkou („Horák a Beneš, v.o.s.“)
export function sFormou(nazev, forma) {
  return /^(v\.o\.s\.|k\.s\.)$/.test(forma) ? `${nazev}, ${forma}` : `${nazev} ${forma}`;
}

registruj({
  nazev: 'firma',
  typ: 'entita',
  lokalni: false,
  popis: 'právnická osoba; jedna na celé spuštění, takže úseky vidí název a IČO zakládané firmy',
  sledujVyplneni: 'nazev_firmy',
  vytvor(ctx) {
    const zaklad = ctx.vyber(ctx.seznam('firmy-zaklad', FIRMY_ZAKLAD));
    const obor = ctx.vyber(ctx.seznam('firmy-obor', FIRMY_OBOR));
    const prijmeni = ctx.seznam('prijmeni', PRIJMENI).map((p) => p.split('|')[0].trim());
    const p1 = ctx.vyber(prijmeni);
    let p2 = ctx.vyber(prijmeni);
    for (let i = 0; p2 === p1 && i < 10; i++) p2 = ctx.vyber(prijmeni);
    const forma = ctx.vyber(ctx.seznam('formy', FORMY));
    const kod = ctx.kod(3);
    const i = ico(ctx.nahodne);
    const nazev = zaklad + ' ' + obor;
    return {
      nazev,
      forma,
      nazev_s_formou: sFormou(nazev, forma),
      nazev_unik: `${nazev} ${kod}`,
      ico: i,
      dic: 'CZ' + i,
      kod,
      _styly: { normalni: nazev, prijmeni: `${p1} a ${p2}`, kratky: zaklad },
    };
  },
  // {firma.nazev:prijmeni}, {firma.nazev_unik:kratky}, {firma.nazev_s_formou:kratky}
  vlastnost(d, nazev, arg) {
    if (!arg || !['nazev', 'nazev_unik', 'nazev_s_formou'].includes(nazev)) return undefined;
    const zaklad = d._styly[arg];
    if (zaklad === undefined) throw new Error(`neznámý styl názvu „${arg}“ (znám: ${Object.keys(d._styly).join(', ')})`);
    if (nazev === 'nazev') return zaklad;
    if (nazev === 'nazev_unik') return `${zaklad} ${d.kod}`;
    return sFormou(zaklad, d.forma);
  },
  // nazev_firmy se do výstupu zapíše tak, jak se vyplnil (sledujVyplneni), i s formou ze scénáře
  sber(d) {
    return { ico: d.ico };
  },
});
