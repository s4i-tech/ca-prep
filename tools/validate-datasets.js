/* Dataset validator: schema, content hygiene, manifest consistency. Fails non-zero on any error.
   Usage: node tools/validate-datasets.js [--json data/manifest.json] */
"use strict";
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const CHAPTER_COUNT = { P1: 17, P2: 15, P3: 19 };
const errors = [];
const warns = [];
function E(m) { errors.push(m); }
function W(m) { warns.push(m); }

const ART = [
  [/\bfix:/i, "draft note 'fix:'"],
  [/\bTODO\b|\bFIXME\b|\bXXX\b/, "TODO/FIXME marker"],
  [/\blorem\b/i, "lorem placeholder"],
  [/\{\{|\}\}/, "template braces"],
  [/\bundefined\b|\bNaN\b/, "undefined/NaN leaked into content"],
  [/\?\?/, "double question mark"],
  [/\bdistractor/i, "meta word 'distractor' in student-facing text"],
  [/\bkey corrected\b/i, "editing note leaked"],
  [/\bexam phrasing\b/i, "editing note leaked"],
  [/\brecompute\s*[:;]|\?\s*recompute/i, "self-correction note"],
  [/\btuned\b/i, "draft note 'tuned'"],
  [/for the exam/i, "draft phrasing 'for the exam'"],
];

function scanArtifacts(where, text) {
  for (const [re, label] of ART) if (re.test(text)) E(where + ": " + label + " :: " + text.match(re)[0]);
}

function checkQuestion(where, x, paper, datasetKind) {
  if (!x.id || !/^p[123][qd]-[a-z0-9-]+$/.test(x.id)) E(where + ": bad id " + x.id);
  if (!(x.ch >= 1 && x.ch <= CHAPTER_COUNT[paper])) E(where + ": ch out of range " + x.ch);
  if (!x.topic || x.topic.length < 3) E(where + ": topic missing");
  if (!(x.m >= 1 && x.m <= 12)) E(where + ": marks " + x.m);
  if (!["EASY", "MEDIUM", "HARD"].includes(x.d)) E(where + ": d " + x.d);
  if (!["HIGH", "MEDIUM", "LOW"].includes(x.prob)) E(where + ": prob " + x.prob);
  if (!/not an ICAI statement|not a certainty|cannot catch you cold/.test(x.probWhy || "")) E(where + ": probWhy missing honesty tail");
  if (!x.trend || x.trend.length < 15) E(where + ": trend text missing");
  if (!x.mem || !x.mem.ti || !x.mem.tip || !x.mem.link) E(where + ": mem triad incomplete");
  if (datasetKind.startsWith("mock") && !x.sec) W(where + ": mock question without sec label");
  const isMcq = Array.isArray(x.o);
  if (isMcq) {
    if (x.o.length !== 4) E(where + ": o length " + x.o.length);
    if (!(x.a >= 0 && x.a <= 3)) E(where + ": key " + x.a);
    const seenOpt = new Set();
    x.o.forEach((o, i) => {
      if (!o || !String(o).trim().length) E(where + ": empty option " + i);
      if (o && o.length > 420) W(where + ": option >420 chars " + i);
      const k = o && o.trim().toLowerCase();
      if (seenOpt.has(k)) E(where + ": duplicate option text " + i);
      seenOpt.add(k);
    });
    if (!x.why || x.why.length < 25) E(where + ": why too short");
    if (x.caseRef) {
      if (!x.stem || x.stem.length < 60) E(where + ": case question without stem");
    } else if (x.stem) W(where + ": stem without caseRef");
  } else {
    if (!x.ans || x.ans.length < 150) E(where + ": ans too short");
    if (!x.scheme || x.scheme.length < 10) E(where + ": scheme missing");
    if (!Array.isArray(x.keyPoints) || x.keyPoints.length < 3) E(where + ": keyPoints < 3");
  }
  const minQ = x.caseRef ? 6 : 15;
  if (!(x.q && x.q.length >= minQ)) E(where + ": question stem too short");
  scanArtifacts(where, [x.topic, x.q, x.why || "", x.ans || "", x.scheme || "", x.stem || "", (x.keyPoints || []).join(" "), x.mem.tip, x.mem.link].join(" \u0001 "));
}

