/* End-to-end contract test without a browser:
   manifest ↔ dataset files ↔ .js mirrors ↔ loader globals ↔ scoring keys.
   Run: node tools/e2e-test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const DATA = path.join(__dirname, "..", "data");
let fails = 0;
function ok(cond, msg) { if (!cond) { console.log("FAIL:", msg); fails++; } }

const man = JSON.parse(fs.readFileSync(path.join(DATA, "datasets.json"), "utf8"));
ok(Array.isArray(man.datasets) && man.datasets.length >= 10, "manifest datasets");
ok(man.papers.length === 3, "three papers");

// 1. mirror contract: datasets.js exposes __CA_FINAL_MANIFEST__; each file's .js exposes meta.jsvar
function loadMirror(file) {
  const code = fs.readFileSync(path.join(DATA, file), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window;
}
const wMan = loadMirror("datasets.js");
ok(!!wMan.__CA_FINAL_MANIFEST__, "manifest mirror global");
ok(JSON.stringify(wMan.__CA_FINAL_MANIFEST__) === JSON.stringify(man), "manifest mirror byte-identical");

for (const ds of man.datasets) {
  const jsonFile = ds.file.replace("./data/", "");
  const jsFile = jsonFile.replace(/\.json$/, ".js");
  const w = loadMirror(jsFile);
  ok(!!w[ds.jsvar], ds.jsvar + " global present in " + jsFile);
  const a = JSON.parse(fs.readFileSync(path.join(DATA, jsonFile), "utf8"));
  ok(JSON.stringify(w[ds.jsvar]) === JSON.stringify(a), "mirror equality " + jsFile);
  ok(a.questions.length > 0, ds.id + " has questions");

  // 2. scoring simulation: answering 'a' for every MCQ must score full MCQ marks; desc keys exist
  let maxMarks = 0;
  for (const q of a.questions) {
    maxMarks += q.m;
    if (Array.isArray(q.o)) {
      ok(q.a >= 0 && q.a < q.o.length, ds.id + " key range " + q.id);
      ok(q.o[q.a] && String(q.o[q.a]).trim().length >= 1, ds.id + " correct option text " + q.id);
    } else {
      ok(typeof q.ans === "string" && q.ans.length > 50, ds.id + " desc answer " + q.id);
    }
  }
  ok(maxMarks > 0, ds.id + " total marks > 0");
  if (ds.kind.startsWith("mock")) ok(maxMarks >= 95 && maxMarks <= 130, ds.id + " mock total marks = " + maxMarks);
}

// 3. cross-dataset stability: core ⊇ prediction, prediction ⊇ mock-1 descs? — check id inclusion rules that hold by construction
for (const p of man.papers) {
  const core = man.datasets.find((d) => d.paper === p.id && d.kind === "core");
  const pred = man.datasets.find((d) => d.paper === p.id && d.kind === "prediction");
  if (!core || !pred) continue;
  const coreIds = new Set(JSON.parse(fs.readFileSync(path.join(DATA, core.file.replace("./data/", "")), "utf8")).questions.map((q) => q.id));
  const predQs = JSON.parse(fs.readFileSync(path.join(DATA, pred.file.replace("./data/", "")), "utf8")).questions;
  ok(predQs.every((q) => coreIds.has(q.id)), p.id + ": prediction ids all present in core");
}

// 4. resume-store key sanity: ids unique per dataset
for (const ds of man.datasets) {
  const qs = JSON.parse(fs.readFileSync(path.join(DATA, ds.file.replace("./data/", "")), "utf8")).questions;
  ok(new Set(qs.map((q) => q.id)).size === qs.length, ds.id + ": unique ids");
}

// 5. chapter-wise MCQ availability contract: every chapter in every paper has banked MCQs
for (const p of man.papers) {
  const core = man.datasets.find((d) => d.paper === p.id && d.kind === "core");
  ok(!!core, p.id + " has core dataset");
  const coreFile = JSON.parse(fs.readFileSync(path.join(DATA, core.file.replace("./data/", "")), "utf8"));
  for (const ch of p.chapters) {
    const chMcqs = coreFile.questions.filter((q) => Array.isArray(q.o) && q.ch === ch.no);
    ok(chMcqs.length > 0, p.id + " ch " + ch.no + " has banked MCQs (" + chMcqs.length + ")");
  }
}

console.log(fails ? "E2E FAILURES: " + fails : "e2e: PASS — manifest, mirrors, loaders, scoring keys, ids all verified");
process.exit(fails ? 1 : 0);
