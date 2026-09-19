/*
 * EXAM ENGINE (exam.html)
 * Timer survives refresh (deadline-based), auto-submit at 00:00, palette, mark-for-review,
 * case-stem rendering, practice mode with instant feedback. All state in localStorage.
 */
namespace App {
  export class ExamEngine {
    private meta!: DatasetMeta;
    private questions: AnyQuestion[] = [];
    private sess!: ExamSession;
    private timerId = 0;
    private root = document.getElementById("exam-root")!;
    private statusEl = document.getElementById("live-status")!;
    private autoSubmited = false;

    async boot(): Promise<void> {
      const params = new URLSearchParams(location.search);
      let datasetId = params.get("d") ?? "";
      const chParam = params.get("ch");
      if (chParam && !datasetId.includes("-ch")) {
        datasetId = `${datasetId}-ch${chParam}`;
      }
      const mode = (params.get("mode") === "practice" ? "practice" : "exam") as "exam" | "practice";
      try {
        const manifest = await Loader.fetchManifest();
        const meta = await Loader.findDatasetEntry(manifest, datasetId);
        if (!meta) throw new Error("not-in-manifest");
        const file = await Loader.loadDataset(manifest, datasetId);
        this.meta = meta;
        this.questions = file.questions;
        if (!this.questions.length) throw new Error("empty-dataset");

        let sess = Store.getSession(meta.id);
        if (!sess) {
          const now = Date.now();
          sess = {
            datasetId: meta.id, paper: meta.paper, attempt: meta.attempt, mode,
            startedAt: now, deadline: mode === "exam" ? now + meta.durationMinutes * 60_000 : null,
            answers: {}, marks: {}, marked: [], current: 0, total: this.questions.length, warned: {},
          };
          Store.saveSession(sess);
        } else if (sess.submitted) {
          // previous submission exists — offer fresh retake via the portal
          const again = confirm("You already completed this set. Start a fresh attempt? (Previous result stays in history.)");
          if (!again) { location.href = "./index.html#/result/" + this.resultKey(meta.id); return; }
          Store.clearSession(meta.id);
          const now = Date.now();
          sess = {
            datasetId: meta.id, paper: meta.paper, attempt: meta.attempt, mode,
            startedAt: now, deadline: mode === "exam" ? now + meta.durationMinutes * 60_000 : null,
            answers: {}, marks: {}, marked: [], current: 0, total: this.questions.length, warned: {},
          };
          Store.saveSession(sess);
        }
        this.sess = sess;

        // If time already expired before load → straight to results (never a reset).
        if (this.remaining() <= 0 && this.sess.deadline) {
          this.submit(true);
          return;
        }
        this.layout(manifest);
      } catch (err) {
        this.showError(datasetId);
      }
    }

    private resultKey(id: string): string {
      const list = Store.getResults();
      const r = list.find((x) => x.datasetId === id);
      return r ? r.key : "latest";
    }

    private showError(datasetId: string): void {
      this.root.innerHTML = "";
      this.root.appendChild(U.el(`
        <div class="card error-card" role="alert">
          <h2>Unable to load this question set.</h2>
          <p class="muted">Please refresh and try again.</p>
          <p class="small">Dataset: <code>${U.esc(datasetId || "(unknown)")}</code></p>
          <div class="row">
            <button class="btn btn-primary" onclick="location.reload()">Retry</button>
            <a class="btn" href="./index.html">Back to Paper</a>
          </div>
        </div>`));
    }

