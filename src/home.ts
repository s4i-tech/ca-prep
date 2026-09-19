/* Index-page views: Attempt → Paper → Category/Dataset → Instructions. Manifest-driven. */
namespace App {
  export class Home {
    private v: View;
    constructor(private manifest: Manifest, private root: HTMLElement) {
      this.v = { manifest: manifest, root, go: Router.go };
      this.attemptId = Store.getAttempt() ?? (manifest.attempts.find((a) => a.current)?.id ?? manifest.attempts[0]?.id ?? "");
    }
    private attemptId: string;

    render(): void {
      const r = Router.parse();
      switch (r.name) {
        case "attempts": this.viewAttempts(); break;
        case "paper": this.viewPaper(r.arg!, r.arg2); break;
        case "dataset": this.viewDataset(r.arg!); break;
        case "instructions": this.viewInstructions(r.arg!, r.arg2 ?? "exam"); break;
        case "results": this.viewResults(); break;
        case "result": this.viewResultDetail(r.arg!); break;
        default: this.viewHome();
      }
      window.scrollTo({ top: 0 });
    }

    private attemptLabel(): string {
      return this.manifest.attempts.find((a) => a.id === this.attemptId)?.label ?? "CA Final";
    }
    private paperInfo(p: string): PaperInfo {
      return this.manifest.papers.find((x) => x.id === p)!;
    }

    /* ================= attempts ================= */
    private viewAttempts(): void {
      this.root.innerHTML = "";
      this.root.appendChild(chrome({
        title: "CA FINAL<br><span class='hl'>Select Attempt</span>",
        sub: "The portal is organised attempt &#8594; paper &#8594; category &#8594; dataset. More attempts can be added to the manifest without any code change.",
      }));
      const wrap = U.el(`<div class="grid grid-attempts" role="list"></div>`);
      for (const a of this.manifest.attempts) {
        const sets = this.manifest.datasets.filter((d) => d.attempt === a.id);
        const card = U.el(`
          <div class="card attempt-card ${a.current ? "current" : ""}" role="listitem">
            <div class="attempt-top">
              <span class="attempt-name">${U.esc(a.label.toUpperCase())}</span>
              ${a.current ? `<span class="badge badge-cur">CURRENT</span>` : `<span class="badge badge-soon">PLANNED</span>`}
            </div>
            <p class="muted">${U.esc(a.tagline)}</p>
            <p class="muted small">${sets.length ? `${sets.length} question sets ready` : "Question sets will appear here once the dataset folder for this attempt is added."}</p>
            ${sets.length ? `<button class="btn btn-primary" data-go="${a.id}">Continue</button>`
              : `<button class="btn" disabled>Not yet loaded</button>`}
          </div>`);
        card.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((b) =>
          b.addEventListener("click", () => {
            this.attemptId = b.getAttribute("data-go")!;
            Store.setAttempt(this.attemptId);
            Router.go("/");
          }));
        wrap.appendChild(card);
      }
      this.root.appendChild(wrap);
      this.foot();
    }

    /* ================= home ================= */
    private viewHome(): void {
      this.root.innerHTML = "";
      const m = this.manifest;
      this.root.appendChild(chrome({
        title: `CA FINAL <span class="hl">${U.esc(this.attemptLabel().toUpperCase())}</span>`,
        sub: "Exam Preparation Portal &#8226; New Scheme &#8226; May 2026 Applicable Syllabus &#8226; 100 Marks &#8226; 3 Hours &#8226; 70 Descriptive + 30 MCQ &#8226; No Negative Marking",
        pill: this.attemptLabel(),
        back: { label: "Change attempt", hash: "attempts" },
      }));
      const note = U.el(`<div class="notice" role="note"><strong>How predictions work:</strong> ${U.esc(m.notice)}</div>`);
      this.root.appendChild(note);

      const resume = this.resumeCard();
      if (resume) this.root.appendChild(resume);

      const heading = U.el(`<h2 class="sec-title">Which paper do you want to study?</h2>`);
      this.root.appendChild(heading);

      const grid = U.el(`<div class="grid grid-papers" role="list"></div>`);
      for (const p of m.papers) {
        const sets = m.datasets.filter((d) => d.attempt === this.attemptId && d.paper === p.id);
        const qs = sets.reduce((t, s) => t + s.count, 0);
        const card = U.el(`
          <div class="card paper-card" role="listitem" tabindex="0" aria-label="Paper ${p.no}, ${U.esc(p.title)}">
            <div class="paper-no">PAPER ${p.no}</div>
            <h3>${U.esc(p.title)}</h3>
            <p class="muted">${p.chapterCount} Chapters &#8226; ${p.modules} Module${p.modules > 1 ? "s" : ""}</p>
            <p class="muted small">${sets.length} datasets &#8226; ${qs} questions</p>
            <div class="mini-prob">${this.probMini(sets)}</div>
            <button class="btn btn-primary">Explore Paper &#8594;</button>
          </div>`);
        const open = () => {
          Store.setSelectedPaper(this.attemptId, p.id);
          Router.go("/paper/" + p.id);
        };
        card.addEventListener("click", open);
        card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
        grid.appendChild(card);
      }
      this.root.appendChild(grid);

      this.root.appendChild(this.resultsStrip());
      this.foot();
    }

