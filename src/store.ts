/* Namespaced localStorage persistence. Everything stays on-device — no backend, no login. */
namespace App {
  const NS = "ca-final:v1:";

  function get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function set(key: string, value: unknown): void {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
    } catch (e) { /* storage full / private mode — app still works, just not persistent */ }
  }
  function del(key: string): void {
    try { localStorage.removeItem(NS + key); } catch (e) { /* ignore */ }
  }

  export const Store = {
    getAttempt: (): string | null => get<string | null>("attempt", null),
    setAttempt: (v: string) => set("attempt", v),

    getSelectedPaper: (attempt: string): string | null =>
      get<Record<string, string>>(`selected-paper`, {})[attempt] ?? null,
    setSelectedPaper: (attempt: string, paper: string) => {
      const m = get<Record<string, string>>("selected-paper", {});
      m[attempt] = paper;
      set("selected-paper", m);
    },

    getSelectedDataset: (paper: string): string | null =>
      get<Record<string, string>>("selected-dataset", {})[paper] ?? null,
    setSelectedDataset: (paper: string, id: string) => {
      const m = get<Record<string, string>>("selected-dataset", {});
      m[paper] = id;
      set("selected-dataset", m);
    },

    getCompleted: (): Record<string, { at: number; score: number; max: number }> =>
      get("completed", {}),
    markCompleted: (datasetId: string, score: number, max: number) => {
      const m = get<Record<string, { at: number; score: number; max: number }>>("completed", {});
      m[datasetId] = { at: Date.now(), score, max };
      set("completed", m);
    },

    /* -------- live exam session (shared between index.html and exam.html) -------- */
    getSession: (datasetId: string): ExamSession | null =>
      get<Record<string, ExamSession>>("exam-session", {})[datasetId] ?? null,
    saveSession: (s: ExamSession) => {
      const m = get<Record<string, ExamSession>>("exam-session", {});
      m[s.datasetId] = s;
      set("exam-session", m);
      /* lightweight progress mirror for dashboard badges */
      const p = get<Record<string, { answered: number; total: number; at: number }>>("progress", {});
      p[s.datasetId] = {
        answered: Object.keys(s.answers).length,
        total: s.total,
        at: Date.now(),
      };
      set("progress", p);
    },
    clearSession: (datasetId: string) => {
      const m = get<Record<string, ExamSession>>("exam-session", {});
      delete m[datasetId];
      set("exam-session", m);
    },
    getProgress: (): Record<string, { answered: number; total: number; at: number }> =>
      get("progress", {}),

    /* -------- results -------- */
    getResults: (): ResultRecord[] => get<ResultRecord[]>("results", []),
    saveResult: (r: ResultRecord) => {
      const list = get<ResultRecord[]>("results", []);
      const idx = list.findIndex((x) => x.key === r.key);
      if (idx >= 0) list[idx] = r; else list.unshift(r);
      while (list.length > 40) list.pop();
      set("results", list);
    },
    getResult: (key: string): ResultRecord | null =>
      App.Store.getResults().find((r) => r.key === key) ?? null,

    deleteDatasetState: (datasetId: string) => {
      Store.clearSession(datasetId);
      const p = get<Record<string, unknown>>("progress", {});
      delete p[datasetId];
      set("progress", p);
      const c = get<Record<string, unknown>>("completed", {});
      delete c[datasetId];
      set("completed", c);
    },
  };
}
