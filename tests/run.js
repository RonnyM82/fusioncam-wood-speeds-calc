// Runner: node tests/run.js [core|data]. No framework, no dependencies.
// Also enforces core purity: js/core/ must never reference fetch or the DOM.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAll } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '..', 'js', 'core');

let purityErrors = 0;
for (const f of readdirSync(coreDir)) {
  const src = readFileSync(join(coreDir, f), 'utf8');
  const hit = src.match(/\b(fetch|document|window|XMLHttpRequest|localStorage|require)\b/);
  if (hit) {
    console.log(`FAIL purity - js/core/${f} references "${hit[1]}" — the core must stay pure`);
    purityErrors++;
  }
}

const which = process.argv[2];
if (!which || which === 'core') await import('./core.test.js');
if (!which || which === 'data') {
  if (existsSync(join(here, 'data.test.js'))) await import('./data.test.js');
  else if (which === 'data') { console.log('FAIL - data.test.js missing'); purityErrors++; }
}
if (!which || which === 'scenario') {
  if (existsSync(join(here, 'scenario.test.js'))) await import('./scenario.test.js');
  else if (which === 'scenario') { console.log('FAIL - scenario.test.js missing'); purityErrors++; }
}

if (!which || which === 'drilling') {
  if (existsSync(join(here, 'drilling.test.js'))) await import('./drilling.test.js');
  else if (which === 'drilling') { console.log('FAIL - drilling.test.js missing'); purityErrors++; }
}
const { passed, failed } = await runAll();
console.log(`\n${passed} passed, ${failed + purityErrors} failed`);
if (failed + purityErrors > 0) process.exitCode = 1;
