// Vestavěné seznamy slov. Každý jde přepsat souborem data/<název>.txt ve složce Klikac
// (jedno slovo nebo vzor na řádek, # je komentář).

export const JMENA_MUZI = [
  'Jan', 'Jiří', 'Petr', 'Josef', 'Pavel', 'Martin', 'Tomáš', 'Jaroslav', 'Miroslav', 'Zdeněk',
  'Václav', 'Michal', 'František', 'Karel', 'Milan', 'Jakub', 'Lukáš', 'David', 'Vladimír', 'Ondřej',
  'Ladislav', 'Roman', 'Stanislav', 'Marek', 'Radek', 'Daniel', 'Antonín', 'Vojtěch', 'Filip', 'Adam',
  'Aleš', 'Libor', 'Vít', 'Matěj', 'Dominik', 'Lubomír', 'Richard', 'Oldřich', 'Bohumil', 'Radim',
];

export const JMENA_ZENY = [
  'Jana', 'Marie', 'Eva', 'Hana', 'Anna', 'Lenka', 'Kateřina', 'Lucie', 'Věra', 'Alena',
  'Petra', 'Veronika', 'Jaroslava', 'Martina', 'Tereza', 'Michaela', 'Ludmila', 'Helena', 'Zdeňka', 'Ivana',
  'Jitka', 'Monika', 'Zuzana', 'Markéta', 'Barbora', 'Jarmila', 'Eliška', 'Klára', 'Kristýna', 'Pavla',
  'Dana', 'Simona', 'Irena', 'Vlasta', 'Renata', 'Olga', 'Šárka', 'Blanka', 'Dagmar', 'Radka',
];

// „mužský tvar|ženský tvar“; v data/prijmeni.txt stačí mužský tvar, ženský se odvodí
export const PRIJMENI = [
  'Novák|Nováková', 'Svoboda|Svobodová', 'Novotný|Novotná', 'Dvořák|Dvořáková', 'Černý|Černá',
  'Procházka|Procházková', 'Kučera|Kučerová', 'Veselý|Veselá', 'Horák|Horáková', 'Němec|Němcová',
  'Marek|Marková', 'Pokorný|Pokorná', 'Pospíšil|Pospíšilová', 'Hájek|Hájková', 'Král|Králová',
  'Jelínek|Jelínková', 'Růžička|Růžičková', 'Beneš|Benešová', 'Fiala|Fialová', 'Sedláček|Sedláčková',
  'Doležal|Doležalová', 'Zeman|Zemanová', 'Kolář|Kolářová', 'Navrátil|Navrátilová', 'Čermák|Čermáková',
  'Vaněk|Vaňková', 'Urban|Urbanová', 'Blažek|Blažková', 'Kříž|Křížová', 'Kovář|Kovářová',
  'Bartoš|Bartošová', 'Vlček|Vlčková', 'Polák|Poláková', 'Musil|Musilová', 'Kopecký|Kopecká',
  'Šimek|Šimková', 'Konečný|Konečná', 'Malý|Malá', 'Holub|Holubová', 'Štěpánek|Štěpánková',
  'Kadlec|Kadlecová', 'Staněk|Staňková', 'Dostál|Dostálová', 'Soukup|Soukupová', 'Šťastný|Šťastná',
  'Mareš|Marešová', 'Moravec|Moravcová', 'Sýkora|Sýkorová', 'Tichý|Tichá', 'Valenta|Valentová',
  'Vávra|Vávrová', 'Matoušek|Matoušková', 'Bláha|Bláhová', 'Říha|Říhová', 'Ševčík|Ševčíková',
  'Bureš|Burešová', 'Hruška|Hrušková', 'Mašek|Mašková', 'Pavlík|Pavlíková', 'Janda|Jandová',
];

export const FIRMY_ZAKLAD = [
  'Delta', 'Horizont', 'Atlas', 'Rubín', 'Alfa', 'Sigma', 'Vega', 'Orion', 'Titan', 'Merkur',
  'Safír', 'Jantar', 'Granit', 'Polaris', 'Kometa', 'Meteor', 'Lotos', 'Axis', 'Nova', 'Terra',
  'Aurora', 'Opál', 'Kobalt', 'Zenit', 'Proxima', 'Vektor', 'Modul', 'Pilíř', 'Sokol', 'Javor',
];

export const FIRMY_OBOR = [
  'Stavby', 'Invest', 'Logistik', 'Trade', 'Consulting', 'Reality', 'Systems', 'Servis', 'Technik',
  'Group', 'Media', 'Energy', 'Agro', 'Holding', 'Development', 'Software', 'Obchod', 'Doprava',
  'Projekt', 'Finance', 'Elektro', 'Montáže', 'Design', 'Solutions', 'Partners', 'Pharma', 'Food',
];

export const FORMY = ['s.r.o.', 'a.s.', 'v.o.s.', 'k.s.'];

export const SPOLKY_KDO = ['přátel', 'příznivců', 'milovníků', 'rodáků a přátel', 'ochránců', 'nadšenců pro'];
export const SPOLKY_CO = [
  'historie', 'přírody', 'turistiky', 'dobré hudby', 'železnice', 'divadla', 'vína', 'starých řemesel',
  'lidových tradic', 'šachu', 'fotografie', 'cyklistiky', 'regionální literatury', 'památek',
];
export const SPOLKY_KDE = [
  'Kladna', 'Berouna', 'Kolína', 'Tábora', 'Písku', 'Jihlavy', 'Třebíče', 'Kutné Hory', 'Mělníka',
  'Příbrami', 'Litoměřic', 'Loun', 'Rakovníka', 'Slaného', 'Brna', 'Plzně', 'Olomouce', 'Liberce',
  'Znojma', 'Prostějova', 'Chrudimi', 'Vsetína', 'Náchoda', 'Domažlic',
];

export const ULICE = [
  'Hlavní', 'Nádražní', 'Školní', 'Husova', 'Palackého', 'Komenského', 'Masarykova', 'Riegrova',
  'Jiráskova', 'Tyršova', 'Smetanova', 'Nerudova', 'Havlíčkova', 'Sokolská', 'Zahradní', 'Polní',
  'Lipová', 'Lesní', 'Krátká', 'Dlouhá', 'Luční', 'Družstevní', 'Na Výsluní', 'U Potoka', 'Revoluční',
  'Žižkova', 'Nová', 'Příčná', 'Wolkerova', 'Mánesova',
];

// „město|PSČ“
export const MESTA = [
  'Praha|11000', 'Praha|12000', 'Praha|13000', 'Praha|14000', 'Praha|16000', 'Brno|60200', 'Brno|61500',
  'Ostrava|70200', 'Plzeň|30100', 'Liberec|46001', 'Olomouc|77900', 'České Budějovice|37001',
  'Hradec Králové|50002', 'Ústí nad Labem|40001', 'Pardubice|53002', 'Zlín|76001', 'Havířov|73601',
  'Kladno|27201', 'Most|43401', 'Opava|74601', 'Jihlava|58601', 'Karlovy Vary|36001', 'Teplice|41501',
  'Tábor|39002', 'Písek|39701', 'Kolín|28002', 'Beroun|26601', 'Mělník|27601', 'Příbram|26101',
  'Třebíč|67401', 'Znojmo|66902', 'Prostějov|79601',
];
