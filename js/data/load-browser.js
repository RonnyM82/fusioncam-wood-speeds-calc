// The only fetch in the codebase. Returns the same shape as tests/load-node.js.

export async function loadData(baseUrl = 'data/') {
  const [chiploads, kc, machines, rules, drills] = await Promise.all([
    fetchJson(`${baseUrl}chiploads.json`),
    fetchJson(`${baseUrl}kc.json`),
    fetchJson(`${baseUrl}machines.json`),
    fetchJson(`${baseUrl}rules.json`),
    fetchJson(`${baseUrl}drills.json`),
  ]);
  return { chiploads, kc, machines, rules, drills };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}
