# Klikač

Rozšíření pro Chrome, které podle textových scénářů zakládá testovací subjekty a vyplňuje úseky řízení
(společník, adresa, …) ve staré notářské aplikaci. Scénář je obyčejný textový soubor, jeden řádek = jeden krok:

```
# popis: Založí s.r.o. se dvěma společníky
otevri    /Subjekty/Novy.aspx
vyber     @main #ddlTyp = "Právnická osoba"
vypln     @main #txtNazev = {firma.nazev} s.r.o.
vypln     @main #txtICO = {firma.ico}
pouzij    Adresa
pouzij    Spolecnik 2x
pouzij    Ulozit
zapamatuj spz = @main #lblSpisovaZnacka
```

Data (jména, rodná čísla, IČO, názvy firem) generuje rozšíření, jsou platná a k sobě sedí. Každý běh zapíše
řádek do `vystupy/RRRR-MM.csv`.

## Instalace

1. Na vzdálené ploše otevři `chrome://policy` a ověř, že rozšíření a režim pro vývojáře nejsou zakázané
   (`DeveloperToolsAvailability`, `ExtensionInstallBlocklist`, `ExtensionAllowedTypes`).
2. Zkopíruj složku s rozšířením (celý tento repozitář) např. do `Dokumenty\Klikac-rozsireni`.
3. `chrome://extensions` → zapnout **Režim pro vývojáře** → **Načíst rozbalené** → vybrat tuto složku.
4. Připnout ikonu Klikače na lištu. Po instalaci jsou v rozšíření ukázkové scénáře.
5. Editor → **Složka a záloha** → **Vybrat složku Klikac…** (např. `Dokumenty\Klikac`). Prázdnou složku
   Klikač naplní scénáři z rozšíření nebo ukázkami.
6. V `nastaveni.txt` nastav `adresa = https://…` na adresu aplikace. Na stránkách s touto adresou se ukazuje plovoucí panel.

Po restartu prohlížeče Chrome jednou požádá o potvrzení přístupu ke složce – v popupu nebo editoru je
tlačítko **Povolit přístup**. Kdyby výběr složky na vzdálené ploše nešel, zůstanou scénáře uvnitř rozšíření
(záložní režim) a dají se importovat a exportovat jako `.txt`/`.zip`.

Vyžaduje Chrome 116 nebo novější.

## Pracovní složka

```
Klikac/
├─ zalozeni/          celé scénáře (začínají otevri)
├─ useky/             běží na právě otevřené stránce; nabízí se v kontextovém menu a v panelu
├─ data/              seznamy pro generátory (volitelné, přepíšou vestavěné) a vlastni.txt
├─ vystupy/           CSV s výsledky běhů, jeden soubor na měsíc
└─ nastaveni.txt      adresa aplikace, výchozí pauza, timeout a odpověď na confirm()
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
| `zaskrtni SEL` / `odskrtni SEL` | checkbox |
| `cekej 1000` | pevná pauza v ms (nebo `2s`) |
| `cekej-na SEL` | počká, až se prvek nebo text objeví |
| `zmiz SEL` | počká, až prvek zmizí („Načítám…“) |
| `pouzij Název` / `pouzij Název 2x` | vloží jiný scénář (hledá vedle, v `useky/`, pak `zalozeni/`) |
| `nastav x = hodnota` | vlastní proměnná, dál jako `{x}` |
| `nova osoba` / `nova firma` | nová sada dat; `nova osoba zena`, `nova osoba zmocnenec muz` |
| `zapamatuj x = SEL /regex/` | uloží hodnotu ze stránky do výstupu; bez selektoru uloží pevný text |
| `pauza 300` | výchozí pauza mezi kroky od tohoto řádku |
| `timeout 10000` | jak dlouho nejvýš čekat na prvek |
| `dialogy ano` / `ne` | odpověď na `confirm()`; `alert()` se odklikne vždy a text jde do výstupu |
| `stop` | ladicí bod – dál se krokuje |
| `rucne Pokyn [dokud SEL]` | pauza pro ruční zásah; pokračuje se v panelu (nebo samo, až se objeví SEL) |

| Selektor | Význam |
| --- | --- |
| `#txtJmeno`, `[name="prijmeni"]`, `css:span.x` | CSS selektor |
| `text:"Uložit"` | tlačítko nebo odkaz s tímto textem; u `cekej-na`, `zmiz` a `zapamatuj` jakýkoli text |
| `label:"Příjmení"` | pole u popisku (`<label>`, sousední buňka tabulky, placeholder) |
| `xpath://td[2]/input` | XPath |
| `@main #txtJmeno` | hledá jen v rámci `main`, vnořené `@a/b`; bez `@` se hledá ve všech rámcích |

Hodnota v uvozovkách (`= "Právnická osoba"`) se použije bez uvozovek. `\{` je obyčejná složená závorka.

## Generátory dat

| Entita | Proměnné |
| --- | --- |
| osoba | `pohlavi`, `jmeno`, `prijmeni`, `cele_jmeno`, `datum_nar`, `rok_nar`, `vek`, `rc`, `rc_lomitko`, `email`, `telefon` |
| firma | `nazev`, `forma`, `nazev_s_formou`, `nazev_unik`, `ico`, `dic`; styly `{firma.nazev:prijmeni}`, `{firma.nazev:kratky}` |
| spolek | `nazev` („přátel historie Kladna“), `nazev_unik`, `ico` |
| adresa | `ulice`, `cp`, `co`, `cislo`, `mesto`, `psc`, `psc_mezera`, `cela` |
| obecné | `{dnes}`, `{dnes:+30}`, `{rok}`, `{uid}`, `{email}`, `{telefon}`, `{nahodne:6}`, `{pismena:4}`, `{cislo:1-100}`, `{vyber:a\|b\|c}`, `{ucet}` |

