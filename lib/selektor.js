// Rozbor selektoru. Sdílí ho background (jako modul) i content scripty (jako klasický skript),
// proto žádné import/export – vše visí na globalThis.KlikacSelektor.
//
//   #txtJmeno, [name="prijmeni"]   CSS
//   css:span.popisek               CSS (výslovně)
//   text:"Uložit"                  tlačítko/odkaz s textem, u čekání jakýkoli text
//   label:"Příjmení"               pole u popisku
//   xpath://td[2]/input            XPath
//   @main #txtJmeno                jen v rámci main, vnořené @a/b
(function (g) {
  'use strict';

  function oduvozovkuj(v) {
    const s = String(v).trim();
    if (s.length >= 2) {
      const a = s[0];
      const b = s[s.length - 1];
      if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, -1);
    }
    return s;
  }

  function rozparsuj(puvodni) {
    let s = String(puvodni == null ? '' : puvodni).trim();
    if (!s) throw new Error('chybí selektor');
    let ramce = null;
    if (s[0] === '@') {
      const m = s.match(/^@(\S+)\s*([\s\S]*)$/);
      ramce = m[1].split('/').filter(Boolean);
      s = m[2].trim();
      if (!ramce.length) throw new Error('prázdný název rámce za @');
      if (!s) throw new Error('za @' + m[1] + ' chybí selektor');
    }
    let typ = 'css';
    let hodnota = s;
    const m = s.match(/^(text|label|xpath|css):\s*([\s\S]*)$/i);
    if (m) {
      typ = m[1].toLowerCase();
      hodnota = m[2].trim();
      if (typ === 'text' || typ === 'label') hodnota = oduvozovkuj(hodnota);
    }
    if (!hodnota) throw new Error('prázdný selektor ' + typ + ':');
    return { ramce, typ, hodnota, puvodni: String(puvodni).trim() };
  }

  // Vypadá hodnota jako selektor? Používá zapamatuj: „zapamatuj x = #lbl“ vs. „zapamatuj x = pevný text“.
  function vypadaJakoSelektor(v) {
    return /^(@\S|#[A-Za-z_\\-]|\.[A-Za-z_-]|\[|(text|label|xpath|css):)/i.test(String(v).trim());
  }

  g.KlikacSelektor = { rozparsuj, oduvozovkuj, vypadaJakoSelektor };
})(globalThis);
