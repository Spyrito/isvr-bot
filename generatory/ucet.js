// Ukázkový plugin s algoritmem: číslo bankovního účtu, které projde kontrolou modulo 11.
// Takhle se přidává vlastní generátor – soubor tady + import v index.js + znovunačtení rozšíření.
import { registruj } from './registr.js';

const VAHY = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];
const BANKY = ['0100', '0300', '0600', '0800', '2010', '3030', '5500', '6100'];

export function jePlatneCisloUctu(cislo) {
  const s = String(cislo).padStart(10, '0');
  if (!/^\d{10}$/.test(s)) return false;
  let soucet = 0;
  for (let i = 0; i < 10; i++) soucet += Number(s[i]) * VAHY[i];
  return soucet % 11 === 0;
}

registruj({
  nazev: 'ucet',
  typ: 'funkce',
  priklad: '{ucet}, {ucet:0800}',
  popis: 'číslo účtu s kódem banky, projde kontrolou modulo 11',
  hodnota(arg, ctx) {
    for (;;) {
      const zaklad = String(ctx.nahodne(1, 9)) + String(ctx.nahodne(0, 99999999)).padStart(8, '0');
      let soucet = 0;
      for (let i = 0; i < 9; i++) soucet += Number(zaklad[i]) * VAHY[i];
      const posledni = (11 - (soucet % 11)) % 11;
      if (posledni === 10) continue;
      return `${zaklad}${posledni}/${arg || ctx.vyber(BANKY)}`;
    }
  },
});
