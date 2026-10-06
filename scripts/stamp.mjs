// Version-stamps the app's files in index.html and portfolio.html so phones and computers load
// every update instead of reusing saved copies (GitHub Pages lets browsers
// keep files for 10 minutes, and a mix of old and new files can break).
//
//   node scripts/stamp.mjs          update index.html
//   node scripts/stamp.mjs --check  exit 1 if index.html is out of date
//
// Each file gets ?v=<first 10 hex of its SHA-256>. JavaScript modules import
// each other by plain relative paths, so an import map sends every one of
// them to its stamped address. Browsers without import maps still work; they
// just fall back to normal caching.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  }).sort();
}

const modules = files(join(root, "app")).filter((f) => f.endsWith(".js"));
const imports = Object.fromEntries(modules.map((f) => {
  const rel = "./" + relative(root, f).split("\\").join("/");
  return [rel, `${rel}?v=${hash(f)}`];
}));
const map = `<script type="importmap" id="li-versions">${JSON.stringify({ imports })}</script>`;

// Each page: its stylesheets, config.js, its entry module, and the import map
// (placed right after its first stylesheet, before any module script).
const PAGES = [
  { file: "index.html", css: ["app/app.css", "app/portfolio.css", "app/theme.css"], main: "app/main.js" },
  { file: "portfolio.html", css: ["app/portfolio.css"], main: "app/portfolio-page.js" },
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let stale = [], changed = [];
for (const pg of PAGES) {
  const path = join(root, pg.file);
  const before = readFileSync(path, "utf8");
  let html = before;
  const swap = (re, value, what) => {
    if (!re.test(html)) throw new Error(`Couldn't find ${what} in ${pg.file}`);
    html = html.replace(re, value);
  };
  for (const css of pg.css) swap(new RegExp(`href="${esc(css)}(\\?v=[0-9a-f]+)?"`), `href="${css}?v=${hash(join(root, css))}"`, css);
  swap(/<script src="config\.js(\?v=[0-9a-f]+)?"><\/script>/, `<script src="config.js?v=${hash(join(root, "config.js"))}"></script>`, "config.js");
  swap(new RegExp(`<script type="module" src="(\\./)?${esc(pg.main)}(\\?v=[0-9a-f]+)?"></script>`), `<script type="module" src="${imports["./" + pg.main].slice(2)}"></script>`, pg.main);
  if (/<script type="importmap" id="li-versions">.*?<\/script>/.test(html)) {
    html = html.replace(/<script type="importmap" id="li-versions">.*?<\/script>/, map);
  } else {
    html = html.replace(new RegExp(`(<link rel="stylesheet" href="${esc(pg.css[0])}\\?v=[0-9a-f]+">)`), `$1\n${map}`);
  }
  if (html !== before) { stale.push(pg.file); changed.push([path, html]); }
}

if (process.argv.includes("--check")) {
  if (stale.length) {
    console.error(`Version stamps are out of date in ${stale.join(", ")}. Run: node scripts/stamp.mjs`);
    process.exit(1);
  }
  console.log("Version stamps are up to date.");
} else {
  for (const [path, html] of changed) writeFileSync(path, html);
  console.log(changed.length ? `Updated version stamps in ${stale.join(", ")}.` : "Version stamps already up to date.");
}
