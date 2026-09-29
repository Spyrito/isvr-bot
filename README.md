# Klikač

Rozšíření pro Chrome, které podle textových scénářů zakládá zápisy v ISVR (prvozápisy notářem) a vyplňuje
jednotlivé údaje (společník, jednatel, sídlo, podíl, …). Scénář je obyčejný textový soubor, jeden řádek = jeden krok:

```
# popis: Přidá společníka – novou fyzickou osobu s bydlištěm z RÚIAN – a vyplní jeho podíl
pridej    uzel:"Společníci" = Společník > Přidat fyzickou osobu
vypln     label:"Jméno" = {osoba.jmeno}
vypln     label:"Příjmení" = {osoba.prijmeni}
vypln     label:"Rodné číslo" = {osoba.rc_lomitko}
klikni    text:"Hledat v OR"
klikni    text:"Zadat údaje osoby"
klikni    text:"Vybrat adresu"
pouzij    Adresa
klikni    text:"Uložit"
…
klikni    uzel:"{osoba.jmeno} {osoba.prijmeni} > Podíl"
vypln     [name$="vkladComponent:containerFields:moneyBaseText"] = {vklad}
```

Data (jména, rodná čísla, názvy firem, skutečné adresy z RÚIAN) generuje rozšíření, jsou platná a k sobě sedí.
Každý běh zapíše řádek do `vystupy/RRRR-MM.csv`.

## Ukázky pro ISVR

Po instalaci jsou ve Klikači scénáře pro ISVR (`ukazka/`), vyzkoušené na testovacím ISVR 15.9.2:

| Scénář | Co dělá |
| --- | --- |
| `zalozeni/Prvozapis sro` | přihlášení, založení zápisu s.r.o. (název, sídlo, lustrace), základní kapitál, IČ, společník s podílem, statutární orgán, jednatel, předmět podnikání; na konci `rucne` – do rejstříku zapisuješ sám |
| `zalozeni/Prvozapis sro 2 spolecnici` | totéž se dvěma společníky po 50 % a dvěma jednateli |
| `zalozeni/Prvozapis sro rucne` | jen založí zápis a pozastaví se; úseky pak spouštíš z panelu |
| `useky/Prihlaseni` | rychlá simulace přihlášení za notáře ze vzoru `notar` (data/vlastni.txt) |
| `useky/Zalozeni zapisu sro` | Kancelář → Založit zápis → … → otevře editor; ověří, že číslo zápisu končí zkratkou soudu |
| `useky/Spolecnik FO`, `useky/Jednatel FO` | nová fyzická osoba přes okno ROB (Hledat v OR → Zadat údaje osoby) s bydlištěm z RÚIAN |
| `useky/Statutarni organ` | individuální statutární orgán, počet jednatelů, způsob jednání (v pořadí, jaké aplikace vyžaduje) |
| `useky/Zakladni kapital`, `useky/Identifikacni cislo`, `useky/Predmet podnikani`, `useky/Sidlo` | jednotlivé údaje |
| `useky/Adresa`, `useky/Adresa sidla` | v otevřeném okně zadání adresy dohledá adresu podle kódu RÚIAN (sídlo v obvodu soudu `{soud}`) |

Výchozí hodnoty (notář, soud, kapitál, vklad, podíl, počet jednatelů, způsob jednání, předměty podnikání) jsou
v `data/vlastni.txt`; scénář je přepíše příkazem `nastav vklad = 50000`.

**Na co si dát pozor v ISVR**
- Stránky jsou v Apache Wicket: `id` prvků mají na konci počítadlo (`zalozitZapis31`) a mění se – používej
  `text:"…"`, `label:"…"`, `uzel:"…"` nebo konec atributu name (`[name$="insertForm:pocetClenu"]`).
- Podřízený údaj jde upravit až po uložení nadřízeného (Systém statutárního orgánu → Statutární orgán → Počet jednatelů).
- „Zrušit“ ve spodní liště se ptá „Chcete uložit provedené změny?“ – při `dialogy ano` změny **uloží**.
- `nastaveni.txt` má `zakazane = Zapsat do veřejného rejstříku | Zrušit zápis do VR | Zrušit zápis`: na tato tlačítka
  Klikač nikdy neklikne (ani omylem), běh skončí chybou a krok uděláš ručně.
