import { registruj } from './registr.js';
import { SPOLKY_KDO, SPOLKY_CO, SPOLKY_KDE } from './seznamy.js';
import { ico } from './firma.js';

// Bez souboru data/spolky.txt se název skládá ze tří částí („přátel historie Kladna“).
// V data/spolky.txt je jeden název nebo vzor na řádek, vzor může obsahovat {vyber:a|b}, {cislo:1-9} apod.
registruj({
  nazev: 'spolek',
  typ: 'entita',
  lokalni: false,
  popis: 'spolek; název bez slova „Spolek“, to se píše do scénáře',
  sledujVyplneni: 'nazev_spolku',
  vytvor(ctx) {
    const vlastni = ctx.seznam('spolky', null);
    const nazev = vlastni && vlastni.length
      ? ctx.sablona(ctx.vyber(vlastni))
      : `${ctx.vyber(SPOLKY_KDO)} ${ctx.vyber(SPOLKY_CO)} ${ctx.vyber(SPOLKY_KDE)}`;
    const kod = ctx.kod(3);
    return { nazev, nazev_unik: `${nazev} ${kod}`, ico: ico(ctx.nahodne), kod };
  },
});
