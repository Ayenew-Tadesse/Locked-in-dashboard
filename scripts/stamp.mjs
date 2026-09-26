// Version-stamps the app's files in index.html so phones and computers load
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
const page = join(root, "index.html");
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

const before = readFileSync(page, "utf8");
let html = before;
const swap = (re, value, what) => {
  if (!re.test(html)) throw new Error(`Couldn't find ${what} in index.html`);
  html = html.replace(re, value);
};
swap(/href="app\/app\.css(\?v=[0-9a-f]+)?"/, `href="app/app.css?v=${hash(join(root, "app/app.css"))}"`, "the app stylesheet");
swap(/<script src="config\.js(\?v=[0-9a-f]+)?"><\/script>/, `<script src="config.js?v=${hash(join(root, "config.js"))}"></script>`, "config.js");
swap(/<script type="module" src="(\.\/)?app\/main\.js(\?v=[0-9a-f]+)?"><\/script>/, `<script type="module" src="${imports["./app/main.js"].slice(2)}"></script>`, "app/main.js");
if (/<script type="importmap" id="li-versions">.*?<\/script>/.test(html)) {
  html = html.replace(/<script type="importmap" id="li-versions">.*?<\/script>/, map);
} else {
  // The import map must come before the first module script: put it right
  // after the app stylesheet link.
  html = html.replace(/(<link rel="stylesheet" href="app\/app\.css\?v=[0-9a-f]+">)/, `$1\n${map}`);
}

if (process.argv.includes("--check")) {
  if (html !== before) {
    console.error("index.html version stamps are out of date. Run: node scripts/stamp.mjs");
    process.exit(1);
  }
  console.log("Version stamps are up to date.");
} else {
  writeFileSync(page, html);
  console.log(html === before ? "Version stamps already up to date." : "Updated version stamps in index.html.");
}