    private probMini(sets: DatasetMeta[]): string {
      const h = sets.reduce((t, s) => t + s.high, 0);
      const md = sets.reduce((t, s) => t + s.medium, 0);
      const l = sets.reduce((t, s) => t + s.low, 0);
      const tot = Math.max(1, h + md + l);
      return `<span class="probbar" title="HIGH ${h} &#8226; MEDIUM ${md} &#8226; LOW ${l}" role="img" aria-label="Question probability mix: ${h} high, ${md} medium, ${l} low">
        <i style="width:${(100 * h) / tot}%" class="pb-h"></i><i style="width:${(100 * md) / tot}%" class="pb-m"></i><i style="width:${(100 * l) / tot}%" class="pb-l"></i></span>
        <span class="mini-labels">HIGH ${h} &#8226; MED ${md} &#8226; LOW ${l}</span>`;
    }

    private resumeCard(): HTMLElement | null {
      const prog = Store.getProgress();
      let bestId: string | null = null; let best: DatasetMeta | null = null; let bestAt = 0;
      let sess: ExamSession | null = null;

      for (const [id, p] of Object.entries(prog)) {
        if (p && p.at > bestAt && p.answered < p.total) {
          bestAt = p.at;
          bestId = id;
          const direct = this.manifest.datasets.find((d) => d.id === id);
          if (direct) {
            best = direct;
          } else {
            const chMatch = id.match(/^([a-z0-9-]+)-ch(\d+)$/i);
            if (chMatch) {
              const base = this.manifest.datasets.find((d) => d.id === chMatch[1]);
              if (base) {
                const ch = parseInt(chMatch[2], 10);
                const paper = this.manifest.papers.find((x) => x.id === base.paper);
                const chInfo = paper?.chapters.find((c) => c.no === ch);
                best = {
                  ...base,
                  id,
                  title: `Ch ${ch}: ${chInfo ? chInfo.name : "Chapter " + ch} — MCQ Set`,
                  count: p.total,
                  kind: "chapter",
                };
              }
            }
          }
        }
      }

      if (bestId) {
        const s = Store.getSession(bestId);
        if (s && !s.submitted) sess = s;
      }
      if (!best || !bestId) return null;
      const answered = Store.getProgress()[bestId]?.answered ?? 0;
      const card = U.el(`
        <div class="card resume-card" aria-label="Continue studying">
          <div class="resume-top"><span class="tag tag-amber">CONTINUE STUDYING</span></div>
          <div class="resume-main">
            <div>
              <strong>${U.esc(this.paperInfo(best.paper).title)}</strong><br>
              <span class="muted">${U.esc(best.title)}</span><br>
              <span class="small">${sess ? `Question ${sess.current + 1} / ${sess.total}` : `${answered} of ${best.count} questions touched`}</span>
            </div>
            <button class="btn btn-primary">${sess ? "Resume" : "Continue"}</button>
          </div>
          <div class="bar"><i style="width:${Math.round((100 * (sess ? sess.current + 1 : answered)) / (sess ? sess.total : best.count))}%"></i></div>
        </div>`);
      card.querySelector("button")!.addEventListener("click", () => {
        if (sess) location.href = "./exam.html?d=" + encodeURIComponent(bestId!) + "&mode=" + sess.mode;
        else Router.go("/dataset/" + bestId);
      });
      return card;
    }

