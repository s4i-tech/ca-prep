/* Result analysis: question-by-question review with expected answers, probability rationale and Memory Anchors. */
namespace App {
  export const Results = {
    async renderReview(view: View, r: ResultRecord, paper: PaperInfo): Promise<void> {
      const host = document.getElementById("review-anchor") ?? view.root;
      host.innerHTML = `<div class="card empty">Loading question review…</div>`;
      let dataset: DatasetFile | null = null;
      try {
        dataset = await Loader.loadDataset(view.manifest, r.datasetId);
      } catch (e) {
        host.innerHTML = "";
        host.appendChild(U.el(`<div class="card error-card" role="alert">
          <h2>Review unavailable</h2><p class="muted">The dataset file could not be loaded, so answers cannot be shown. Your scorecard above is safe.</p>
        </div>`));
        return;
      }
      host.innerHTML = "";
      const autoUp = location.hash.indexOf("auto=1") >= 0;
      if (autoUp) {
        host.appendChild(U.el(`<div class="notice notice-amber" role="alert">&#9200; This set was <b>auto-submitted</b> because the timer reached 00:00.</div>`));
      }
      const head = U.el(`
        <div class="group-head rev-head"><h2>QUESTION REVIEW</h2>
          <p>Answer &#8594; Understand &#8594; Remember &#8594; Revise. ${r.autoScored ? "Descriptive answers are <b>self-marked</b> against the expected scheme — adjust the marks and the scorecard updates." : ""}</p>
        </div>`);
      host.appendChild(head);

      const filter = U.el(`
        <div class="chip-row" role="group" aria-label="Filter review">
          <button class="chip on" data-f="all">All (${r.totalQuestions})</button>
          <button class="chip" data-f="wrong">Wrong (${r.incorrect})</button>
          <button class="chip" data-f="skipped">Skipped (${r.unattempted})</button>
          <button class="chip" data-f="high">${"HIGH prob"} (${r.perQ.filter((x) => x.prob === "HIGH").length})</button>
        </div>`);
      host.appendChild(filter);

      const list = U.el(`<div class="rev-list" id="rev-list"></div>`);
      host.appendChild(list);

      const byId = new Map<string, AnyQuestion>();
      dataset.questions.forEach((q) => byId.set(q.id, q));

      const draw = (f: string): void => {
        list.innerHTML = "";
        let n = 0;
        r.perQ.forEach((pq, idx) => {
          if (f === "wrong" && !(pq.kind === "mcq" && pq.your !== null && pq.your !== pq.correct)) return;
          if (f === "skipped" && pq.your !== null && String(pq.your).trim() !== "") return;
          if (f === "high" && pq.prob !== "HIGH") return;
          n++;
          const q = byId.get(pq.id);
          if (!q) return;
          list.appendChild(this.reviewCard(q, pq, idx + 1, r));
        });
        if (!n) list.innerHTML = `<div class="card empty">Nothing here — good sign.</div>`;
      };
      filter.querySelectorAll<HTMLElement>(".chip").forEach((c) =>
        c.addEventListener("click", () => {
          filter.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
          c.classList.add("on");
          draw(c.getAttribute("data-f")!);
        }));
      draw("all");

      this.bindSelfMarks(r, () => {
        const hero = document.querySelector(".score-hero");
        if (hero && r.maxScore) {
          const total = r.perQ.reduce((t, x) => t + x.awarded, 0);
          const pct = Math.round((100 * total) / r.maxScore);
          hero.querySelector(".score-big")!.innerHTML = `${total}<span> / ${r.maxScore}</span>`;
          hero.querySelector(".score-side > div:nth-child(1) b")!.textContent = pct + "%";
        }
      });
    },

    reviewCard(q: AnyQuestion, pq: ResultRecord["perQ"][number], no: number, r: ResultRecord): HTMLElement {
      const isMcq = App.isMcq(q);
      let status: string, cls: string;
      if (pq.your === null || String(pq.your).trim() === "") { status = "UNATTEMPTED"; cls = "s-skip"; }
      else if (isMcq) { const ok = pq.your === pq.correct; status = ok ? "CORRECT" : "INCORRECT"; cls = ok ? "s-ok" : "s-no"; }
      else { status = pq.awarded > 0 ? `SELF-MARKED ${pq.awarded}/${pq.max}` : "NEEDS SELF-MARK"; cls = "s-desc"; }

      let body = "";
      if (isMcq) {
        const mc = q as Mcq;
        body = `
          <div class="ans-cols">
            <div class="ans-col ${cls}">
              <span class="k">Your Answer</span>
              <div class="pre">${pq.your === null ? "<i>Not attempted</i>" : `<b>${"ABCD"[pq.your as number]}.</b> ${U.esc(mc.o[pq.your as number])}`}</div>
            </div>
            <div class="ans-col ${pq.your === pq.correct ? "s-ok" : "s-ans"}">
              <span class="k">Correct Answer</span>
              <div class="pre"><b>${"ABCD"[mc.a]}.</b> ${U.esc(mc.o[mc.a])}</div>
            </div>
          </div>
          <div class="rev-block"><span class="k">Why</span><div class="pre">${U.esc(mc.why)}</div></div>`;
      } else {
        const dq = q as Descr;
        body = `
          <div class="ans-cols">
            <div class="ans-col"><span class="k">Your Answer</span><div class="pre">${pq.your ? U.esc(String(pq.your)) : "<i>Not attempted</i>"}</div></div>
            <div class="ans-col s-ans"><span class="k">Expected ICAI Answer</span><div class="pre">${U.esc(dq.ans)}</div></div>
          </div>
          <div class="rev-block"><span class="k">Marks Scheme</span><div class="pre">${U.esc(dq.scheme)}</div></div>
          ${dq.keyPoints && dq.keyPoints.length ? `<div class="rev-block"><span class="k">Key Points Expected</span><ul class="kp">${dq.keyPoints.map((k) => `<li>${U.esc(k)}</li>`).join("")}</ul></div>` : ""}
          <div class="selfmark" data-qid="${q.id}" data-max="${q.m}">
            <span class="k">Award yourself (honest marking works):</span>
            <div class="sm-row">
              <input type="range" min="0" max="${q.m}" step="1" value="${pq.awarded}" data-qid="${q.id}" aria-label="Self awarded marks out of ${q.m}">
              <b class="sm-val">${pq.awarded}/${q.m}</b>
            </div>
          </div>`;
      }

      const opts = isMcq ? `<details class="rev-opts"><summary>All options you saw</summary><ol type="A" class="opt-list">${(q as Mcq).o.map((op, k) => `<li class="${k === (q as Mcq).a ? "ok" : ""}">${U.esc(op)}</li>`).join("")}</ol></details>` : "";

      const card = U.el(`
        <div class="card rev-card ${cls}" data-qid="${q.id}">
          <div class="rev-top">
            <span class="rev-no">Q${no}</span>
            <span class="rev-status ${cls}">${status}</span>
            <span class="tag tag-ch">CH ${q.ch}</span>
            <span class="topic">${U.esc(q.topic)}</span>
            <span class="q-marks">${pq.awarded}/${pq.max} marks</span>
            <span class="sp"></span>
            ${U.probBadge(q.prob)} ${U.diffBadge(q.d)}
          </div>
          <div class="q-text">${U.esc(q.q)}</div>
          ${opts}
          ${body}
          <div class="rev-block prob-row">
            <span class="k">Why this may appear in ${U.esc(r.attempt.replace("-", " "))}</span>
            <div class="pre">${U.esc(q.probWhy)} <span class="trend">${U.esc(q.trend)}</span></div>
          </div>
          ${U.memCard(q)}
        </div>`);
      return card;
    },

    bindSelfMarks(r: ResultRecord, onTotal: () => void): void {
      document.querySelectorAll<HTMLInputElement>(".selfmark input[type=range]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const qid = inp.getAttribute("data-qid")!;
          const pq = r.perQ.find((x) => x.id === qid);
          if (!pq) return;
          pq.awarded = parseInt(inp.value, 10);
          (document.querySelector(`.rev-card[data-qid="${qid}"] .sm-val`) as HTMLElement).textContent = `${pq.awarded}/${pq.max}`;
          const st = document.querySelector(`.rev-card[data-qid="${qid}"] .rev-status`) as HTMLElement;
          if (st) { st.textContent = pq.awarded > 0 ? `SELF-MARKED ${pq.awarded}/${pq.max}` : "NEEDS SELF-MARK"; }
          const mk = document.querySelector(`.rev-card[data-qid="${qid}"] .q-marks`) as HTMLElement;
          if (mk) mk.textContent = `${pq.awarded}/${pq.max} marks`;
          r.descScore = r.perQ.filter((x) => x.kind === "desc").reduce((t, x) => t + x.awarded, 0);
          r.score = r.mcqScore + r.descScore;
          Store.saveResult(r);
          onTotal();
        });
      });
    },
  };
}
