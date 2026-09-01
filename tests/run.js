// Runner: node tests/run.js [core|data|scenario|fusion]. No framework, no
// dependencies. Also enforces purity: js/core/ and js/fusion/ must never
// reference fetch or the DOM. The fusion mapping and message modules carry
// the same fence as the core, because the Fusion panel policy must stay
// testable here, with no browser and no Fusion (fusion-addin/protocol.md).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAll } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));

let purityErrors = 0;
for (const dir of ['core', 'fusion']) {
  const abs = join(here, '..', 'js', dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) {
    const src = readFileSync(join(abs, f), 'utf8');
    const hit = src.match(/\b(fetch|document|window|XMLHttpRequest|localStorage|require)\b/);
    if (hit) {
      console.log(`FAIL purity - js/${dir}/${f} references "${hit[1]}" — this module must stay pure`);
      purityErrors++;
    }
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
if (!which || which === 'fusion') {
  for (const f of ['fusion-protocol.test.js', 'fusion-identity.test.js', 'fusion-map.test.js', 'fusion-present.test.js']) {
    if (existsSync(join(here, f))) await import(`./${f}`);
    else if (which === 'fusion') { console.log(`FAIL - ${f} missing`); purityErrors++; }
  }
}

const { passed, failed } = await runAll();
console.log(`\n${passed} passed, ${failed + purityErrors} failed`);
if (failed + purityErrors > 0) process.exitCode = 1;