    /* ================= paper dashboard ================= */
    private viewPaper(paper: string, subView?: string): void {
      this.root.innerHTML = "";
      const p = this.paperInfo(paper);
      const sets = Loader.datasetsFor(this.manifest, this.attemptId, paper);
      const coreSet = sets.find((s) => s.kind === "core");
      const activeTab = subView === "sets" ? "sets" : subView === "all" ? "all" : "chapters";

      this.root.appendChild(chrome({
        title: `${U.esc(p.title)}<br><span class="hl2">${U.esc(this.attemptLabel())}</span>`,
        sub: `${p.chapterCount} Chapters &#8226; ${p.modules} Modules &#8226; Pattern: 30 MCQ marks + 70 descriptive marks &#8226; no negative marking`,
        back: { label: "Back", hash: "/" },
        pill: paper + " &#8226; " + this.attemptLabel(),
      }));
      this.root.appendChild(this.statsRow(sets, coreSet ? coreSet.mcqCount : 0));

      // View switcher tabs
      const tabsEl = U.el(`
        <div class="view-tabs" role="tablist" aria-label="Study modes">
          <button class="view-tab ${activeTab === "chapters" ? "active" : ""}" role="tab" data-tab="chapters">&#127919; Chapter-Wise MCQs (${p.chapterCount} Chapters)</button>
          <button class="view-tab ${activeTab === "sets" ? "active" : ""}" role="tab" data-tab="sets">&#128196; Full Paper Sets (${sets.length} Sets)</button>
          <button class="view-tab ${activeTab === "all" ? "active" : ""}" role="tab" data-tab="all">&#128203; View All</button>
        </div>`);
      this.root.appendChild(tabsEl);

      // 1. Chapter-Wise MCQ Section
      const chSec = this.chapterSection(p, coreSet);
      this.root.appendChild(chSec);

      // 2. Full Paper Sets Section
      const setsSec = U.el(`<div id="sec-sets"></div>`);
      const groups: { key: string; cls: string; title: string; sub: string }[] = [
        { key: "prediction", cls: "grp-prediction", title: "PREDICTION SETS", sub: "What is likely to be asked — pattern-based, not guaranteed" },
        { key: "mock", cls: "grp-mock", title: "FULL MOCK TESTS", sub: "Exact ICAI pattern: 20 MCQ (30 marks) + 5 descriptive (70 marks) &#8226; 180 minutes" },
        { key: "core", cls: "grp-core", title: "CORE SYLLABUS", sub: "Complete chapter coverage, module by module" },
        { key: "rapid", cls: "grp-rapid", title: "RAPID REVISION", sub: "100-question sprint, short one-liner answers" },
      ];
      for (const g of groups) {
        const list = sets.filter((s) => s.kind === g.key);
        if (!list.length) continue;
        const sec = U.el(`<section class="group ${g.cls}" aria-label="${U.esc(g.title)}"><div class="group-head"><h2>${g.title}</h2><p>${g.sub}</p></div></section>`);
        const grid = U.el(`<div class="grid grid-sets"></div>`);
        for (const s of list) grid.appendChild(this.setCard(s, p));
        sec.appendChild(grid);
        setsSec.appendChild(sec);
      }

      const cov = this.coveragePill(sets, p);
      const covEl = U.el(`<div class="covbar" title="Every chapter is covered by at least one core and one prediction dataset">${cov}</div>`);
      setsSec.appendChild(covEl);
      this.root.appendChild(setsSec);

      // Tab switcher handlers
      const updateTab = (tab: string) => {
        tabsEl.querySelectorAll<HTMLButtonElement>(".view-tab").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-tab") === tab);
        });
        if (tab === "chapters") {
          chSec.style.display = "";
          setsSec.style.display = "none";
        } else if (tab === "sets") {
          chSec.style.display = "none";
          setsSec.style.display = "";
        } else {
          chSec.style.display = "";
          setsSec.style.display = "";
        }
      };
      tabsEl.querySelectorAll<HTMLButtonElement>(".view-tab").forEach((b) => {
        b.addEventListener("click", () => {
          const tab = b.getAttribute("data-tab")!;
          updateTab(tab);
        });
      });
      updateTab(activeTab);

