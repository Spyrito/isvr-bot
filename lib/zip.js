// Minimální ZIP: export všech scénářů jedním souborem a import zpět (záložní režim bez složky).
// Zápis bez komprese; čtení umí i deflate (DecompressionStream).

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosCas(d) {
  return {
    cas: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    datum: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// { 'zalozeni/Zaloz sro.txt': 'text…' } → Blob
export function vytvorZip(soubory) {
  const enc = new TextEncoder();
  const { cas, datum } = dosCas(new Date());
  const casti = [];
  const centralni = [];
  let offset = 0;
  for (const [cesta, text] of Object.entries(soubory)) {
    const jmeno = enc.encode(cesta);
    const data = enc.encode(text);
    const crc = crc32(data);
    const lok = new DataView(new ArrayBuffer(30));
    lok.setUint32(0, 0x04034b50, true);
    lok.setUint16(4, 20, true);
    lok.setUint16(6, 0x0800, true); // názvy v UTF-8
    lok.setUint16(8, 0, true);
    lok.setUint16(10, cas, true);
    lok.setUint16(12, datum, true);
    lok.setUint32(14, crc, true);
    lok.setUint32(18, data.length, true);
    lok.setUint32(22, data.length, true);
    lok.setUint16(26, jmeno.length, true);
    lok.setUint16(28, 0, true);
    casti.push(lok, jmeno, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, cas, true);
    c.setUint16(14, datum, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, jmeno.length, true);
    c.setUint32(42, offset, true);
    centralni.push(c, jmeno);
    offset += 30 + jmeno.length + data.length;
  }
  const velikostCd = centralni.reduce((s, x) => s + x.byteLength, 0);
  const konec = new DataView(new ArrayBuffer(22));
  konec.setUint32(0, 0x06054b50, true);
  konec.setUint16(8, Object.keys(soubory).length, true);
  konec.setUint16(10, Object.keys(soubory).length, true);
  konec.setUint32(12, velikostCd, true);
  konec.setUint32(16, offset, true);
  return new Blob([...casti, ...centralni, konec], { type: 'application/zip' });
}

async function inflate(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// ArrayBuffer → { cesta: text } (jen textové soubory)
export async function prectiZip(buf) {
  const v = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('soubor není ZIP');
  const pocet = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let i = 0; i < pocet; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('poškozený ZIP');
    const metoda = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true);
    const xlen = v.getUint16(p + 30, true);
    const klen = v.getUint16(p + 32, true);
    const lokal = v.getUint32(p + 42, true);
    const jmeno = dec.decode(new Uint8Array(buf, p + 46, nlen)).replace(/\\/g, '/');
    p += 46 + nlen + xlen + klen;
    if (jmeno.endsWith('/')) continue;
    const zacatek = lokal + 30 + v.getUint16(lokal + 26, true) + v.getUint16(lokal + 28, true);
    const data = new Uint8Array(buf, zacatek, csize);
    if (metoda === 0) out[jmeno] = dec.decode(data);
    else if (metoda === 8) out[jmeno] = dec.decode(await inflate(data));
  }
  return out;
}
