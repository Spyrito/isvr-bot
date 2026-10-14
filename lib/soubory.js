// Práce s cestami ve složce Klikac a rozbalení „pouzij“ do jednoho plochého seznamu kroků.
import { rozparsujScenar, bezDiakritiky, popisScenare } from './dsl.js';

export const SLOZKY = { zalozeni: 'zalozeni', useky: 'useky', data: 'data', vystupy: 'vystupy' };
export const NASTAVENI = 'nastaveni.txt';

export function jeScenar(cesta) {
  return /^(zalozeni|useky)\/.+\.txt$/i.test(cesta);
}

export function jeUsek(cesta) {
  return /^useky\/.+\.txt$/i.test(cesta);
}

// „zalozeni/Zaloz sro.txt“ → „Zaloz sro“, „useky/sro/Spolecnik.txt“ → „useky/sro/Spolecnik“ (tak se píše do CSV)
export function nazevBehu(cesta) {
  return cesta.replace(/\.txt$/i, '').replace(/^zalozeni\//i, '');
}

// Název pro menu a panel: „useky/sro/Spolecnik.txt“ → „sro/Spolecnik“
export function nazevScenare(cesta) {
  return cesta.replace(/\.txt$/i, '').replace(/^(zalozeni|useky)\//i, '');
}

export function zakladniNazev(cesta) {
  return cesta.replace(/\.txt$/i, '').split('/').pop();
}

export function slug(s) {
  return bezDiakritiky(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'usek';
}

// Seznam scénářů pro popup, menu a panel.
export function seznamScenaru(soubory) {
  return Object.keys(soubory)
    .filter(jeScenar)
    .sort((a, b) => a.localeCompare(b, 'cs'))
    .map((cesta) => ({
      cesta,
      nazev: nazevScenare(cesta),
      popis: popisScenare(soubory[cesta]),
      usek: jeUsek(cesta),
    }));
}

// Najde soubor pro „pouzij Název“. Hledá vedle volajícího, pak v useky/, pak v zalozeni/. Velikost písmen nevadí.
export function najdiSoubor(nazev, odkud, soubory) {
  const n = String(nazev).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.txt$/i, '');
  const kandidati = [];
  if (/^(useky|zalozeni)\//i.test(n)) kandidati.push(n + '.txt');
  const adr = odkud && odkud.includes('/') ? odkud.slice(0, odkud.lastIndexOf('/')) : '';
  if (adr && /^useky\//i.test(adr + '/')) kandidati.push(`${adr}/${n}.txt`);
  kandidati.push(`useky/${n}.txt`, `zalozeni/${n}.txt`, `${n}.txt`);
  const mapa = new Map(Object.keys(soubory).map((k) => [k.toLowerCase(), k]));
  for (const k of kandidati) {
    const nalez = mapa.get(k.toLowerCase());
    if (nalez && jeScenar(nalez)) return nalez;
  }
  return null;
}

// Rozbalí scénář včetně všech „pouzij“. Každé vložení dostane vlastní rozsah (scope),
// ve kterém žijí lokální data (osoba, adresa) – každé „pouzij Spolecnik“ = nový člověk.
export function rozbal(hlavni, soubory) {
  const kroky = [];
  const rozsahy = [];
  const chyby = [];
  const rozebrane = {};
  const nahlaseno = new Set();

  function rozeber(cesta) {
    if (!rozebrane[cesta]) {
      rozebrane[cesta] = rozparsujScenar(soubory[cesta]);
    }
    if (!nahlaseno.has(cesta)) {
      nahlaseno.add(cesta);
      for (const c of rozebrane[cesta].chyby) chyby.push({ soubor: cesta, ...c });
    }
    return rozebrane[cesta];
  }

  function vloz(cesta, rozsah, zasobnik) {
    for (const k of rozeber(cesta).kroky) {
      if (k.prikaz !== 'pouzij') {
        kroky.push({ ...k, soubor: cesta, rozsah });
        continue;
      }
      const cil = najdiSoubor(k.usek, cesta, soubory);
      if (!cil) {
        chyby.push({ soubor: cesta, radek: k.radek, zprava: `úsek „${k.usek}“ nenalezen (hledám v useky/ a zalozeni/)` });
        continue;
      }
      if (zasobnik.includes(cil)) {
        chyby.push({ soubor: cesta, radek: k.radek, zprava: `úsek „${k.usek}“ vkládá sám sebe (${[...zasobnik, cil].join(' → ')})` });
        continue;
      }
      for (let i = 0; i < k.pocet; i++) {
        if (kroky.length > 50000) {
          chyby.push({ soubor: cesta, radek: k.radek, zprava: 'scénář je po rozbalení příliš dlouhý' });
          return;
        }
        const id = rozsahy.length;
        rozsahy.push({ id, soubor: cil, nazev: slug(zakladniNazev(cil)), rodic: rozsah });
        vloz(cil, id, [...zasobnik, cil]);
      }
    }
  }

  if (!(hlavni in soubory)) {
    chyby.push({ soubor: hlavni, radek: 0, zprava: 'soubor neexistuje' });
    return { kroky, rozsahy, chyby };
  }
  rozsahy.push({ id: 0, soubor: hlavni, nazev: slug(zakladniNazev(hlavni)), rodic: null });
  vloz(hlavni, 0, [hlavni]);
  return { kroky, rozsahy, chyby };
}

// nastaveni.txt: „klíč = hodnota“ na řádek
export const VYCHOZI_NASTAVENI = { adresa: '', adresy: [], pauza: 200, timeout: 10000, dialogy: 'ano' };

// „adresa = http://a:8080 | http://b:8080/“ → ['http://a:8080', 'http://b:8080'] (víc serverů téže aplikace)
export function seznamAdres(text) {
  return String(text || '')
    .split('|')
    .map((a) => a.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function puvod(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Která z adres aplikace odpovídá stránce (stejný server), nebo null.
export function adresaStranky(url, adresy) {
  const o = puvod(url);
  return (o && adresy.find((a) => String(url).startsWith(a) || puvod(a) === o)) || null;
}

// Je stránka ze stejné aplikace jako cíl (stejná první část cesty, např. /nev/), jen na jiném serveru?
// Pozná tak server, který v nastaveni.txt ještě není (dev3 vedle dev2).
export function stejnaAplikace(url, cil) {
  let a;
  let b;
  try {
    a = new URL(url);
    b = new URL(cil);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(a.protocol) || !/^https?:$/.test(b.protocol)) return false;
  const prvni = (u) => u.pathname.split('/').filter(Boolean)[0] || '';
  return !!prvni(a) && prvni(a) === prvni(b);
}

// Přidá server do řádku „adresa =“ v nastaveni.txt (nebo řádek založí). Ostatní řádky nechá, jak jsou.
export function pridejAdresu(text, server) {
  const radky = String(text || '').split(/\r?\n/);
  const nl = /\r\n/.test(String(text || '')) ? '\r\n' : '\n';
  const i = radky.findIndex((r) => /^\s*adresa\s*=/i.test(r));
  if (i < 0) return (text ? String(text).replace(/\s*$/, nl) : '') + `adresa  = ${server}${nl}`;
  const adresy = seznamAdres(radky[i].slice(radky[i].indexOf('=') + 1));
  if (adresy.includes(server)) return text;
  radky[i] = `adresa  = ${[...adresy, server].join(' | ')}`;
  return radky.join(nl);
}

// Adresu z jiného serveru téže aplikace převede na server, na kterém se právě pracuje
// (scénář nahraný na …125 pak funguje i na …225).
export function naServer(url, adresy, cil) {
  if (!cil || !adresaStranky(url, adresy)) return url;
  const u = new URL(url);
  const c = new URL(cil);
  if (u.origin === c.origin) return url;
  return c.origin + u.pathname + u.search + u.hash;
}

export function prectiNastaveni(text) {
  const n = { ...VYCHOZI_NASTAVENI };
  for (const r of String(text || '').split(/\r?\n/)) {
    const t = r.trim();
    if (!t || t[0] === '#') continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = bezDiakritiky(t.slice(0, i).trim()).toLowerCase();
    const v = t.slice(i + 1).trim();
    if (k === 'pauza' || k === 'timeout') {
      const c = parseInt(v, 10);
      if (!isNaN(c)) n[k] = c;
    } else if (k === 'dialogy') {
      n.dialogy = bezDiakritiky(v).toLowerCase() === 'ne' ? 'ne' : 'ano';
    } else {
      n[k] = v;
    }
  }
  n.adresy = seznamAdres(n.adresa);
  n.adresa = n.adresy[0] || '';
  return n;
}

export const VYCHOZI_NASTAVENI_TEXT = `# Nastavení Klikače
# adresa = adresa aplikace; víc serverů odděl |. Relativní „otevri /nev/prihlaseni.html“ se doplní
#          ze serveru, na kterém zrovna jsi (jinak z posledně použitého), a na těchto stránkách se ukazuje panel
adresa  = http://192.168.215.125:8080 | http://192.168.215.225:8080
# pauza mezi kroky v ms
pauza   = 200
# jak dlouho nejvýš čekat na prvek (ms)
timeout = 15000
# odpověď na confirm(): ano / ne
dialogy = ano
# když se po akci na stránce objeví tento prvek, běh se zastaví s chybou
chyba   = text:"Nastala interní chyba"
# tlačítka, na která Klikač nikdy neklikne (text tlačítka, oddělené |); tyhle kroky dělej ručně
zakazane = Zapsat do veřejného rejstříku | Zrušit zápis do VR | Zrušit zápis
`;