- Rejstříkový soud se přiřadí podle sídla (`Fj 903/2026/MSPH`); sídlo se vybírá z adres v obvodu soudu `{soud}`.

## Instalace

1. Na vzdálené ploše otevři `chrome://policy` a ověř, že rozšíření a režim pro vývojáře nejsou zakázané
   (`DeveloperToolsAvailability`, `ExtensionInstallBlocklist`, `ExtensionAllowedTypes`).
2. Zkopíruj složku s rozšířením (celý tento repozitář) např. do `Dokumenty\Klikac-rozsireni`.
3. `chrome://extensions` → zapnout **Režim pro vývojáře** → **Načíst rozbalené** → vybrat tuto složku.
4. Připnout ikonu Klikače na lištu. Po instalaci jsou v rozšíření ukázkové scénáře.
5. Editor → **Složka a záloha** → **Vybrat složku Klikac…** (např. `Dokumenty\Klikac`). Prázdnou složku
   Klikač naplní scénáři z rozšíření nebo ukázkami.
6. V `nastaveni.txt` zkontroluj `adresa = http://192.168.215.125:8080` (adresa ISVR). Na stránkách s touto
   adresou se ukazuje plovoucí panel.

Po restartu prohlížeče Chrome jednou požádá o potvrzení přístupu ke složce – v popupu nebo editoru je
tlačítko **Povolit přístup**. Kdyby výběr složky na vzdálené ploše nešel, zůstanou scénáře uvnitř rozšíření
(záložní režim) a dají se importovat a exportovat jako `.txt`/`.zip`.

Vyžaduje Chrome 116 nebo novější.

## Pracovní složka

```
Klikac/
├─ zalozeni/          celé scénáře (začínají otevri nebo pouzij Prihlaseni)
├─ useky/             běží na právě otevřené stránce; nabízí se v kontextovém menu a v panelu
├─ data/              seznamy pro generátory (volitelné, přepíšou vestavěné), vlastni.txt, ruian.txt
├─ vystupy/           CSV s výsledky běhů, jeden soubor na měsíc
└─ nastaveni.txt      adresa aplikace, pauza, timeout, odpověď na confirm(), hlídání chyb, zakázaná tlačítka
```

Soubory jde upravovat v Poznámkovém bloku, VS Code nebo v editoru rozšíření; změny se projeví hned.
Podsložky jsou povolené (`useky/sro/Spolecnik.txt` → úsek `sro/Spolecnik`).

## Formát scénáře

Řádek = `příkaz selektor = hodnota`. Řádky s `#` jsou komentáře, `# popis: …` na začátku se ukáže v menu.
Příkazy jdou psát i s diakritikou (`vyplň`, `čekej-na`, `ručně`).

| Příkaz | Co dělá |
| --- | --- |
| `otevri URL` | otevře adresu; relativní (`/Subjekty/Novy.aspx`) se doplní z `adresa` v nastaveni.txt |
| `klikni SEL` | klikne na tlačítko, odkaz, záložku (i odkazy `javascript:__doPostBack`) |
| `vypln SEL = hodnota` | vyplní pole a vyvolá focus/input/change/blur |
| `pis SEL = hodnota` | píše po znacích (pole s maskou nebo `onkeyup`) |
| `vyber SEL = text` | vybere položku v seznamu podle textu (případně hodnoty); vyvolá change → funguje AutoPostBack |
| `zaskrtni SEL` / `odskrtni SEL` | checkbox; `zaskrtni label:"Individuální"` vybere i přepínač (radio) |
| `pridej uzel:"Společníci" = Společník > Přidat fyzickou osobu` | klikne na zelené + u uzlu stromu a vybere z nabídky (úrovně odděluje `>`); bez `=` jen klikne na + |
| `pridej strom = Předměty podnikání` | + pod názvem subjektu; když skupina už ve stromu je, přidá do ní další položku |
| `menu SEL = Položka > Podpoložka` | obecná nabídka: otevře ji tlačítkem SEL a vybere položku |
| `cekej 1000` | pevná pauza v ms (nebo `2s`) |
| `cekej-na SEL` | počká, až se prvek nebo text objeví |
| `zmiz SEL` | počká, až prvek zmizí („Načítám…“) |
| `pouzij Název` / `pouzij Název 2x` | vloží jiný scénář (hledá vedle, v `useky/`, pak `zalozeni/`) |
| `nastav x = hodnota` | vlastní proměnná, dál jako `{x}` |
| `nova osoba` / `nova firma` | nová sada dat; `nova osoba zena`, `nova osoba zmocnenec muz`, `nova adresa soud=KSBR` |
| `zapamatuj x = SEL /regex/` | uloží hodnotu ze stránky do výstupu; bez selektoru uloží pevný text |
| `pauza 300` | výchozí pauza mezi kroky od tohoto řádku |
| `timeout 10000` | jak dlouho nejvýš čekat na prvek |
| `dialogy ano` / `ne` | odpověď na `confirm()`; `alert()` se odklikne vždy a text jde do výstupu |
| `stop` | ladicí bod – dál se krokuje |
| `rucne Pokyn [dokud SEL]` | pauza pro ruční zásah; pokračuje se v panelu (nebo samo, až se objeví SEL) |

