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
        const home = new Home(manifest, root);
        if (!Store.getAttempt()) {
          const cur = manifest.attempts.find((a) => a.current);
          if (cur) Store.setAttempt(cur.id);
        }
        home.render();
        window.addEventListener("hashchange", () => home.render());
        document.getElementById("boot")!.style.display = "none";
      })
      .catch((err) => {
        root.innerHTML = "";
        root.appendChild(U.el(`
          <div class="card error-card" role="alert">
            <h2>Unable to load the dataset manifest.</h2>
            <p class="muted">Expected <code>./data/datasets.json</code> (or its <code>.js</code> mirror) next to index.html.
            Run <code>npm run datasets &amp;&amp; npm run mirror</code>, then refresh.</p>
            <button class="btn btn-primary" onclick="location.reload()">Retry</button>
          </div>`));
        document.getElementById("boot")!.style.display = "none";
      });
  });
}
