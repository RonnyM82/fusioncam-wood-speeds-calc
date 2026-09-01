// fs-based loader for tests. Returns the same shape as js/data/load-browser.js.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

function readJson(name) {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
}

export function loadData() {
  return {
    chiploads: readJson('chiploads.json'),
    kc: readJson('kc.json'),
    machines: readJson('machines.json'),
    rules: readJson('rules.json'),
    drills: readJson('drills.json'),
  };
}
