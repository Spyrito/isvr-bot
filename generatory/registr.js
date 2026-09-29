// Registr generátorů. Plugin je soubor v generatory/, který jednou zavolá registruj({...})
// a je naimportovaný v generatory/index.js.
//
// Entita (data, která k sobě sedí, ve scénáři {nazev.vlastnost}):
//   registruj({
//     nazev: 'osoba', typ: 'entita',
//     lokalni: true,              // true = nová sada v každém úseku, false = jedna na celé spuštění
//     popis: 'fyzická osoba',
//     vytvor(ctx, volby) { return { jmeno: 'Jan', ... } },
//     vlastnost(data, nazev, arg, ctx) { ... }   // volitelné: {osoba.jmeno:arg}
//     sber(data, prefix) { return { [prefix]: data.cele_jmeno } }   // volitelné: co jde do výstupu
//     sledujVyplneni: 'nazev_firmy', // volitelné: vyplněný text s {firma.nazev…} jde do výstupu pod tímto klíčem
//   });
//
// Funkce (hodnota bez vazby na entitu, ve scénáři {nazev} nebo {nazev:arg}):
//   registruj({ nazev: 'cislo', typ: 'funkce', priklad: '{cislo:1-100}', hodnota(arg, ctx) { ... } });
//
// ctx: nahodne(min, max), vyber(pole), seznam(nazevSouboru, vestaveny), sablona(text),
//      datum(Date), bezDiakritiky(text), kod(delka)

export const entity = {};
export const funkce = {};

export function registruj(def) {
  if (!def || !def.nazev) throw new Error('generátor musí mít nazev');
  if (def.typ === 'funkce') {
    if (typeof def.hodnota !== 'function') throw new Error(`funkce ${def.nazev} potřebuje hodnota(arg, ctx)`);
    funkce[def.nazev] = def;
  } else {
    if (typeof def.vytvor !== 'function') throw new Error(`entita ${def.nazev} potřebuje vytvor(ctx, volby)`);
    entity[def.nazev] = { lokalni: true, ...def, typ: 'entita' };
  }
}