- `osoba` a `adresa` jsou lokální pro soubor: každé `pouzij Spolecnik` = nový člověk. `firma` a `spolek` jsou
  společné pro celé spuštění. Víc osob v jednom souboru: `{osoba:zmocnenec.jmeno}`.
- Rodné číslo je dělitelné 11 a odpovídá datu narození a pohlaví, IČO má správnou kontrolní číslici.
- `{posledni.spz}` vloží hodnotu z posledního úspěšného běhu.
- **Bez programování**: `data/vlastni.txt` – `seznam titul = Ing.|Mgr.|Bc.|` a `vzor spisova_znacka = NZ {cislo:100-999}/{rok}`.
  Seznamy slov jde přepsat soubory `data/firmy-zaklad.txt`, `firmy-obor.txt`, `spolky.txt`, `jmena-muzi.txt`,
  `jmena-zeny.txt`, `prijmeni.txt` (`Novák|Nováková` nebo jen `Novák`), `ulice.txt`, `mesta.txt` (`Kladno|27201`).
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
- **Zkouška selektoru**: dvojklik na řádek v editoru zvýrazní nalezený prvek na stránce aplikace.
- **Ruční zásah**: `rucne` běh pozastaví; mezitím jde na stránce dělat cokoli a spouštět úseky z panelu
  nebo menu, jejich hodnoty se přidají k hlavnímu běhu. Stav přežije postbacky.
- **Nahrávání**: popup → Nahrávat, projít postup, v panelu Ukončit → název a složka. Editor pak nabídne náhrady
  (RČ → `{osoba.rc}`, IČO → `{firma.ico}`, datum → `{osoba.datum_nar}` …), každou zvlášť. Selektory volí
  v pořadí id → name → text tlačítka → CSS cesta, s rámcem (`@main`).

## Jak to funguje

| Soubor | Odpovědnost |
| --- | --- |
| `background.js` | stav běhů (v `chrome.storage.session`, přežije postback i uspání service workeru), rozbalení `pouzij`, dosazení proměnných, čekání na načtení rámců, výstup, menu, nahrávání |
| `content.js` + `content/` | v horním rámci přehrávač (`prehravac.js`), v největším rámci panel (`panel.js`), v každém rámci nahrávač (`nahravac.js`); hledání prvků napříč rámci (`najdi.js`) |
| `page-dialogs.js` | běží v kontextu stránky: přebije `alert`/`confirm`/`prompt` během běhu a provádí kliknutí (odkazy `javascript:` Chrome z content scriptu nespustí) |
| `lib/dsl.js` | parser scénářů, sdílí ho editor i přehrávač |
| `lib/soubory.js`, `lib/uloziste.js` | cesty, rozbalení úseků, pracovní složka (File System Access) a záložní úložiště |
| `lib/promenne.js`, `generatory/` | dosazování `{…}` a generátory |
| `ui/` | popup, editor, historie |

Spolehlivost na staré aplikaci: číslo kroku se uloží před akcí, takže krok, který vyvolal postback, se neopakuje;
každý krok čeká, až je prvek vidět a je aktivní; po akci se čeká, jestli se některý rámec nezačal načítat;
režim dialogů se čte synchronně ze `sessionStorage`, takže se odklikne i `alert()` hned po postbacku.

## Vývoj a testy

```
npm test               # jednotkové testy (parser, rozbalení, generátory, CSV) – jen Node 20+
npm run e2e            # celé rozšíření v Chromiu proti cvičné aplikaci (potřebuje Playwright)
npm run aplikace       # cvičná aplikace na http://localhost:5178/Subjekty/Novy.aspx
```

Cvičná aplikace (`test/cvicna-aplikace.mjs`) napodobuje starou aplikaci: frameset s rámcem `main`, ASP.NET
postbacky a AutoPostBack, `confirm()` před uložením, `alert()` po postbacku, popisky v buňkách tabulky, pole
s maskou a pomalé odpovědi. Ukázkové scénáře v `ukazka/` proti ní běží, stačí v `nastaveni.txt` nastavit
`adresa = http://localhost:5178`.

## Omezení

- Rámce z jiné domény přehrávač nevidí (u staré aplikace nepravděpodobné).
- Pole pro výběr souboru nejde vyplnit automaticky – nahrávač místo něj zapíše `rucne`.
- Nahrávač zapisuje jen skutečné vstupy uživatele; události vyvolané skripty stránky ignoruje.
- Generátory jako plugin vyžadují znovunačtení rozšíření (Manifest V3 nedovolí spouštět kód z editoru).

## Doladění na vaší aplikaci (fáze 5)

Selektory v ukázkách (`#txtNazev`, `#txtSpolJmeno`, `@main`…) odpovídají cvičné aplikaci. Pro skutečnou aplikaci
potřebuji:

- [ ] výstup `chrome://policy` ze vzdálené plochy (stačí snímek obrazovky),
- [ ] uložené HTML obrazovek založení subjektu a přidání společníka (Ctrl+S), klidně bez osobních údajů,
- [ ] seznam typů subjektů a úseků, které chcete jako první.
