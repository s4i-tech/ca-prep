/* Small DOM/format helpers used by every view. */
namespace App {
  export const U = {
    esc(s: string): string {
      return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    el(html: string): HTMLElement {
      const t = document.createElement("template");
      t.innerHTML = html.trim();
      return t.content.firstElementChild as HTMLElement;
    },
    pad2(n: number): string {
      return n < 10 ? "0" + n : String(n);
    },
    hhmmss(sec: number): string {
      if (sec < 0) sec = 0;
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return U.pad2(h) + ":" + U.pad2(m) + ":" + U.pad2(s);
    },
    mmss(sec: number): string {
      if (sec < 0) sec = 0;
      return Math.floor(sec / 60) + ":" + U.pad2(sec % 60);
    },
    dur(min: number): string {
      return min >= 60 ? Math.floor(min / 60) + "h " + (min % 60 ? (min % 60) + "m" : "") : min + " min";
    },
    date(ts: number): string {
      const d = new Date(ts);
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
        ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    },
    probBadge(p: "HIGH" | "MEDIUM" | "LOW"): string {
      return `<span class="prob prob-${p.toLowerCase()}">${p}</span>`;
    },
    diffBadge(d: string): string {
      return `<span class="badge badge-${d.toLowerCase()}">${U.esc(d)}</span>`;
    },
    kindBadge(kind: string): string {
      const map: Record<string, string> = {
        prediction: "PREDICTION", core: "CORE SYLLABUS", mock: "FULL MOCK", rapid: "RAPID REVISION", chapter: "CHAPTER MCQ",
      };
      return `<span class="kind kind-${kind}">${map[kind] ?? U.esc(kind.toUpperCase())}</span>`;
    },
    memCard(q: QuestionBase): string {
      if (!q.mem) return "";
      return `<div class="mem-card">
        <div class="mem-head">&#129504; MEMORY ANCHOR</div>
        <div class="mem-ti">${U.esc(q.mem.ti)}</div>
        <div class="mem-tip"><b>TIP:</b> ${U.esc(q.mem.tip)}</div>
        <div class="mem-link"><b>Quick Link:</b> ${U.esc(q.mem.link)}</div>
      </div>`;
    },
  };
}
