// herowx-embed.js — Widget embed per HeroWX Cloud (PROTOTIPO 2026-09-11)
//
// Due modalita' (attributo data-mode):
//   "scanner"  -> box "Scansiona il tuo sito": input URL + avvio + risultati
//   "sigillo"  -> badge con esito dell'ultima scansione del sito (data-site-id)
//
// Uso (Wix: Aggiungi > Embed > Inserisci codice; WordPress: blocco HTML personalizzato):
//
//   <div data-herowx-embed
//        data-mode="scanner"
//        data-base-url="https://herowx-cloud.smartincrelations.workers.dev"
//        data-token="WIDGET_TOKEN"></div>
//   <script src="https://<CDN>/herowx-embed.js" defer></script>
//
// SICUREZZA (da risolvere prima del go-live, vedi EMBED-DESIGN.md):
//   - data-token e' leggibile da chiunque -> serve un "widget token" con
//     sola lettura/attivazione scansione (non l'API_TOKEN admin)
//   - il worker deve esporre CORS controllato per l'origine dell'embed
(function () {
  "use strict";

  var DEFAULT_BASE = "https://herowx-cloud.smartincrelations.workers.dev";

  function readConfig(el) {
    return {
      mode: el.getAttribute("data-mode") || "scanner",
      baseUrl: (el.getAttribute("data-base-url") || DEFAULT_BASE).replace(/\/$/, ""),
      token: el.getAttribute("data-token") || "",
      siteId: el.getAttribute("data-site-id") || "",
      label: el.getAttribute("data-label") || "Scansiona il tuo sito"
    };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var CSS = [
    ".hw-wrap{font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a2e;max-width:420px}",
    ".hw-card{border:1px solid #e4e4ef;border-radius:14px;padding:18px;background:#fff;box-shadow:0 4px 18px rgba(20,20,60,.07)}",
    ".hw-title{margin:0 0 12px;font-size:16px;font-weight:700}",
    ".hw-row{display:flex;gap:8px}",
    ".hw-input{flex:1;border:1px solid #d5d5e6;border-radius:9px;padding:9px 11px;font-size:14px}",
    ".hw-btn{border:0;border-radius:9px;padding:9px 14px;font-weight:600;cursor:pointer;background:#5b5bd6;color:#fff}",
    ".hw-btn[disabled]{opacity:.55;cursor:default}",
    ".hw-status{margin-top:10px;font-size:13px;color:#55557a}",
    ".hw-err{color:#c0392b}",
    ".hw-ok{color:#1e8e5a}",
    ".hw-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}",
    ".hw-kpi{border:1px solid #ececf6;border-radius:10px;padding:10px;text-align:center}",
    ".hw-kpi b{display:block;font-size:20px}",
    ".hw-kpi span{font-size:12px;color:#77779a}",
    ".hw-sig{display:inline-flex;align-items:center;gap:8px;border:1px solid #e4e4ef;border-radius:999px;padding:8px 14px;background:#fff;font-size:13px}",
    ".hw-dot{width:10px;height:10px;border-radius:50%}",
    ".hw-dot.ok{background:#1e8e5a}.hw-dot.ko{background:#c0392b}.hw-dot.wait{background:#e6a23c}"
  ].join("");

  function mount(el, cfg) {
    var root = el.attachShadow ? el.attachShadow({ mode: "open" }) : el;
    var style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);

    if (cfg.mode === "sigillo") return mountSigillo(root, cfg);
    return mountScanner(root, cfg);
  }

  function mountScanner(root, cfg) {
    var wrap = document.createElement("div");
    wrap.className = "hw-wrap";
    wrap.innerHTML =
      '<div class="hw-card">' +
      '<p class="hw-title">' + esc(cfg.label) + "</p>" +
      '<div class="hw-row">' +
      '<input class="hw-input" type="url" placeholder="https://iltuosito.it" aria-label="URL sito">' +
      '<button class="hw-btn" type="button">Avvia</button>' +
      "</div>" +
      '<div class="hw-status" aria-live="polite"></div>' +
      '<div class="hw-results"></div>' +
      "</div>";
    root.appendChild(wrap);

    var input = wrap.querySelector(".hw-input");
    var btn = wrap.querySelector(".hw-btn");
    var status = wrap.querySelector(".hw-status");
    var results = wrap.querySelector(".hw-results");

    function setStatus(msg, cls) {
      status.className = "hw-status " + (cls || "");
      status.textContent = msg;
    }

    function api(path, opts) {
      opts = opts || {};
      opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
      // Widget token con permessi minimi (MAI l'API_TOKEN admin nel browser)
      if (cfg.token) opts.headers["X-HeroWX-Widget"] = cfg.token;
      return fetch(cfg.baseUrl + path, opts).then(function (r) {
        return r.json().catch(function () { return null; });
      });
    }

    function poll(scanId, attempt) {
      if (attempt > 60) { setStatus("Timeout: la scansione richiede troppo tempo.", "hw-err"); btn.disabled = false; return; }
      setStatus("Scansione in corso… (" + attempt + ")");
      api("/api/widget/scans/" + scanId).then(function (d) {
        if (!d) { setStatus("Risposta non valida.", "hw-err"); btn.disabled = false; return; }
        if (d.status === "done") return render(d);
        if (d.status === "error") { setStatus("Errore scansione: " + (d.error || "sconosciuto"), "hw-err"); btn.disabled = false; return; }
        setTimeout(function () { poll(scanId, attempt + 1); }, 3000);
      }).catch(function () {
        setStatus("Errore di rete.", "hw-err"); btn.disabled = false;
      });
    }

    function render(d) {
      btn.disabled = false;
      var c = d.counts || {};
      var servizi = d.servicesCount != null ? d.servicesCount : 0;
      setStatus("Scansione completata.", "hw-ok");
      results.innerHTML =
        '<div class="hw-grid">' +
        kpi(c.cookies, "Cookie rilevati") +
        kpi(c.scripts != null ? c.scripts : c.resources, "Script/risorse") +
        kpi(servizi, "Servizi terze parti") +
        kpi(c.thirdParty, "Richieste esterne") +
        "</div>";
    }

    function kpi(n, label) {
      return '<div class="hw-kpi"><b>' + esc(n != null ? n : "–") + "</b><span>" + esc(label) + "</span></div>";
    }

    btn.addEventListener("click", function () {
      var url = (input.value || "").trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      try { new URL(url); } catch (e) { setStatus("Inserisci un URL valido.", "hw-err"); return; }
      btn.disabled = true;
      results.innerHTML = "";
      setStatus("Avvio scansione…");
      api("/api/widget/scans", {
        method: "POST",
        body: JSON.stringify({ url: url })
      }).then(function (d) {
        if (d && d.ok && d.scanId) poll(d.scanId, 1);
        else if (d && d.error === "rate_limit") { setStatus("Troppe scansioni da questo IP: riprova tra un'ora.", "hw-err"); btn.disabled = false; }
        else { setStatus("Avvio fallito: " + ((d && d.error) || "risposta non valida"), "hw-err"); btn.disabled = false; }
      }).catch(function () {
        setStatus("Errore di rete all'avvio.", "hw-err"); btn.disabled = false;
      });
    });
  }

  function mountSigillo(root, cfg) {
    var el = document.createElement("span");
    el.className = "hw-sig";
    el.innerHTML = '<span class="hw-dot wait"></span><span>HeroWX: verifica…</span>';
    root.appendChild(el);

    if (!cfg.siteId) {
      el.innerHTML = '<span class="hw-dot ko"></span><span>HeroWX: configura data-site-id</span>';
      return;
    }

    fetch(cfg.baseUrl + "/api/sites/" + encodeURIComponent(cfg.siteId) + "/last-scan")
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (d && d.ok && d.status === "done") {
          el.innerHTML = '<span class="hw-dot ok"></span><span>Sito verificato HeroWX · ' +
            esc((d.counts && (d.counts.cookies + " cookie")) || "scan ok") + "</span>";
        } else {
          el.innerHTML = '<span class="hw-dot ko"></span><span>HeroWX: scansione non disponibile</span>';
        }
      })
      .catch(function () {
        el.innerHTML = '<span class="hw-dot ko"></span><span>HeroWX: offline</span>';
      });
  }

  function boot() {
    var nodes = document.querySelectorAll("[data-herowx-embed]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].__herowxMounted) continue;
      nodes[i].__herowxMounted = true;
      mount(nodes[i], readConfig(nodes[i]));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