| Selektor | Význam |
| --- | --- |
| `#txtJmeno`, `[name="prijmeni"]`, `css:span.x` | CSS selektor |
| `text:"Uložit"` | tlačítko nebo odkaz s přesně tímto textem (velikost písmen nevadí); u `cekej-na`, `zmiz` a `zapamatuj` jakýkoli text, který ho obsahuje |
| `label:"Příjmení"` | pole u popisku (`<label>`, sousední buňka tabulky, placeholder) |
| `uzel:"Společníci"` | uzel stromu údajů v editoru ISVR; `uzel:"Petr Novák > Podíl"` hledá pod uzlem, velikost písmen nevadí |
| `[name$=":pocetClenu"]` | CSS podle konce atributu name – ve Wicketu stabilní, na rozdíl od id |
| `xpath://td[2]/input` | XPath |
| `@main #txtJmeno` | hledá jen v rámci `main`, vnořené `@a/b`; bez `@` se hledá ve všech rámcích |

Hodnota v uvozovkách (`= "Právnická osoba"`) se použije bez uvozovek. `\{` je obyčejná složená závorka.

Když je otevřené modální okno (např. „Dohledání osoby v databázi ROB“), hledá se nejdřív v něm – `text:"Uložit"`
klikne na Uložit v okně, ne na Uložit pod ním. Po každé akci se čeká na načtení stránky i na doběhnutí AJAXu.

## Generátory dat

| Entita | Proměnné |
| --- | --- |
| osoba | `pohlavi`, `jmeno`, `prijmeni`, `cele_jmeno`, `datum_nar`, `rok_nar`, `vek`, `rc`, `rc_lomitko`, `email`, `telefon` |
| firma | `nazev`, `forma`, `nazev_s_formou`, `nazev_unik`, `ico`, `dic`; styly `{firma.nazev:prijmeni}`, `{firma.nazev:kratky}` |
| spolek | `nazev` („přátel historie Kladna“), `nazev_unik`, `ico` |
| adresa | skutečné adresní místo z RÚIAN: `ruian` (kód), `ulice`, `cp`, `co`, `cislo`, `cast_obce`, `mesto`, `psc`, `psc_mezera`, `cela`, `soud` (MSPH, KSBR…), `soud_nazev` |
| obecné | `{dnes}`, `{dnes:+30}`, `{rok}`, `{uid}`, `{email}`, `{telefon}`, `{nahodne:6}`, `{pismena:4}`, `{cislo:1-100}`, `{vyber:a\|b\|c}`, `{ucet}` |

- `osoba` a `adresa` jsou lokální pro soubor: každé `pouzij Spolecnik` = nový člověk. `firma` a `spolek` jsou
  společné pro celé spuštění. Víc osob v jednom souboru: `{osoba:zmocnenec.jmeno}`.
- Rodné číslo je dělitelné 11 a odpovídá datu narození a pohlaví, IČO má správnou kontrolní číslici.
- **Adresy z RÚIAN**: vestavěných je ~580 skutečných adresních míst ze 14 měst (Praha, Kladno, Brno, Jihlava, Zlín,
  Ostrava, Olomouc, Plzeň, Karlovy Vary, Ústí n. L., Liberec, Hradec Králové, Pardubice, České Budějovice), pokrývají
  všech 7 rejstříkových soudů. `{adresa.ruian}` se zadá do pole RUIAN a ISVR adresu dohledá. `nova adresa soud=KSBR`
  vybere adresu v obvodu soudu. Vlastní seznam: `data/ruian.txt`, řádek `kód|ulice|č.p.|č.o.|část obce|obec|PSČ|soud`;
  kód adresy najdeš na https://vdp.cuzk.gov.cz/vdp/ruian/overeniadresy (v adrese stránky jako `kodAdAc`).
