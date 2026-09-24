// The public page's build. Written 2026-09-24, step 1 of docs/CONVERSION_PLAN.md.
//
// The React app is index.html and src/. Everything else this site serves is
// copied into dist/ byte for byte by publishSiteFiles() below, from where it
// lives in the repo, so nothing is kept twice: the Fusion panel and every file
// it loads, and the archived reference article.
import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repo = dirname(fileURLToPath(import.meta.url));

// THE FUSION PANEL stays vanilla in this work (the plan's rulings) and the
// add-in opens it at https://wood.fusioncam.co/fusion.html. So fusion.html and
// every file it loads keep their addresses in the published site, and the
// ?v=<PAGE_BUILD> cache keys in fusion.html stay as written, because Fusion's
// palette browser serves a stale copy of any address whose key did not
// change. The files are copied at build time from where they already are, not
// kept in public/: js/core/, js/data/ and data/ are also what the tests and
// the React app read, and a second copy would drift.
//
// tools/fusion-harness.js is here because fusion.html?harness=1 imports it,
// and that is the check that the published panel still works (vite preview,
// then /fusion.html?harness=1). It has been a public address since the panel
// shipped, because the whole repo was the site.
//
// THE REFERENCE ARTICLE keeps its address, copied unchanged (the plan's
// rulings): an archived third-party page, linked from nothing, that someone
// may hold a link to.
const SITE_FILES = [
  "fusion.html",
  "fusion.css",
  "app-tokens.css",
  "tokens",
  "components",
  "fonts",
  "icons",
  "js/core",
  "js/data",
  "js/fusion",
  "js/ui/fusion-panel.js",
  "js/ui/format.js",
  "js/ui/drill-tables.js",
  "tools/fusion-harness.js",
  "data/chiploads.json",
  "data/kc.json",
  "data/machines.json",
  "data/rules.json",
  "data/drills.json",
  "reference/cnc-router-speeds-feeds-reference_4.html",
];

// Every local address fusion.html loads, and every module those load, must
// exist in dist/ after the copy. A missing one fails the build rather than
// shipping a panel that goes blank inside Fusion. The crawl reads the
// literal paths in src/href attributes and in import statements; a template
// import such as `../../components/lt-elements.js?v=${PAGE_BUILD}` is read
// up to its query.
function panelAddresses(outDir: string): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [];
  const add = (fromFile: string, ref: string) => {
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) return;
    const path = ref.split(/[?#]/)[0];
    if (!path) return;
    const target = posix.normalize(posix.join(posix.dirname(fromFile), path));
    if (seen.has(target)) return;
    seen.add(target);
    queue.push(target);
  };
  // Comments first: fusion.html's own comments quote example markup.
  const html = readFileSync(join(outDir, "fusion.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) add("fusion.html", m[1]);
  while (queue.length) {
    const file = queue.shift()!;
    const abs = join(outDir, file);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      missing.push(file);
      continue;
    }
    if (!file.endsWith(".js")) continue;
    const src = readFileSync(abs, "utf8");
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"`])([^'"`$]+)/g)) {
      if (m[2].startsWith(".")) add(file, m[2]);
    }
  }
  return missing;
}

function publishSiteFiles(): Plugin {
  let outDir = "dist";
  return {
    name: "wood:publish-site-files",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const rel of SITE_FILES) {
        cpSync(join(repo, rel), join(outDir, rel), { recursive: true });
      }
      const missing = panelAddresses(outDir);
      if (missing.length) {
        throw new Error(`The Fusion panel would lose these files in the published site: ${missing.join(", ")}`);
      }
    },
  };
}

export default defineConfig({
  // The site is on its own domain (public/CNAME), so it is served from the root.
  base: "/",
  plugins: [react(), publishSiteFiles()],
  resolve: {
    // @livetools/ui is linked from the design-system checkout during the
    // build sessions, and its own imports of React would otherwise resolve
    // from that checkout's node_modules: two Reacts, and every hook throws.
    // Harmless once the published package replaces the link.
    dedupe: ["react", "react-dom"],
  },
  build: {
    // The five data files are bundled into the page, about 260 KB of the
    // script before compression, so Vite's default warning at 500 KB would
    // fire on every build and teach everyone to ignore it.
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    // Only the React page. Without this the dev server scans every HTML file
    // in the repo, fusion.html, legacy.html and the archived pages included.
    entries: ["index.html"],
  },
});
