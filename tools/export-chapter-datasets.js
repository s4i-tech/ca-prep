/**
 * Tool to export chapter-wise MCQ datasets from the core banks.
 *
 * Usage:
 *   node tools/export-chapter-datasets.js [--paper P1|P2|P3] [--out-dir data/chapter-mcqs]
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const MANIFEST_PATH = path.join(DATA_DIR, "datasets.json");

function main() {
  const args = process.argv.slice(2);
  const paperFilter = args.includes("--paper") ? args[args.indexOf("--paper") + 1] : null;
  const outDir = args.includes("--out-dir") ? path.resolve(process.cwd(), args[args.indexOf("--out-dir") + 1]) : path.join(DATA_DIR, "chapters");

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const papers = paperFilter ? manifest.papers.filter((p) => p.id === paperFilter) : manifest.papers;

  let totalExported = 0;

  for (const paper of papers) {
    const coreMeta = manifest.datasets.find((d) => d.paper === paper.id && d.kind === "core");
    if (!coreMeta) continue;

    const coreFile = JSON.parse(fs.readFileSync(path.join(DATA_DIR, coreMeta.file.replace("./data/", "")), "utf8"));
    const allMcqs = coreFile.questions.filter((q) => Array.isArray(q.o));

    console.log(`Processing ${paper.id} (${paper.title}): ${allMcqs.length} MCQs across ${paper.chapters.length} chapters...`);

    for (const ch of paper.chapters) {
      const chMcqs = allMcqs.filter((q) => q.ch === ch.no);
      if (!chMcqs.length) continue;

      const id = `${paper.id.toLowerCase()}-nov26-ch${ch.no}-mcq`;
      const high = chMcqs.filter((q) => q.prob === "HIGH").length;
      const medium = chMcqs.filter((q) => q.prob === "MEDIUM").length;
      const low = chMcqs.filter((q) => q.prob === "LOW").length;

      const chData = {
        meta: {
          id,
          paper: paper.id,
          attempt: "NOV-2026",
          kind: "chapter",
          category: "CHAPTER-WISE MCQs",
          title: `Ch ${ch.no}: ${ch.name} — MCQ Bank`,
          description: `Chapter-wise practice MCQs for Chapter ${ch.no} (${ch.name}).`,
          count: chMcqs.length,
          mcqCount: chMcqs.length,
          descriptiveCount: 0,
          coverage: `Chapter ${ch.no} · ${chMcqs.length} MCQs`,
          chapters: [ch.no],
          durationMinutes: Math.max(10, Math.ceil(chMcqs.length * 1.5)),
          difficulty: "Exam standard",
          high,
          medium,
          low,
        },
        questions: chMcqs,
      };

      const outPath = path.join(outDir, `${id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(chData, null, 2));
      totalExported++;
    }
  }

  console.log(`\n✓ Successfully exported ${totalExported} chapter MCQ dataset files to ${outDir}`);
}

main();
