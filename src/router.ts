/* Hash router for index.html (portal shell) + shared view chrome. */
namespace App {
  export const Router = {
    parse(): { name: string; arg?: string; arg2?: string } {
      const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
      const seg = h.split("/").filter(Boolean);
      if (!seg.length) return { name: "home" };
      return { name: seg[0], arg: seg[1], arg2: seg[2] };
    },
    go(hash: string): void {
      if (("#" + hash) === location.hash) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        location.hash = hash;
      }
    },
  };

  export interface View {
    manifest: Manifest;
    root: HTMLElement;
    go: (hash: string) => void;
  }

  export function chrome(opts: {
    title: string;
    sub?: string;
    back?: { label: string; hash: string } | null;
    pill?: string;
  }): HTMLElement {
    const back = opts.back
      ? `<a class="backlink" href="#${opts.back.hash}" aria-label="${U.esc(opts.back.label)}">&#8592; ${U.esc(opts.back.label)}</a>`
      : "";
    const pill = opts.pill
      ? `<span class="attempt-pill" title="Active attempt">&#128197; ${U.esc(opts.pill)}</span>`
      : "";
    return U.el(`
      <div class="page-head">
        ${back}
        <div class="page-head-main">
          <h1>${opts.title}</h1>
          ${opts.sub ? `<p class="sub">${opts.sub}</p>` : ""}
        </div>
        ${pill}
      </div>`);
  }
}