- `{posledni.spz}` vloží hodnotu z posledního úspěšného běhu.
- **Bez programování**: `data/vlastni.txt` – `seznam titul = Ing.|Mgr.|Bc.|` a `vzor spisova_znacka = NZ {cislo:100-999}/{rok}`.
  Seznamy slov jde přepsat soubory `data/firmy-zaklad.txt`, `firmy-obor.txt`, `spolky.txt`, `jmena-muzi.txt`,
  `jmena-zeny.txt`, `prijmeni.txt` (`Novák|Nováková` nebo jen `Novák`), `ruian.txt`.
- **Plugin** (algoritmus): soubor v `generatory/`, který zavolá `registruj({...})`, a jeden import v
  `generatory/index.js`; pak znovu načíst rozšíření. Vzor je `generatory/ucet.js` (číslo účtu s kontrolou modulo 11).

## Výstup

Každý běh zapíše do `vystupy/RRRR-MM.csv` čas, scénář, výsledek (`OK`, `chyba ř. 5`, `zastaveno`) a posbírané
hodnoty. CSV má středníky a UTF-8 s BOM, v Excelu se otevře rovnou s češtinou; nové sloupce se doplní do hlavičky.

- Automaticky: IČO firmy, název firmy tak, jak se vyplnil (`nazev_firmy`), každá osoba podle úseku
  (`spolecnik1`, `spolecnik1_rc`, …), texty dialogů.
- Ze stránky: `zapamatuj spz = #lblSpisovaZnacka`, `zapamatuj id = text:"Subjekt uložen pod č." /(\d+)/`.
- Pevný text: `zapamatuj poznamka = Test přepisu vlastníka`.
- Panel po běhu ukáže hodnoty s tlačítkem Kopírovat, **Historie** má tabulku běhů s filtrem a exportem.

## Ovládání a ladění

| Kde | Co tam je |
| --- | --- |
| Popup (ikona) | hledání scénáře, počet opakování, Spustit, Krok po kroku, Nahrávat, Editor, Historie, Panel |
| Kontextové menu | Klikač → úseky s popisem, Zopakovat poslední úsek, Zobrazit panel, Editor |
| Plovoucí panel | oblíbené úseky (☆ v editoru), „kolikrát“, průběh, Stop, chyby, ruční pauza, výsledek; jde přetáhnout a sbalit |
| Klávesová zkratka | Alt+Shift+K zopakuje naposledy spuštěný úsek (změna v `chrome://extensions/shortcuts`) |
| Editor | strom souborů, zvýraznění, kontrola chyb s číslem řádku, nápověda, náhled dat, náhrady po nahrání |

- **Krok po kroku**: panel ukáže další řádek a zvýrazní prvek; Další / Pokračovat / Stop. `stop` ve scénáři je ladicí bod.
- **Spustit odsud** (Ctrl+Enter v editoru): spustí scénář od řádku s kurzorem na aktuální stránce.
- **Chyba** zastaví běh, panel ukáže `soubor:řádek`, důvod a zvýrazní prvek; Zkusit znovu / Přeskočit / Stop.
  Za chybu se bere i chyba aplikace: hláška zachycená z AJAXu Wicketu („Nastala interní chyba…“) nebo viditelný
  prvek podle `chyba = text:"Nastala interní chyba"` v `nastaveni.txt`.
- **Zkouška selektoru**: dvojklik na řádek v editoru zvýrazní nalezený prvek na stránce aplikace.
- **Ruční zásah**: `rucne` běh pozastaví; mezitím jde na stránce dělat cokoli a spouštět úseky z panelu
  nebo menu, jejich hodnoty se přidají k hlavnímu běhu. Stav přežije postbacky.
- **Nahrávání**: popup → Nahrávat, projít postup, v panelu Ukončit → název a složka. Editor pak nabídne náhrady
  (RČ → `{osoba.rc}`, IČO → `{firma.ico}`, kód RUIAN → `{adresa.ruian}` …), každou zvlášť. Selektory volí
  v pořadí id → name → text tlačítka → CSS cesta, s rámcem (`@main`). Na stránkách Wicketu přeskočí generovaná
  id, uzel stromu zapíše jako `uzel:"…"` a z name vezme jen jedinečný konec (`[name$=":pocetClenu"]`).

