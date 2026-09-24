// Run by `npm install` (the `prepare` script): points git at the tracked hooks
// in .githooks/, so a fresh clone runs the whole gate before every commit
// without anyone setting it up. Written 2026-09-24, step 5 of
// docs/CONVERSION_PLAN.md, the way the design system does it
// (livetools-design-system, scripts/install-hooks.mjs).
//
// Quiet and harmless where there is no git: an unpacked archive, or a CI
// checkout with git missing, still installs.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, '.git'))) process.exit(0);
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
} catch {
  console.warn('install-hooks: git config failed; set it by hand with: git config core.hooksPath .githooks');
}