function main() {
  const man = JSON.parse(fs.readFileSync(path.join(DATA, "datasets.json"), "utf8"));
  if (!man.notice || !/AI pattern estimates/.test(man.notice)) E("manifest: honesty notice missing");
  if (!Array.isArray(man.attempts) || !man.attempts.length) E("manifest: attempts");
  if (!Array.isArray(man.papers) || man.papers.length !== 3) E("manifest: expect 3 papers");
  for (const p of man.papers) {
    if (!(p.chapterCount === CHAPTER_COUNT[p.id])) E("manifest paper " + p.id + ": chapterCount " + p.chapterCount);
    if (!(p.chapters.length === p.chapterCount)) E("manifest paper " + p.id + ": chapters array length");
  }
  const seenVars = new Set();
  let qTotal = 0;
  for (const ds of man.datasets) {
    const f = path.join(__dirname, "..", ds.file.replace("./", ""));
    if (!fs.existsSync(f)) { E("missing file " + ds.file); continue; }
    if (seenVars.has(ds.jsvar)) E("duplicate jsvar " + ds.jsvar);
    seenVars.add(ds.jsvar);
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const kind = ds.kind;
    if (j.meta.id !== ds.id) E(ds.file + ": meta.id mismatch");
    if (j.meta.count !== j.questions.length) E(ds.file + ": count " + ds.meta.count + " vs actual " + j.questions.length);
    const mcq = j.questions.filter((x) => Array.isArray(x.o));
    if (ds.mcqCount !== mcq.length) E(ds.file + ": mcqCount " + ds.mcqCount + " vs " + mcq.length);
    if (ds.descriptiveCount !== j.questions.length - mcq.length) E(ds.file + ": descriptiveCount mismatch");
    const probs = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    j.questions.forEach((x) => probs[x.prob]++);
    for (const k of Object.keys(probs)) if (ds[k.toLowerCase()] !== probs[k]) E(ds.file + ": prob histogram off at " + k);
    const chs = [...new Set(j.questions.map((x) => x.ch))].sort((a, b) => a - b);
    if (JSON.stringify(chs) !== JSON.stringify(ds.chapters)) E(ds.file + ": chapters meta off");
    // ids unique
    const ids = new Set();
    j.questions.forEach((x) => { if (ids.has(x.id)) E(ds.file + ": duplicate id " + x.id); ids.add(x.id); });
    // case groups of 5
    const cases = new Map();
    j.questions.forEach((x) => { if (x.caseRef) { if (!cases.has(x.caseRef)) cases.set(x.caseRef, []); cases.get(x.caseRef).push(x); } });
    for (const [ref, arr] of cases) if (kind === "core" && arr.length !== 5) E(ds.file + ": case " + ref + " has " + arr.length + " (expect 5)");
    for (const [ref, arr] of cases) {
      const stems = new Set(arr.map((x) => x.stem));
      if (stems.size !== 1) E(ds.file + ": case " + ref + " inconsistent stems");
      if (kind.startsWith("mock") && arr.length !== 5) W(ds.file + ": mock case " + ref + " size " + arr.length);
    }
    j.questions.forEach((x) => checkQuestion(ds.file + "#" + x.id, x, ds.paper, kind));
    qTotal += j.questions.length;
  }
  // mirror freshness
  for (const ds of man.datasets.concat([{ file: "./data/datasets.json", jsvar: "__CA_FINAL_MANIFEST__" }])) {
    const mirror = path.join(DATA, ds.file.replace(/^\.\/data\//, "").replace(/\.json$/, ".js"));
    if (!fs.existsSync(mirror)) E("mirror missing: " + path.basename(mirror) + " (run node tools/mirror.js)");
  }
  console.log("datasets:", man.datasets.length, "questions:", qTotal, "errors:", errors.length, "warnings:", warns.length);
  if (warns.length) warns.slice(0, 20).forEach((w) => console.log(" warn:", w));
  if (errors.length) { errors.slice(0, 60).forEach((e) => console.log(" ERROR:", e)); if (errors.length > 60) console.log("  ...+", errors.length - 60); process.exit(1); }
  console.log("validate: PASS");
}
main();
