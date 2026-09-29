// Vykreslí ikony rozšíření z SVG (node test/ikony.mjs). Potřebuje Playwright.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}
import { writeFileSync } from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="4" y="4" width="120" height="120" rx="26" fill="#1a4d8f"/>
  <rect x="24" y="30" width="46" height="10" rx="5" fill="#8fb6ea"/>
  <rect x="24" y="52" width="34" height="10" rx="5" fill="#8fb6ea"/>
  <rect x="24" y="74" width="24" height="10" rx="5" fill="#8fb6ea"/>
  <path d="M62 44 L62 108 L77 94 L88 117 L99 112 L88 89 L108 88 Z" fill="#fff" stroke="#0f2f59" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

const b = await chromium.launch();
const p = await b.newPage();
for (const s of [16, 32, 48, 128]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${s}" height="${s}">`);
  writeFileSync(new URL(`../ikony/${s}.png`, import.meta.url), await p.screenshot({ omitBackground: true }));
}
await b.close();
