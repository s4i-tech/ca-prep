/*
 * Manifest-driven data loading.
 *   Manifest (data/datasets.json) → Dataset Resolver → Selected Dataset → Exam Engine
 *
 * Loading strategy (works on https AND file://):
 *  1. fetch() the .json  (normal, fastest — only the SELECTED dataset is ever fetched)
 *  2. if fetch fails (file:// CORS), inject the generated ./data/*.js mirror as a <script>
 *     and read the global var named by the manifest `jsvar` field.
 */
namespace App {
  const manifestCache: { v: Manifest | null } = { v: null };

  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("script-failed: " + src));
      document.head.appendChild(s);
    });
  }

  function pathToJs(p: string): string {
    return p.replace(/\.json$/, ".js");
  }

  export const Loader = {
    isFileProtocol(): boolean {
      return location.protocol === "file:";
    },

    async fetchManifest(): Promise<Manifest> {
      if (manifestCache.v) return manifestCache.v;
      if (!Loader.isFileProtocol()) {
        try {
          const r = await fetch("./data/datasets.json", { cache: "no-cache" });
          if (r.ok) {
            manifestCache.v = (await r.json()) as Manifest;
            return manifestCache.v;
          }
        } catch (e) { /* fall through to mirror */ }
      }
      await loadScript("./data/datasets.js");
      const m = (window as unknown as Record<string, Manifest>).__CA_FINAL_MANIFEST__;
      if (!m || !Array.isArray(m.datasets)) throw new Error("manifest-missing");
      manifestCache.v = m;
      return m;
    },

    async findDatasetEntry(manifest: Manifest, datasetId: string): Promise<DatasetMeta | null> {
      const existing = manifest.datasets.find((d) => d.id === datasetId);
      if (existing) return existing;

      const chMatch = datasetId.match(/^([a-z0-9-]+)-ch(\d+)$/i);
      if (chMatch) {
        const baseId = chMatch[1];
        const ch = parseInt(chMatch[2], 10);
        const baseEntry = manifest.datasets.find((d) => d.id === baseId);
        if (baseEntry) {
          const paper = manifest.papers.find((p) => p.id === baseEntry.paper);
          const chInfo = paper?.chapters.find((c) => c.no === ch);
          return {
            ...baseEntry,
            id: datasetId,
            title: `Ch ${ch}: ${chInfo ? chInfo.name : "Chapter " + ch} — MCQ Set`,
            description: `Chapter ${ch} MCQ practice set for ${paper ? paper.title : baseEntry.paper}.`,
            category: "CHAPTER-WISE MCQs",
            kind: "chapter",
            coverage: `Chapter ${ch}`,
            chapters: [ch],
          };
        }
      }
      return null;
    },

    async loadDataset(manifest: Manifest, datasetId: string): Promise<DatasetFile> {
      const chMatch = datasetId.match(/^([a-z0-9-]+)-ch(\d+)$/i);
      if (chMatch) {
        const baseId = chMatch[1];
        const ch = parseInt(chMatch[2], 10);
        const baseFile = await Loader.loadDataset(manifest, baseId);
        const mcqs = baseFile.questions.filter((q) => App.isMcq(q) && q.ch === ch);
        const qs = mcqs.length ? mcqs : baseFile.questions.filter((q) => q.ch === ch);
        const entry = await Loader.findDatasetEntry(manifest, datasetId);
        const meta: DatasetMeta = {
          ...(entry || baseFile.meta),
          id: datasetId,
          count: qs.length,
          mcqCount: qs.length,
          descriptiveCount: 0,
          chapters: [ch],
          durationMinutes: Math.max(10, Math.ceil(qs.length * 1.5)),
          high: qs.filter((q) => q.prob === "HIGH").length,
          medium: qs.filter((q) => q.prob === "MEDIUM").length,
          low: qs.filter((q) => q.prob === "LOW").length,
          kind: "chapter",
        };
        return { meta, questions: qs };
      }

      const entry = await Loader.findDatasetEntry(manifest, datasetId);
      if (!entry) throw new Error("dataset-not-in-manifest: " + datasetId);
      if (!Loader.isFileProtocol()) {
        try {
          const r = await fetch(entry.file, { cache: "no-cache" });
          if (r.ok) return (await r.json()) as DatasetFile;
        } catch (e) { /* fall through to mirror */ }
      }
      await loadScript(pathToJs(entry.file));
      const wv = window as unknown as Record<string, unknown>;
      let data = wv[entry.jsvar];
      if (!data) { // mirror may define via window too; tolerate casing
        data = wv[entry.jsvar] ?? wv["__ds_" + entry.id];
      }
      if (!data) throw new Error("dataset-missing-global: " + entry.jsvar);
      return data as DatasetFile;
    },

    datasetsFor(manifest: Manifest, attempt: string, paper: string): DatasetMeta[] {
      return manifest.datasets.filter((d) => d.attempt === attempt && d.paper === paper);
    },
  };
}
