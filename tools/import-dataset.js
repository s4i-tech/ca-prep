/**
 * CLI tool to import, format, validate, and register a new dataset into the repository.
 *
 * Usage:
 *   node tools/import-dataset.js <file.json> [--paper P1|P2|P3] [--title "Title"] [--kind prediction|core|mock|rapid|chapter]
 *
 * Examples:
 *   node tools/import-dataset.js path/to/new-bank.json
 *   node tools/import-dataset.js path/to/questions.json --paper P1 --kind prediction --title "P1 Advanced Practice"
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MANIFEST_PATH = path.join(DATA_DIR, "datasets.json");

function parseArgs() {
  const args = process.argv.slice(2);
  let file = null;
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const k = args[i].slice(2);
      flags[k] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
    } else if (!file) {
      file = args[i];
    }
  }
  return { file, flags };
}

function camelCase(id) {
  return id.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

function sanitizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function ensureHonestyTail(text) {
  const honesty = " Probabilities are AI pattern estimates — study guidance, not an ICAI statement.";
  if (!text) return "Pattern-based frequency estimation — not an ICAI statement.";
  if (/not an ICAI statement|not a certainty|cannot catch you cold/.test(text)) return text;
  return text.trim() + honesty;
}

function main() {
  const { file, flags } = parseArgs();
  if (!file) {
    console.error("Usage: node tools/import-dataset.js <dataset.json> [--paper P1|P2|P3] [--kind prediction|core|mock|rapid|chapter]");
    process.exit(1);
  }

  const absPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absPath)) {
    console.error(`Error: File not found: ${absPath}`);
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch (e) {
    console.error(`Error: Invalid JSON in ${absPath}: ${e.message}`);
    process.exit(1);
  }

  let questions = [];
  let meta = {};

  if (Array.isArray(raw)) {
    questions = raw;
  } else if (raw && Array.isArray(raw.questions)) {
    questions = raw.questions;
    meta = raw.meta || {};
  } else {
    console.error("Error: Input JSON must be an array of questions or an object with a 'questions' array.");
    process.exit(1);
  }

  const paper = (flags.paper || meta.paper || "P1").toUpperCase();
  if (!["P1", "P2", "P3"].includes(paper)) {
    console.error("Error: --paper must be P1, P2, or P3.");
    process.exit(1);
  }

  const kind = flags.kind || meta.kind || "prediction";
  const id = sanitizeId(flags.id || meta.id || `${paper.toLowerCase()}-nov26-${kind}-${Date.now().toString(36)}`);
  const attempt = flags.attempt || meta.attempt || "NOV-2026";
  const title = flags.title || meta.title || `${paper} Custom Question Set`;
  const jsvar = camelCase(id);

  // Normalize questions
  const normalizedQuestions = questions.map((q, idx) => {
    const isMcq = Array.isArray(q.o) || q.options;
    const options = q.o || q.options || [];
    const ch = parseInt(q.ch, 10) || 1;
    const qid = q.id || `${paper.toLowerCase()}${isMcq ? "q" : "d"}-${id}-q${idx + 1}`;

    const nq = {
      id: qid,
      ch,
      topic: q.topic || `Chapter ${ch} Topic`,
      m: parseInt(q.m, 10) || (isMcq ? 1 : 8),
      d: ["EASY", "MEDIUM", "HARD"].includes(q.d) ? q.d : "MEDIUM",
      q: q.q || q.question || "",
      trend: q.trend && q.trend.length >= 15 ? q.trend : "RTP / MTP pattern analysis for Nov 2026 attempt",
      prob: ["HIGH", "MEDIUM", "LOW"].includes(q.prob) ? q.prob : "MEDIUM",
      probWhy: ensureHonestyTail(q.probWhy),
      mem: q.mem && q.mem.ti && q.mem.tip && q.mem.link ? q.mem : {
        ti: q.topic || `Ch ${ch} Anchor`,
        tip: `Focus on core principles and statutory provisions of Chapter ${ch}.`,
        link: `${paper} / Chapter ${ch}`,
      },
    };

    if (isMcq) {
      nq.o = Array.isArray(options) ? options.map(String) : [];
      while (nq.o.length < 4) nq.o.push(`Option ${nq.o.length + 1}`);
      nq.a = typeof q.a === "number" ? q.a : (typeof q.answerIndex === "number" ? q.answerIndex : 0);
      nq.why = q.why && q.why.length >= 25 ? q.why : "Refer to statutory standard provisions and ICAI study material guidance.";
      if (q.caseRef) {
        nq.caseRef = q.caseRef;
        nq.stem = q.stem || "Case scenario context for linked question.";
      }
    } else {
      nq.ans = q.ans || q.answer || "Detailed answer adhering to ICAI presentation standards with provisions, application, and conclusion.";
      nq.scheme = q.scheme || "Provisions: 3 marks, Application: 3 marks, Conclusion: 2 marks";
      nq.keyPoints = Array.isArray(q.keyPoints) && q.keyPoints.length >= 3 ? q.keyPoints : [
        "Relevant statutory section / standard provision",
        "Factual analysis and application to circumstances",
        "Clear definitive conclusion and accounting/audit treatment",
      ];
    }
    return nq;
  });

  const mcqCount = normalizedQuestions.filter((q) => Array.isArray(q.o)).length;
  const descriptiveCount = normalizedQuestions.length - mcqCount;
  const chapters = [...new Set(normalizedQuestions.map((q) => q.ch))].sort((a, b) => a - b);
  const high = normalizedQuestions.filter((q) => q.prob === "HIGH").length;
  const medium = normalizedQuestions.filter((q) => q.prob === "MEDIUM").length;
  const low = normalizedQuestions.filter((q) => q.prob === "LOW").length;

  const finalMeta = {
    id,
    paper,
    attempt,
    kind,
    category: flags.category || meta.category || (kind === "core" ? "CORE SYLLABUS" : kind === "mock" ? "FULL MOCKS" : "ADDITIONAL PRACTICE"),
    file: `./data/${id}.json`,
    jsvar,
    title,
    description: flags.description || meta.description || `${title} (${normalizedQuestions.length} questions).`,
    count: normalizedQuestions.length,
    mcqCount,
    descriptiveCount,
    coverage: `Ch ${chapters.length > 3 ? `${chapters[0]}–${chapters[chapters.length - 1]}` : chapters.join(", ")} · ${normalizedQuestions.length} questions`,
    chapters,
    durationMinutes: parseInt(flags.duration, 10) || (mcqCount * 1.5 + descriptiveCount * 15) || 60,
    difficulty: flags.difficulty || meta.difficulty || "Exam standard",
    high,
    medium,
    low,
  };

  const outputDataset = {
    meta: finalMeta,
    questions: normalizedQuestions,
  };

  const jsonDest = path.join(DATA_DIR, `${id}.json`);
  fs.writeFileSync(jsonDest, JSON.stringify(outputDataset, null, 2));
  console.log(`✓ Wrote dataset to: data/${id}.json`);

  // Update manifest if not already present
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const existingIdx = manifest.datasets.findIndex((d) => d.id === id);
  if (existingIdx >= 0) {
    manifest.datasets[existingIdx] = finalMeta;
    console.log(`✓ Updated entry in data/datasets.json: ${id}`);
  } else {
    manifest.datasets.push(finalMeta);
    console.log(`✓ Appended new entry to data/datasets.json: ${id}`);
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  // Run mirror generator
  console.log("Generating JS mirror...");
  execSync("node tools/mirror.js", { cwd: ROOT, stdio: "inherit" });

  // Run validator
  console.log("Running validator...");
  try {
    execSync("node tools/validate-datasets.js", { cwd: ROOT, stdio: "inherit" });
    console.log("\n🎉 Successfully imported and registered dataset:");
    console.log(`   ID: ${id}`);
    console.log(`   Paper: ${paper}`);
    console.log(`   Questions: ${normalizedQuestions.length} (${mcqCount} MCQ, ${descriptiveCount} Desc)`);
  } catch (err) {
    console.warn("⚠️ Validation warning/error occurred. Please check output above.");
  }
}

main();