      this.foot();
    }

    private chapterSection(p: PaperInfo, coreSet?: DatasetMeta): HTMLElement {
      const sec = U.el(`
        <section class="group grp-chapter" id="sec-chapters" aria-label="Chapter-wise MCQ preparation">
          <div class="group-head">
            <h2>CHAPTER-WISE MCQ PRACTICE</h2>
            <p>Prepare chapter-wise MCQs instead of the whole paper. Master concepts chapter-by-chapter with instant rationale or timed tests.</p>
          </div>
          <div class="ch-filter-bar">
            <div class="chip-row ch-module-filters" role="group" aria-label="Filter chapters by module">
              <button class="chip on" data-mod="all">All Modules (${p.modules})</button>
              ${Array.from({ length: p.modules }, (_, i) => `<button class="chip" data-mod="${i + 1}">Module ${i + 1}</button>`).join("")}
            </div>
            <input type="search" class="search-input" id="chSearch" placeholder="&#128269; Search chapter name or number..." aria-label="Search chapters" />
          </div>
          <div class="grid grid-chapters" id="gridChapters"></div>
          <div class="card empty" id="noChMatch" style="display:none;margin-top:1rem">No chapters match your filter criteria.</div>
        </section>`);

      const grid = sec.querySelector("#gridChapters")!;
      const noMatch = sec.querySelector<HTMLElement>("#noChMatch")!;
      const baseId = coreSet ? coreSet.id : (p.id.toLowerCase() + "-nov26-core");
      const completedMap = Store.getCompleted();
      const progressMap = Store.getProgress();

      p.chapters.forEach((c) => {
        const chDatasetId = `${baseId}-ch${c.no}`;
        const comp = completedMap[chDatasetId];
        const prog = progressMap[chDatasetId];
        const statusHtml = comp
          ? `<span class="tag tag-done">&#10003; Score ${comp.score}/${comp.max} (${Math.round((100 * comp.score) / comp.max)}%)</span>`
          : prog && prog.answered > 0
            ? `<span class="tag tag-part">&#9889; ${prog.answered}/${prog.total} answered</span>`
            : `<span class="tag tag-soon">Ready</span>`;

        const card = U.el(`
          <div class="card chapter-card" data-ch="${c.no}" data-mod="${c.module}" role="listitem" tabindex="0">
            <div class="ch-top">
              <span class="tag tag-ch">CH ${c.no}</span>
              <span class="badge badge-mod">MODULE ${c.module}</span>
              ${statusHtml}
            </div>
            <h3 class="ch-title">${U.esc(c.name)}</h3>
            <div class="ch-stats"><span class="small muted">Loading MCQs&#8230;</span></div>
            <p class="ch-desc muted small">${U.esc(p.title)} &#8226; Chapter ${c.no}</p>
            <div class="ch-actions">
              <button class="btn btn-primary btn-sm" data-act="practice" title="Untimed with instant explanation & memory tips">&#9889; Practice MCQs</button>
              <button class="btn btn-ghost btn-sm" data-act="exam" title="Timed mock exam with question palette">&#9201; Timed Test</button>
            </div>
          </div>`);

        card.querySelector('[data-act="practice"]')!.addEventListener("click", (e) => {
          e.stopPropagation();
          location.href = `./exam.html?d=${encodeURIComponent(baseId)}&ch=${c.no}&mode=practice`;
        });
        card.querySelector('[data-act="exam"]')!.addEventListener("click", (e) => {
          e.stopPropagation();
          Router.go(`/instructions/${baseId}-ch${c.no}/exam`);
        });
        card.addEventListener("click", () => {
          location.href = `./exam.html?d=${encodeURIComponent(baseId)}&ch=${c.no}&mode=practice`;
        });
        grid.appendChild(card);
      });

      // Filter logic
      const searchBox = sec.querySelector<HTMLInputElement>("#chSearch")!;
      const modChips = sec.querySelectorAll<HTMLButtonElement>(".ch-module-filters .chip");
      let selectedMod = "all";

      const applyFilters = () => {
        const q = searchBox.value.trim().toLowerCase();
        let visibleCount = 0;
        grid.querySelectorAll<HTMLElement>(".chapter-card").forEach((card) => {
          const mod = card.getAttribute("data-mod")!;
          const ch = card.getAttribute("data-ch")!;
          const title = (card.querySelector(".ch-title")?.textContent || "").toLowerCase();
          const desc = (card.querySelector(".ch-desc")?.textContent || "").toLowerCase();
          const modMatch = selectedMod === "all" || mod === selectedMod;
          const searchMatch = !q || title.includes(q) || desc.includes(q) || ch === q || `ch ${ch}`.includes(q);
          const show = modMatch && searchMatch;
          card.style.display = show ? "" : "none";
          if (show) visibleCount++;
        });
        noMatch.style.display = visibleCount === 0 ? "" : "none";
      };

      searchBox.addEventListener("input", applyFilters);
      modChips.forEach((chip) => {
        chip.addEventListener("click", () => {
          modChips.forEach((x) => x.classList.remove("on"));
          chip.classList.add("on");
          selectedMod = chip.getAttribute("data-mod") || "all";
          applyFilters();
        });
      });

      // Populate async MCQ counts & topics from core dataset
      if (coreSet) {
        Loader.loadDataset(this.manifest, coreSet.id).then((coreFile) => {
          const mcqsByCh: Record<number, Mcq[]> = {};
          coreFile.questions.forEach((q) => {
            if (App.isMcq(q)) {
              if (!mcqsByCh[q.ch]) mcqsByCh[q.ch] = [];
              mcqsByCh[q.ch].push(q);
            }
          });
          p.chapters.forEach((c) => {
            const list = mcqsByCh[c.no] || [];
            const cardEl = grid.querySelector(`.chapter-card[data-ch="${c.no}"]`);
            if (cardEl) {
              const high = list.filter((q) => q.prob === "HIGH").length;
              const med = list.filter((q) => q.prob === "MEDIUM").length;
              const low = list.filter((q) => q.prob === "LOW").length;
              const statsEl = cardEl.querySelector(".ch-stats");
              if (statsEl) {
                statsEl.innerHTML = `<span><b>${list.length}</b> MCQs</span><span>${U.probBadge("HIGH")} ${high} &nbsp; ${U.probBadge("MEDIUM")} ${med} &nbsp; ${U.probBadge("LOW")} ${low}</span>`;
              }
              const topics = [...new Set(list.map((q) => q.topic))].slice(0, 3).join(" &#8226; ");
              const descEl = cardEl.querySelector(".ch-desc");
              if (descEl && topics) {
                descEl.innerHTML = U.esc(topics);
              }
            }
          });
        }).catch(() => { /* silent fallback */ });
      }

      return sec;
    }

    private coveragePill(sets: DatasetMeta[], p: PaperInfo): string {
      const core = new Set<number>(); const pred = new Set<number>();
      for (const s of sets) for (const c of s.chapters) (s.kind === "core" ? core : pred).add(c);
      let out = `<span class="cov-label">Chapter coverage</span>`;
      for (let c = 1; c <= p.chapterCount; c++) {
        const both = core.has(c) && pred.has(c);
        out += `<i class="cov-dot ${both ? "on" : ""}" title="Chapter ${c}: core ${core.has(c) ? "✓" : "—"}, prediction ${pred.has(c) ? "✓" : "—"}">${c}</i>`;
      }
      return out;
    }

    private statsRow(sets: DatasetMeta[], mcqCount = 0): HTMLElement {
      const q = sets.reduce((t, s) => t + s.count, 0);
      const n = (k: string) => sets.filter((s) => s.kind === k).length;
      return U.el(`
        <div class="stats" role="group" aria-label="Quick statistics for this paper">
          <div class="stat"><b>${q}</b><span>Total Bank</span></div>
          <div class="stat"><b>${sets.reduce((t, s) => t + s.chapters.length, 0) > 0 ? new Set(sets.flatMap((s) => s.chapters)).size : 0}</b><span>Chapters</span></div>
          <div class="stat"><b>${mcqCount || sets.reduce((t, s) => t + s.mcqCount, 0)}</b><span>Chapter MCQs</span></div>
          <div class="stat"><b>${n("mock")}</b><span>Full Mocks</span></div>
          <div class="stat"><b>${n("prediction") + n("rapid")}</b><span>Revision Sets</span></div>
        </div>`);
    }

    private setCard(s: DatasetMeta, p: PaperInfo): HTMLElement {
      const completed = Store.getCompleted()[s.id];
      const prog = Store.getProgress()[s.id];
      const card = U.el(`
        <div class="card set-card ${s.kind === "mock" ? "mock" : ""} ${s.kind === "core" ? "core" : ""}" role="listitem" tabindex="0"
             aria-label="${U.esc(s.title)}, ${s.count} questions">
          <div class="set-top">${U.kindBadge(s.kind)}
            ${completed ? `<span class="tag tag-done">&#10003; Done</span>` : prog ? `<span class="tag tag-part">${Math.round((100 * prog.answered) / s.count)}% touched</span>` : ""}
          </div>
          <h3>${U.esc(s.title)}</h3>
          <p class="muted desc">${U.esc(s.description)}</p>
          <div class="set-stats">
            <span><b>${s.count}</b> Questions</span>
            <span><b>${s.mcqCount}</b> MCQ &#8226; <b>${s.descriptiveCount}</b> Descriptive</span>
          </div>
          <div class="set-prob">
            ${U.probBadge("HIGH")} ${s.high} &nbsp; ${U.probBadge("MEDIUM")} ${s.medium} &nbsp; ${U.probBadge("LOW")} ${s.low}
          </div>
          <div class="set-foot">
            <span class="small muted">${U.esc(s.coverage)}</span>
            <span class="small muted">&#9201; ${U.dur(s.durationMinutes)} &#8226; ${U.esc(s.difficulty)}</span>
          </div>
          <div class="set-actions">
            <button class="btn btn-primary" data-a="open">${completed || prog ? "Open Set" : "Start Set"}</button>
          </div>
        </div>`);
      const open = () => Router.go("/dataset/" + s.id);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      return card;
    }

    /* ================= dataset detail ================= */
    private viewDataset(id: string): void {
      this.root.innerHTML = "";
      const s = this.manifest.datasets.find((d) => d.id === id);
      if (!s) { this.notFound(id); return; }
      const p = this.paperInfo(s.paper);
      Store.setSelectedDataset(s.paper, id);
      this.root.appendChild(chrome({
        title: `${U.kindBadge(s.kind)} <span class="ds-title">${U.esc(s.title)}</span>`,
        sub: `${U.esc(p.title)} &#8226; ${U.esc(this.attemptLabel())} &#8226; ${U.esc(s.coverage)}`,
        back: { label: p.shortTitle, hash: "paper/" + s.paper },
        pill: this.attemptLabel(),
      }));
      const card = U.el(`
        <div class="card ds-detail">
          <p class="desc">${U.esc(s.description)}</p>
          <div class="ds-grid">
            <div><span class="k">Questions</span><b>${s.count}</b></div>
            <div><span class="k">MCQ</span><b>${s.mcqCount}</b></div>
            <div><span class="k">Descriptive</span><b>${s.descriptiveCount}</b></div>
            <div><span class="k">Difficulty</span><b>${U.esc(s.difficulty)}</b></div>
            <div><span class="k">Est. duration</span><b>${U.dur(s.durationMinutes)}</b></div>
            <div><span class="k">Chapters</span><b>${s.chapters.join(", ")}</b></div>
            <div><span class="k">HIGH</span><b>${U.probBadge("HIGH")} ${s.high}</b></div>
            <div><span class="k">MEDIUM</span><b>${U.probBadge("MEDIUM")} ${s.medium}</b></div>
            <div><span class="k">LOW</span><b>${U.probBadge("LOW")} ${s.low}</b></div>
          </div>
          <div class="ds-actions">
            <button class="btn btn-primary" data-a="exam">${s.kind === "mock" ? "Instructions & Start Mock" : "Exam Mode (Timed)"}</button>
            <button class="btn btn-ghost" data-a="practice">Practice Mode (no timer, instant feedback)</button>
          </div>
        </div>`);
      const sess = Store.getSession(id);
      if (sess && !sess.submitted) {
        const rc = U.el(`<div class="card resume-inline">
          <div><strong>Unfinished session found.</strong><br><span class="small muted">Question ${sess.current + 1} / ${sess.total} &#8226; ${Object.keys(sess.answers).length} answered${sess.deadline ? " &#8226; timer still running" : ""}</span></div>
          <div class="row"><button class="btn" data-a="resume">Resume</button><button class="btn btn-danger-ghost" data-a="abandon">Restart set</button></div>
        </div>`);
        rc.querySelector('[data-a="resume"]')!.addEventListener("click", () => {
          location.href = "./exam.html?d=" + encodeURIComponent(id) + "&mode=" + sess.mode;
        });
        rc.querySelector('[data-a="abandon"]')!.addEventListener("click", () => {
          Store.deleteDatasetState(id);
          this.viewDataset(id);
        });
        this.root.appendChild(rc);
      }
      card.querySelector('[data-a="exam"]')!.addEventListener("click", () => Router.go("/instructions/" + id + "/exam"));
      card.querySelector('[data-a="practice"]')!.addEventListener("click", () => Router.go("/instructions/" + id + "/practice"));
      this.root.appendChild(card);
      this.foot();
    }

    /* ================= instructions ================= */
    private viewInstructions(id: string, mode: string): void {
      this.root.innerHTML = "";
      let s = this.manifest.datasets.find((d) => d.id === id);
      const chMatch = id.match(/^([a-z0-9-]+)-ch(\d+)$/i);
      let chNum: number | null = null;
      if (!s && chMatch) {
        const base = this.manifest.datasets.find((d) => d.id === chMatch[1]);
        if (base) {
          chNum = parseInt(chMatch[2], 10);
          const p = this.paperInfo(base.paper);
          const chInfo = p.chapters.find((c) => c.no === chNum);
          s = {
            ...base,
            id,
            title: `Chapter ${chNum}: ${chInfo ? chInfo.name : "Chapter " + chNum} — MCQ Set`,
            description: `Chapter ${chNum} MCQ preparation set for ${p.title}.`,
            coverage: `Chapter ${chNum}`,
            chapters: [chNum],
            kind: "chapter",
            descriptiveCount: 0,
            durationMinutes: 45,
          };
        }
      }
      if (!s) { this.notFound(id); return; }
      const p = this.paperInfo(s.paper);
      const timed = mode === "exam";
      const mock = s.kind === "mock";
      const isChapter = s.kind === "chapter";
      const title = mock ? "FULL MOCK TEST" : isChapter ? (timed ? "TIMED CHAPTER TEST" : "CHAPTER MCQ PRACTICE") : timed ? "TIMED ATTEMPT" : "PRACTICE MODE";
      const backHash = isChapter ? "paper/" + s.paper : "dataset/" + id;
      const backLabel = isChapter ? "Back to Chapters" : "Back to set";
      this.root.appendChild(chrome({
        title: `${U.esc(title)}`,
        sub: `${U.esc(p.title)} &#8226; ${U.esc(this.attemptLabel())} &#8226; ${U.esc(s.title)}`,
        back: { label: backLabel, hash: backHash },
        pill: this.attemptLabel(),
      }));
      const specs: [string, string][] = mock
        ? [["Duration", "180 minutes"], ["Maximum Marks", "100"], ["MCQs", "30 marks (20 Qs: 10 &#215; 1 + 10 &#215; 2)"], ["Descriptive", "70 marks (5 Qs &#215; 14)"], ["Negative Marking", "None"]]
        : isChapter
          ? [["Duration", timed ? "1.5 min per MCQ" : "Untimed (self-paced)"], ["Questions", "Chapter MCQs only (No descriptive)"], ["Feedback", timed ? "Scorecard & review at end" : "Instant after every question"], ["Timer", timed ? "Countdown with alerts" : "Off by default"], ["Negative Marking", "None"]]
          : timed
            ? [["Duration", s.durationMinutes + " minutes"], ["Total Marks", String(s.mcqCount + s.descriptiveCount ? s.count : 0)], ["Questions", `${s.mcqCount} MCQ &#8226; ${s.descriptiveCount} descriptive`], ["Timer", "Counts down; survives refresh"], ["Negative Marking", "None"]]
            : [["Duration", "Untimed (self-paced)"], ["Questions", `${s.mcqCount} MCQ &#8226; ${s.descriptiveCount} descriptive`], ["Feedback", "Shown immediately per question"], ["Timer", "Optional — off by default"], ["Negative Marking", "None"]];
      const spec = U.el(`<div class="card spec-card"><h2 class="spec-title">${U.esc(s.kind === "mock" ? "MOCK SPECIFICATIONS" : isChapter ? "CHAPTER TEST DETAILS" : "SET DETAILS")}</h2><div class="spec-grid">
        ${specs.map(([k, val]) => `<div><span>${k}</span><b>${val}</b></div>`).join("")}
      </div></div>`);
      this.root.appendChild(spec);

      const instr = U.el(`
        <div class="card instr-card">
          <h2>Instructions</h2>
          <ul class="instr">
            <li>Read each question carefully.</li>
            <li>MCQs have exactly one correct answer.</li>
            <li>There is <b>no negative marking</b> — attempt everything you are unsure about; there is no penalty for guessing.</li>
            ${isChapter ? "<li>Each question includes an explanation and Memory Anchor to help you retain key provisions.</li>" : "<li>Descriptive answers are evaluated against the expected ICAI points and marks scheme shown in the result review.</li>"}
            ${timed ? "<li>The timer starts when you click Start and keeps running across refreshes — close and reopen is safe, time is <b>not</b> reset.</li>" : "<li>Practice mode has no running timer; your answers are still saved locally.</li>"}
            <li>Your progress is stored locally in this browser (no account, no server).</li>
            <li>Use <b>Mark for Review</b> to flag questions and return to them from the palette.</li>
          </ul>
          ${mock ? `<p class="predict-note">Predictions embedded in this set are pattern-based study guidance for ${U.esc(this.attemptLabel())} — they are not ICAI questions and no question is guaranteed to appear.</p>` : ""}
          <div class="instr-actions">
            <button class="btn btn-start" id="startBtn">${timed ? "START EXAM &#9654;" : "START PRACTICE &#9654;"}</button>
          </div>
        </div>`);
      instr.querySelector("#startBtn")!.addEventListener("click", () => this.start(s, timed ? "exam" : "practice"));
      this.root.appendChild(instr);
      this.foot();
    }

    private start(s: DatasetMeta, mode: "exam" | "practice"): void {
      const now = Date.now();
      const sess: ExamSession = {
        datasetId: s.id, paper: s.paper, attempt: s.attempt, mode,
        startedAt: now,
        deadline: mode === "exam" ? now + s.durationMinutes * 60_000 : null,
        answers: {}, marks: {}, marked: [], current: 0, total: s.count, warned: {},
      };
      Store.saveSession(sess);
      location.href = "./exam.html?d=" + encodeURIComponent(s.id) + "&mode=" + mode;
    }

    /* ================= results ================= */
    private viewResults(): void {
      this.root.innerHTML = "";
      this.root.appendChild(chrome({
        title: "RESULT HISTORY", sub: "Stored locally on this device",
        back: { label: "Back", hash: "/" },
      }));
      const list = Store.getResults();
      if (!list.length) {
        this.root.appendChild(U.el(`<div class="card empty">No attempts recorded yet. Complete a set and your scorecard will appear here.</div>`));
      } else {
        const grid = U.el(`<div class="grid grid-results"></div>`);
        for (const r of list) {
          grid.appendChild(U.el(`
            <a class="card result-row" href="#/result/${r.key}">
              <div><strong>${U.esc(r.title)}</strong><br><span class="small muted">${U.esc(this.paperInfo(r.paper).shortTitle)} &#8226; ${U.date(r.submittedAt)} &#8226; ${r.mode}</span></div>
              <div class="rr-score">${r.maxScore ? Math.round((100 * r.score) / r.maxScore) : 0}%<span>${r.score}/${r.maxScore}</span></div>
            </a>`));
        }
        this.root.appendChild(grid);
      }
      this.foot();
    }

    private viewResultDetail(key: string): void {
      this.root.innerHTML = "";
      const r = Store.getResult(key);
      if (!r) {
        this.root.appendChild(chrome({ title: "Result not found", back: { label: "Back", hash: "results" } }));
        return;
      }
      const chMatch = r.datasetId.match(/^([a-z0-9-]+)-ch(\d+)$/i);
      const meta = this.manifest.datasets.find((d) => d.id === r.datasetId);
      this.root.appendChild(chrome({
        title: "EXAM COMPLETED",
        sub: `${U.esc(this.paperInfo(r.paper).title)} &#8226; ${U.esc(r.title)} &#8226; ${U.esc(r.attempt.replace("-", " "))}`,
        back: { label: chMatch ? "Back to Chapters" : "History", hash: chMatch ? `paper/${r.paper}` : "results" },
      }));
      this.root.appendChild(U.el(`
        <div class="card score-hero">
          <div class="score-big">${r.score}<span> / ${r.maxScore}</span></div>
          <div class="score-side">
            <div><b>${r.accuracy}%</b><span>Accuracy</span></div>
            <div><b>${r.attempted}/${r.totalQuestions}</b><span>Attempted</span></div>
            <div><b>${r.correct}</b><span>Correct</span></div>
            <div><b>${r.incorrect}</b><span>Incorrect</span></div>
            <div><b>${r.unattempted}</b><span>Unattempted</span></div>
          </div>
          <div class="score-time">${U.mmss(r.usedSeconds)} elapsed &#8226; ${U.date(r.submittedAt)}</div>
          <div class="row" style="margin-top:.7rem">
            ${meta ? `<a class="btn btn-ghost" href="#/dataset/${meta.id}">Revisit set</a>` : chMatch ? `<a class="btn btn-ghost" href="./exam.html?d=${encodeURIComponent(r.datasetId)}&mode=${r.mode}">Retake Chapter</a>` : ""}
            <a class="btn btn-primary" href="#/paper/${r.paper}">Paper Dashboard</a>
          </div>
        </div>`));
      const anchor = U.el(`<div id="review-anchor"></div>`);
      this.root.appendChild(anchor);
      Results.renderReview({ manifest: this.manifest, root: this.root, go: Router.go }, r, this.paperInfo(r.paper));
      this.foot();
    }

    private notFound(id: string): void {
      this.root.appendChild(U.el(`
        <div class="card error-card" role="alert">
          <h2>Dataset not available</h2>
          <p class="muted">The dataset <code>${U.esc(id)}</code> is not present in the manifest (<code>data/datasets.json</code>).</p>
          <a class="btn btn-primary" href="#/">Back to Home</a>
        </div>`));
    }

    private resultsStrip(): HTMLElement {
      const list = Store.getResults().slice(0, 3);
      if (!list.length) return U.el(`<div></div>`);
      const el = U.el(`<section class="home-sec"><div class="group-head"><h2>RECENT RESULTS</h2><a class="small" href="#/results">View all &#8594;</a></div><div class="grid grid-results"></div></section>`);
      const grid = el.querySelector(".grid")!;
      for (const r of list) {
        grid.appendChild(U.el(`
          <a class="card result-row" href="#/result/${r.key}">
            <div><strong>${U.esc(r.title)}</strong><br><span class="small muted">${U.esc(r.paper)} &#8226; ${U.date(r.submittedAt)}</span></div>
            <div class="rr-score">${r.maxScore ? Math.round((100 * r.score) / r.maxScore) : 0}%<span>${r.score}/${r.maxScore}</span></div>
          </a>`));
      }
      return el;
    }

    private foot(): void {
      this.root.appendChild(U.el(`
        <footer class="foot">
          <p>Static portal &#8226; all data local to this browser &#8226; works offline once loaded from GitHub Pages.</p>
          <p class="small muted">Content generated for study purposes against the ICAI New Scheme syllabus applicable for May 2026 onwards (Papers 1&#8211;3). “Trend / probability” fields are pattern-based study guidance, not ICAI statements — nothing is guaranteed to appear.</p>
        </footer>`));
    }
  }
}
