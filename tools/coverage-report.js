/* Coverage report per paper from the core datasets: chapter balance, mix, and thin-chapter warnings. */
"use strict";
const fs = require("fs");
const path = require("path");
const DATA = path.join(__dirname, "..", "data");
const man = JSON.parse(fs.readFileSync(path.join(DATA, "datasets.json"), "utf8"));
let out = "| Paper | Chapter | MCQ | Desc | HIGH | Notes |\n|---|---|---|---|---|---|\n";
let thin = 0;
for (const p of man.papers) {
  const core = man.datasets.find((d) => d.paper === p.id && d.kind === "core");
  if (!core) { out += "| " + p.id + " | (no core dataset yet) | | | | |\n"; continue; }
  const j = JSON.parse(fs.readFileSync(path.join(DATA, core.file.replace("./data/", "")), "utf8"));
  for (const ch of p.chapters) {
    const qs = j.questions.filter((q) => q.ch === ch.no);
    const m = qs.filter((q) => Array.isArray(q.o)).length;
    const d = qs.length - m;
    const h = qs.filter((q) => q.prob === "HIGH").length;
    let note = "";
    if (m < 12 || d < 2) { note = "THIN"; thin++; }
    out += "| " + p.id + " | " + ch.no + " " + ch.name + " | " + m + " | " + d + " | " + h + " | " + note + " |\n";
  }
}
console.log(out);
console.log("thin chapters:", thin, "· total datasets:", man.datasets.length);
if (process.argv.includes("--md")) fs.writeFileSync(path.join(__dirname, "..", "docs", "coverage.md"), out);
