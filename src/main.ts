/* Bootstrap: index.html → portal router; exam.html → exam engine. */
namespace App {
  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.getAttribute("data-page");
    if (page === "exam") {
      examMain();
      return;
    }
    const root = document.getElementById("view")!;
    Loader.fetchManifest()
      .then((manifest) => {
        document.getElementById("boot")?.remove();
        const home = new Home(manifest, root);
        if (!Store.getAttempt()) {
          const cur = manifest.attempts.find((a) => a.current);
          if (cur) Store.setAttempt(cur.id);
        }
        home.render();
        window.addEventListener("hashchange", () => home.render());
      })
      .catch((err) => {
        document.getElementById("boot")?.remove();
        root.innerHTML = "";
        const msg = err instanceof Error ? err.message : String(err);
        root.appendChild(U.el(`
          <div class="card error-card" role="alert">
            <h2>Unable to load the dataset manifest.</h2>
            <p class="muted">Expected <code>./data/datasets.json</code> (or its <code>.js</code> mirror) next to index.html.
            Run <code>npm run datasets &amp;&amp; npm run mirror</code>, then refresh.</p>
            <p class="muted small">Technical details: <code>${U.esc(msg)}</code></p>
            <button class="btn btn-primary" onclick="location.reload()">Retry</button>
          </div>`));
      });
  });
}