    /* ---------------- layout ---------------- */
    private layout(manifest: Manifest): void {
      const paper = manifest.papers.find((p) => p.id === this.meta.paper);
      const head = document.getElementById("exam-head")!;
      head.innerHTML = `
        <div class="eh-left">
          <a class="eh-exit" id="exitLink" href="./index.html#/paper/${this.meta.paper}" title="Exit to paper (progress is saved)">&#8592; Exit</a>
          <div class="eh-title"><strong>${U.esc(paper ? paper.title : this.meta.paper)}</strong><span>${U.esc(this.meta.title)}</span></div>
        </div>
        <div class="eh-mid" aria-live="off">
          <span id="qcounter">Q 1/${this.questions.length}</span>
        </div>
        <div class="eh-right">
          ${this.meta.kind === "mock" ? `<span class="badge badge-mock-head">FULL MOCK</span>` : this.meta.kind === "chapter" ? `<span class="badge badge-sec">CHAPTER MCQ</span>` : ""}
          ${this.sess.deadline ? `<div id="timer" class="timer" role="timer" aria-label="Time remaining">--:--:--</div>` : `<div class="timer timer-free" title="Practice mode — untimed">PRACTICE</div>`}
        </div>`;
      document.getElementById("exitLink")!.addEventListener("click", (e) => {
        if (!confirm("Exit the set? Your progress and timer stay saved — you can resume from the portal.")) e.preventDefault();
      });
      this.root.innerHTML = `
        <div class="exam-grid">
          <main class="q-area" id="q-area" aria-live="polite"></main>
          <aside class="palette" id="palette" aria-label="Question palette"></aside>
        </div>
        <div class="nav-bar" id="nav-bar"></div>
        <button class="palette-fab" id="palFab" aria-expanded="false" aria-controls="paletteDrawer">Question palette</button>
        <div class="drawer-scrim" id="drawerScrim" hidden></div>
        <aside class="palette-drawer" id="paletteDrawer" aria-label="Question palette drawer" hidden></aside>
        <div class="toast" id="toast" role="status" aria-live="assertive" hidden></div>`;
      document.getElementById("palFab")!.addEventListener("click", () => this.drawer(true));
      document.getElementById("drawerScrim")!.addEventListener("click", () => this.drawer(false));
      document.addEventListener("keydown", (e) => this.onKey(e));
      if (this.sess.deadline) {
        this.tick();
        this.timerId = window.setInterval(() => this.tick(), 1000);
      }
      this.renderQ();
    }

    private drawer(open: boolean): void {
      const d = document.getElementById("paletteDrawer")!;
      const s = document.getElementById("drawerScrim")!;
      d.hidden = !open; s.hidden = !open;
      document.getElementById("palFab")!.setAttribute("aria-expanded", String(open));
      if (open) this.renderPalette(d, true);
    }

