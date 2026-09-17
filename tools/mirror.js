/* Mirror every data/*.json to a data/*.js window-global assignment (file:// fallback for the loader).
   Usage: node tools/mirror.js          (regenerate)
          node tools/mirror.js --check  (CI: fail if mirrors stale/missing) */
"use strict";
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const MANIFEST_VAR = "__CA_FINAL_MANIFEST__";

function varFor(file) {
  if (file === "datasets.json") return MANIFEST_VAR;
  const j = JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));
  if (!j.meta || !j.meta.jsvar) throw new Error("missing meta.jsvar in " + file);
  return j.meta.jsvar;
}
function mirrorName(file) { return file.replace(/\.json$/, ".js"); }
function render(file) {
  const body = fs.readFileSync(path.join(DATA, file), "utf8");
  JSON.parse(body); // fail fast on invalid JSON
  const v = varFor(file);
  return "/* generated from " + file + " by tools/mirror.js — do not edit */\nwindow." + v + " = " + body + ";\n";
}

function main() {
  if (!fs.existsSync(DATA)) { console.error("no data/ dir — run the builder first"); process.exit(1); }
  const files = fs.readdirSync(DATA).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) { console.error("no json in data/"); process.exit(1); }
  const check = process.argv.includes("--check");
  let bad = 0;
  for (const f of files) {
    const want = render(f);
    const target = path.join(DATA, mirrorName(f));
    const have = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (check) {
      if (have !== want) { console.error("STALE/MISSING mirror: data/" + mirrorName(f)); bad++; }
      else console.log("fresh", mirrorName(f));
    } else {
      fs.writeFileSync(target, want);
      console.log("wrote", mirrorName(f));
    }
  }
  // prune orphan mirrors
  for (const f of fs.readdirSync(DATA).filter((x) => x.endsWith(".js"))) {
    const src = f.replace(/\.js$/, ".json");
    if (!files.includes(src)) {
      if (check) { console.error("ORPHAN mirror: data/" + f); bad++; }
      else { fs.unlinkSync(path.join(DATA, f)); console.log("pruned", f); }
    }
  }
  if (check && bad) { console.error(bad + " mirror problem(s) — run: node tools/mirror.js"); process.exit(1); }
  if (!check) console.log("mirrors up to date for", files.length, "datasets");
}
main();
