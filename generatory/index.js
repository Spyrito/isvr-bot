// Seznam pluginů generátorů. Nový plugin = nový soubor v této složce + jeden import sem
// a znovunačtení rozšíření (chrome://extensions → ↻). Manifest V3 nedovolí spouštět kód z editoru.
import './osoba.js';
import './firma.js';
import './spolek.js';
import './adresa.js';
import './obecne.js';
import './ucet.js';

export { entity, funkce, registruj } from './registr.js';
