// Minimal test registry — no framework, plain node. Test IDs match the
// numbering in tests/regression-tests.md so a failure maps straight to the doc.

const registry = [];

export function test(id, name, fn) {
  registry.push({ id, name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export function approx(actual, expected, tol) {
  const abs = tol.abs ?? Math.abs(expected) * (tol.rel ?? 0.001);
  if (!(Math.abs(actual - expected) <= abs)) {
    throw new Error(`expected ${expected} ±${abs}, got ${actual}`);
  }
}

export function notApprox(actual, wrong, minGap) {
  if (Math.abs(actual - wrong) < minGap) {
    throw new Error(`value ${actual} is suspiciously close to the known-wrong ${wrong}`);
  }
}

export async function runAll() {
  let passed = 0;
  const failures = [];
  for (const t of registry) {
    try {
      await t.fn();
      console.log(`ok ${t.id} - ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`FAIL ${t.id} - ${t.name}: ${err.message}`);
      failures.push(t);
    }
  }
  return { passed, failed: failures.length };
}