## Jak to funguje

| Soubor | Odpovědnost |
| --- | --- |
| `background.js` | stav běhů (v `chrome.storage.session`, přežije postback i uspání service workeru), rozbalení `pouzij`, dosazení proměnných, čekání na načtení rámců, výstup, menu, nahrávání |
| `content.js` + `content/` | v horním rámci přehrávač (`prehravac.js`), v největším rámci panel (`panel.js`), v každém rámci nahrávač (`nahravac.js`); hledání prvků napříč rámci (`najdi.js`) |
| `page-dialogs.js` | běží v kontextu stránky: přebije `alert`/`confirm`/`prompt` během běhu, provádí kliknutí (odkazy `javascript:` Chrome z content scriptu nespustí), počítá běžící AJAX (`data-klikac-ajax`) a zachytává chyby z logu Wicketu (`data-klikac-chyba`) |
| `lib/dsl.js` | parser scénářů, sdílí ho editor i přehrávač |
| `lib/soubory.js`, `lib/uloziste.js` | cesty, rozbalení úseků, pracovní složka (File System Access) a záložní úložiště |
| `lib/promenne.js`, `generatory/` | dosazování `{…}` a generátory |
| `ui/` | popup, editor, historie |

Spolehlivost: číslo kroku se uloží před akcí, takže krok, který vyvolal postback, se neopakuje; každý krok čeká,
až je prvek vidět a je aktivní; po akci se čeká, jestli se stránka nezačala načítat, a pak až 400 ms neběží žádný
AJAX (ISVR posílá požadavek až ~150 ms po kliknutí); režim dialogů se čte synchronně ze `sessionStorage`, takže
se odklikne i `alert()` hned po postbacku. Nabídky za zeleným + jsou jQuery UI menu, které ISVR po kliknutí
vykreslí AJAXem znovu – `pridej` proto nabídku hledá až po doběhnutí AJAXu a najetí myší simuluje
s `relatedTarget`, aby se vybrala správná položka.

## Vývoj a testy

```
npm test               # jednotkové testy (parser, rozbalení, generátory, CSV) – jen Node 20+
npm run e2e            # celé rozšíření v Chromiu proti cvičné aplikaci (potřebuje Playwright)
npm run aplikace       # cvičná aplikace na http://localhost:5178/Subjekty/Novy.aspx
```

Cvičná aplikace (`test/cvicna-aplikace.mjs`) napodobuje starší typ aplikace: frameset s rámcem `main`, ASP.NET
postbacky a AutoPostBack, `confirm()` před uložením, `alert()` po postbacku, popisky v buňkách tabulky, pole
s maskou a pomalé odpovědi. Scénáře pro ni jsou v `test/cvicna/` (e2e test si je nahraje sám). Ukázky pro ISVR
(`ukazka/`) testují jednotkové testy (syntaxe, rozbalení, proměnné); proti ISVR se zkoušejí ručně.

## Omezení

- Rámce z jiné domény přehrávač nevidí (u staré aplikace nepravděpodobné).
- Pole pro výběr souboru nejde vyplnit automaticky – nahrávač místo něj zapíše `rucne`.
- Nahrávač zapisuje jen skutečné vstupy uživatele; události vyvolané skripty stránky ignoruje.
- Generátory jako plugin vyžadují znovunačtení rozšíření (Manifest V3 nedovolí spouštět kód z editoru).

## Stav napojení na ISVR

Ověřeno na testovacím ISVR 15.9.2 (kódem přehrávače vloženým do stránky, krok po kroku): selektory stránky
Založení zápisu, okno Výběr adresy s dohledáním podle RÚIAN (i sídlo v Brně → KSBR), celý úsek `Spolecnik FO`
(nabídka +, okno ROB, ruční zadání osoby, bydliště z RÚIAN, podíl), `pridej strom = Předměty podnikání` do existující
skupiny, přednost modálního okna a zákaz kliknutí na „Zapsat do veřejného rejstříku“.

Zbývá ověřit v nainstalovaném rozšíření celý `Prvozapis sro` od přihlášení po konec. Při ručním zkoušení vrátilo
„Založit zápis“ jednou interní chybu serveru (kód 917d467c-…); Klikač ji teď zachytí a běh zastaví.
