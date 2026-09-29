import { registruj } from './registr.js';
import { ULICE, MESTA } from './seznamy.js';

registruj({
  nazev: 'adresa',
  typ: 'entita',
  lokalni: true,
  popis: 'adresa; PSČ odpovídá městu',
  vytvor(ctx) {
    const ulice = ctx.vyber(ctx.seznam('ulice', ULICE));
    const [mesto, pscRaw] = ctx.vyber(ctx.seznam('mesta', MESTA)).split('|').map((s) => s.trim());
    const psc = (pscRaw || String(ctx.nahodne(10000, 79999))).replace(/\s/g, '');
    const cp = String(ctx.nahodne(1, 2999));
    const co = String(ctx.nahodne(1, 40));
    return {
      ulice,
      cp,
      co,
      cislo: `${cp}/${co}`,
      mesto,
      psc,
      psc_mezera: `${psc.slice(0, 3)} ${psc.slice(3)}`,
      cela: `${ulice} ${cp}/${co}, ${psc.slice(0, 3)} ${psc.slice(3)} ${mesto}`,
    };
  },
});