    private onKey(e: KeyboardEvent): void {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "textarea" || tag === "input") return;
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); this.saveAndNext(); }
      else if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); this.prev(); }
      else if (/^[1-9]$/.test(e.key)) {
        const q = this.questions[this.sess.current];
        if (App.isMcq(q)) {
          const i = parseInt(e.key, 10) - 1;
          if (i < q.o.length) { this.select(i); }
        }
      } else if (e.key.toLowerCase() === "r") { this.toggleMark(); }
    }

    /* ---------------- timer ---------------- */
    private remaining(): number {
      if (!this.sess.deadline) return Infinity;
      return Math.floor((this.sess.deadline - Date.now()) / 1000);
    }

    private tick(): void {
      const rem = this.remaining();
      const t = document.getElementById("timer");
      if (!t) return;
      t.textContent = U.hhmmss(rem);
      t.classList.remove("t-warn", "t-danger");
      if (rem <= 300) t.classList.add("t-danger");
      else if (rem <= 600) t.classList.add("t-danger");
      else if (rem <= 1800) t.classList.add("t-warn");
      this.warn("w30", 1800, rem, "30 minutes remaining");
      this.warn("w10", 600, rem, "10 minutes remaining");
      this.warn("w5", 300, rem, "5 minutes remaining — final warnings");
      if (rem <= 0 && !this.autoSubmited) { this.submit(true); }
    }

    private warn(flag: string, at: number, rem: number, msg: string): void {
      if (!this.sess.warned[flag] && rem <= at) {
        this.sess.warned[flag] = true;
        Store.saveSession(this.sess);
        this.toast("&#9200; " + msg);
      }
    }

    private toast(html: string): void {
      const t = document.getElementById("toast");
      if (!t) return;
      t.innerHTML = html;
      t.hidden = false;
      window.setTimeout(() => { t.hidden = true; }, 3800);
    }

    /* ---------------- question rendering ---------------- */
    private state(i: number): string {
      const q = this.questions[i];
      const answered = this.sess.answers[q.id] !== undefined && this.sess.answers[q.id] !== "" &&
        !(typeof this.sess.answers[q.id] === "string" && (this.sess.answers[q.id] as string).trim() === "");
      const marked = this.sess.marked.indexOf(q.id) >= 0;
      return answered && marked ? "ans-mark" : answered ? "answered" : marked ? "marked" : i === this.sess.current ? "current" : "unattempted";
    }

    private renderQ(): void {
      const area = document.getElementById("q-area")!;
      const i = this.sess.current;
      const q = this.questions[i];
      const counter = document.getElementById("qcounter");
      if (counter) counter.textContent = `Q ${i + 1}/${this.questions.length}`;

      let html = `
        <div class="q-meta">
          <span class="tag tag-ch">CH ${q.ch}</span>
          <span class="topic">${U.esc(q.topic)}</span>
          <span class="q-marks">${q.m} mark${q.m > 1 ? "s" : ""}</span>
          ${U.probBadge(q.prob)} ${U.diffBadge(q.d)}
          ${q.sec ? `<span class="badge badge-sec">${U.esc(q.sec)}</span>` : ""}
        </div>`;
      const stemTxt = App.isMcq(q) ? q.stem : undefined;
      if (q.caseRef) {
        html += `<div class="case-stem" id="caseStemBox"><span class="case-label">CASE SCENARIO</span><div>${stemTxt ? U.esc(stemTxt) : "See the scenario shown with the first question of this case."}</div></div>`;
      }
      html += `<div class="q-text">${U.esc(q.q)}</div>`;

      if (App.isMcq(q)) {
        const sel = this.sess.answers[q.id];
        html += `<div class="opts" role="radiogroup" aria-label="Options">` +
          q.o.map((op, k) => `
            <button class="opt" role="radio" aria-checked="${sel === k}" data-opt="${k}">
              <span class="opt-key">${"ABCD"[k]}</span><span class="opt-text">${U.esc(op)}</span>
            </button>`).join("") + `</div>`;
        if (this.sess.mode === "practice" && sel !== undefined) html += this.feedback(q);
      } else {
        const val = (this.sess.answers[q.id] as string) ?? "";
        html += `
          <label class="sr-only" for="descAns">Your answer</label>
          <textarea id="descAns" class="desc-box" rows="12" placeholder="Type your answer here. Structure it like an ICAI answer: provision &#8594; application &#8594; conclusion, with working notes." aria-describedby="descHint">${U.esc(val)}</textarea>
          <p class="small muted" id="descHint">${this.sess.mode === "exam" ? "Auto-saved locally as you type. Expected answer & marks scheme appear after submission." : "Reveal expected answer via “Check answer” once you finish writing."}</p>`;
        if (this.sess.mode === "practice") {
          html += `<div class="row" style="margin-top:.5rem"><button class="btn btn-ghost" id="revealBtn">Check answer</button></div><div id="revealArea"></div>`;
        }
      }
      area.innerHTML = html;

      area.querySelectorAll<HTMLButtonElement>(".opt").forEach((b) =>
        b.addEventListener("click", () => this.select(parseInt(b.getAttribute("data-opt")!, 10))));
      const ta = area.querySelector<HTMLTextAreaElement>("#descAns");
      if (ta) {
        let saveId = 0;
        ta.addEventListener("input", () => {
          window.clearTimeout(saveId);
          saveId = window.setTimeout(() => {
            this.sess.answers[q.id] = ta.value;
            Store.saveSession(this.sess);
            this.renderPalette(document.getElementById("palette")!, false);
            const dr = document.getElementById("paletteDrawer");
            if (dr && !dr.hidden) this.renderPalette(dr, true);
          }, 350);
        });
      }
      const rb = area.querySelector("#revealBtn");
      if (rb) rb.addEventListener("click", () => {
        const d = area.querySelector("#revealArea")!;
        const q2 = q as Descr;
        d.innerHTML = `<div class="fb fb-ok"><div class="fb-head">Expected ICAI answer</div><div class="pre">${U.esc(q2.ans)}</div>
          <div class="fb-head">Marks scheme</div><div class="pre">${U.esc(q2.scheme)}</div>
          ${q2.keyPoints && q2.keyPoints.length ? `<div class="fb-head">Key points expected</div><ul>${q2.keyPoints.map((k) => `<li>${U.esc(k)}</li>`).join("")}</ul>` : ""}
          ${this.memCard(q)}</div>`;
      });
      this.renderNav();
      this.renderPalette(document.getElementById("palette")!, false);
      const dr = document.getElementById("paletteDrawer");
      if (dr && !dr.hidden) this.renderPalette(dr, true);
      document.getElementById("nav-bar")!.scrollTop = 0;
      area.scrollIntoView({ block: "start", behavior: "auto" });
    }

    private feedback(q: Mcq): string {
      const sel = this.sess.answers[q.id] as number;
      const ok = sel === q.a;
      return `<div class="fb ${ok ? "fb-ok" : "fb-no"}" role="status">
        <div class="fb-head">${ok ? "&#10003; Correct" : "&#10007; Incorrect — correct option is " + "ABCD"[q.a]}</div>
        <div class="pre">${U.esc(q.why)}</div>
        <div class="fb-head">Why ${U.esc(q.prob)} for ${U.esc(this.attemptNice())}</div>
        <div>${U.esc(q.probWhy)}</div>
        <div class="trend">${U.esc(q.trend)}</div>
        ${this.memCard(q)}
      </div>`;
    }

    private attemptNice(): string {
      return (this.manifestAttempt() ?? "the attempt").replace("-", " ");
    }
    private _attempt?: string;
    private manifestAttempt(): string {
      if (!this._attempt) this._attempt = this.sess.attempt;
      return this._attempt;
    }

    memCard(q: QuestionBase): string {
      return U.memCard(q);
    }

    /* ---------------- interactions ---------------- */
    private select(k: number): void {
      const q = this.questions[this.sess.current] as Mcq;
      this.sess.answers[q.id] = k;
      Store.saveSession(this.sess);
      if (this.sess.mode === "practice") { this.renderQ(); } else { this.paintOptions(); }
      this.renderPalette(document.getElementById("palette")!, false);
      const dr = document.getElementById("paletteDrawer");
      if (dr && !dr.hidden) this.renderPalette(dr, true);
      this.renderNav();
    }

    private paintOptions(): void {
      const sel = this.sess.answers[(this.questions[this.sess.current] as Mcq).id];
      document.querySelectorAll<HTMLElement>(".opt").forEach((b) => {
        b.setAttribute("aria-checked", String(parseInt(b.getAttribute("data-opt")!, 10) === sel));
      });
    }

    private toggleMark(): void {
      const q = this.questions[this.sess.current];
      const i = this.sess.marked.indexOf(q.id);
      if (i >= 0) this.sess.marked.splice(i, 1); else this.sess.marked.push(q.id);
      Store.saveSession(this.sess);
      this.toast(i >= 0 ? "Mark for review removed" : "Marked for review &#128278;");
      this.renderNav();
      this.renderPalette(document.getElementById("palette")!, false);
      const dr = document.getElementById("paletteDrawer");
      if (dr && !dr.hidden) this.renderPalette(dr, true);
    }

    private clearAnswer(): void {
      const q = this.questions[this.sess.current];
      delete this.sess.answers[q.id];
      Store.saveSession(this.sess);
      this.renderQ();
    }

    private saveAndNext(): void {
      this.sess.current = Math.min(this.questions.length - 1, this.sess.current + 1);
      Store.saveSession(this.sess);
      this.renderQ();
      this.toast("Saved &#10003;");
    }
    private next(): void {
      this.sess.current = Math.min(this.questions.length - 1, this.sess.current + 1);
      Store.saveSession(this.sess);
      this.renderQ();
    }
    private prev(): void {
      this.sess.current = Math.max(0, this.sess.current - 1);
      Store.saveSession(this.sess);
      this.renderQ();
    }
    private goto(i: number): void {
      this.sess.current = Math.max(0, Math.min(this.questions.length - 1, i));
      Store.saveSession(this.sess);
      this.renderQ();
      this.drawer(false);
    }

    private renderNav(): void {
      const nav = document.getElementById("nav-bar")!;
      const i = this.sess.current;
      const q = this.questions[i];
      const marked = this.sess.marked.indexOf(q.id) >= 0;
      nav.innerHTML = `
        <div class="nav-left">
          <button class="btn" id="btnPrev" ${i === 0 ? "disabled" : ""}>&#8592; Previous</button>
          <button class="btn btn-danger-ghost" id="btnClear">Clear answer</button>
        </div>
        <div class="nav-mid">
          <button class="btn ${marked ? "btn-marked" : ""}" id="btnMark" aria-pressed="${marked}">${marked ? "&#128278; Marked" : "Mark for Review"}</button>
        </div>
        <div class="nav-right">
          ${i === this.questions.length - 1
            ? `<button class="btn btn-submit" id="btnSubmit">SUBMIT &#9873;</button>`
            : `<button class="btn btn-primary" id="btnNext">Save &amp; Next &#8594;</button>`}
        </div>`;
      nav.querySelector("#btnPrev")?.addEventListener("click", () => this.prev());
      nav.querySelector("#btnNext")?.addEventListener("click", () => this.saveAndNext());
      nav.querySelector("#btnMark")?.addEventListener("click", () => this.toggleMark());
      nav.querySelector("#btnClear")?.addEventListener("click", () => this.clearAnswer());
      nav.querySelector("#btnSubmit")?.addEventListener("click", () => this.confirmSubmit());
      const answered = Object.keys(this.sess.answers).filter((k) => String(this.sess.answers[k]).trim() !== "").length;
      this.statusEl.textContent = `${answered}/${this.questions.length} answered, ${this.sess.marked.length} marked`;
    }

    private confirmSubmit(): void {
      const answered = Object.keys(this.sess.answers).filter((k) => String(this.sess.answers[k]).trim() !== "").length;
      const un = this.questions.length - answered;
      if (confirm(`Submit this set?\n\nAnswered: ${answered}\nUnattempted: ${un}\n${this.remaining() !== Infinity ? "Time left: " + U.hhmmss(this.remaining()) : "Practice mode"}`)) {
        this.submit(false);
      }
    }

    renderPalette(host: HTMLElement, drawer: boolean): void {
      const counts = { answered: 0, marked: 0, both: 0, un: 0 };
      this.questions.forEach((_, i) => {
        const st = this.state(i);
        if (st === "answered") counts.answered++;
        else if (st === "marked") counts.marked++;
        else if (st === "ans-mark") counts.both++;
        else if (st === "unattempted") counts.un++;
      });
      const title = drawer ? "Question Palette" : "";
      host.innerHTML = `
        ${title ? `<div class="pal-head"><strong>Question Palette</strong><button class="btn-icon" aria-label="Close palette" id="palClose">&#10005;</button></div>` : `<div class="pal-head"><strong>Question Palette</strong></div>`}
        <div class="pal-grid" role="group" aria-label="Jump to question">` +
        this.questions.map((q, i) => {
          const st = this.state(i);
          return `<button class="pbtn p-${st} ${i === this.sess.current ? "p-cur" : ""}" data-i="${i}"
            aria-label="Question ${i + 1}, ${st}${q.prob === "HIGH" ? ", high probability" : ""}">${i + 1}</button>`;
        }).join("") + `</div>
        <div class="pal-legend">
          <span><i class="p-answered"></i>Answered (${counts.answered + counts.both})</span>
          <span><i class="p-marked"></i>Marked (${counts.marked + counts.both})</span>
          <span><i class="p-ans-mark"></i>Answered + Marked (${counts.both})</span>
          <span><i class="p-unattempted"></i>Unattempted (${counts.un})</span>
        </div>
        <button class="btn btn-submit pal-submit" id="palSubmit">Submit Set</button>`;
      host.querySelectorAll<HTMLElement>(".pbtn").forEach((b) =>
        b.addEventListener("click", () => this.goto(parseInt(b.getAttribute("data-i")!, 10))));
      host.querySelector("#palClose")?.addEventListener("click", () => this.drawer(false));
      host.querySelector("#palSubmit")?.addEventListener("click", () => this.confirmSubmit());
    }

    /* ---------------- submit & scoring ---------------- */
    private submit(auto: boolean): void {
      if (this.autoSubmited) return;
      this.autoSubmited = true;
      window.clearInterval(this.timerId);
      const now = Date.now();
      let mcqScore = 0, descScore = 0, maxScore = 0, correct = 0, incorrect = 0, unattempted = 0, attempted = 0;
      const perQ: ResultRecord["perQ"] = [];
      for (const q of this.questions) {
        maxScore += q.m;
        if (App.isMcq(q)) {
          const your = this.sess.answers[q.id];
          const yours = your === undefined ? null : (your as number);
          if (yours === null || String(yours) === "") { unattempted++; perQ.push({ id: q.id, your: null, correct: q.a, awarded: 0, max: q.m, kind: "mcq", prob: q.prob }); }
          else {
            attempted++;
            if (yours === q.a) { correct++; mcqScore += q.m; } else incorrect++;
            perQ.push({ id: q.id, your: yours, correct: q.a, awarded: yours === q.a ? q.m : 0, max: q.m, kind: "mcq", prob: q.prob });
          }
        } else {
          const your = this.sess.answers[q.id] as string | undefined;
          const has = your !== undefined && String(your).trim() !== "";
          if (has) attempted++; else unattempted++;
          perQ.push({ id: q.id, your: has ? your!.slice(0, 4000) : null, correct: null, awarded: 0, max: q.m, kind: "desc", prob: q.prob });
        }
      }
      const rec: ResultRecord = {
        key: this.meta.id + "-" + this.sess.startedAt,
        datasetId: this.meta.id, paper: this.meta.paper, attempt: this.meta.attempt, title: this.meta.title,
        mode: this.sess.mode, startedAt: this.sess.startedAt, submittedAt: now,
        usedSeconds: this.sess.deadline ? Math.min(Math.round((now - this.sess.startedAt) / 1000), this.meta.durationMinutes * 60) : Math.round((now - this.sess.startedAt) / 1000),
        totalQuestions: this.questions.length, attempted, correct, incorrect, unattempted,
        accuracy: attempted ? Math.round((100 * correct) / attempted) : 0,
        mcqScore, descScore, score: mcqScore + descScore, maxScore,
        autoScored: true, perQ,
      };
      Store.saveResult(rec);
      Store.markCompleted(this.meta.id, rec.score, rec.maxScore);
      this.sess.submitted = true;
      this.sess.submittedAt = now;
      Store.saveSession(this.sess);
      location.replace("./index.html#/result/" + rec.key + (auto ? "?auto=1" : ""));
    }
  }

  /* auto=1 param surfaces the “time up” message on the result page */
  export function examMain(): void {
    new ExamEngine().boot();
  }
}
