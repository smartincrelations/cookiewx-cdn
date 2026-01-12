/* =========================================================
 * CookieWX Loader v2.2 (Wix-ready)
 * - Legge consenso da: cookiewxConsenso
 * - Legge regole da:   cookiewxRegole
 * - Trigger update:    cookiewxTick (polling + storage)
 * - Blocca SCRIPT/IFRAME 3rd-party finché non c'è consenso
 * - Usa categorie da DB quando disponibili
 * ========================================================= */

(function () {
  if (window.__COOKIEWX_LOADER__) return;
  window.__COOKIEWX_LOADER__ = true;

  // ---------- CONFIG ----------
  var DEBUG = true;

  var KEYS = {
    CONSENSO: "cookiewxConsenso",
    REGOLE:   "cookiewxRegole",
    TICK:     "cookiewxTick"
  };
  
  var CWX_FAVICONS = [];

function captureFavicons() {
  try {
    document.querySelectorAll('link[rel~="icon"]').forEach(function (el) {
      CWX_FAVICONS.push({
        rel: el.getAttribute("rel"),
        href: el.getAttribute("href"),
        type: el.getAttribute("type")
      });
    });
  } catch (_) {}
}
  
  function restoreFavicons() {
  try {
    if (!CWX_FAVICONS.length) return;

    document.querySelectorAll('link[rel~="icon"]').forEach(function (el) {
      el.remove();
    });

    CWX_FAVICONS.forEach(function (f) {
      var link = document.createElement("link");
      link.rel = f.rel;
      link.href = f.href;
      if (f.type) link.type = f.type;
      document.head.appendChild(link);
    });
  } catch (_) {}
}
  captureFavicons();

// ---------- TICK RELOAD ----------
function kickReload() {
  try {
    localStorage.setItem(KEYS.TICK, String(Date.now()));
  } catch (_) {}
}
  
  // =====================
// UI: COOKIEWX BANNER
// =====================

  var CWX_BANNER_HTML = `
<div id="cookiewx-banner" style="
  position:fixed;
  bottom:0;
  left:0;
  width:100%;
  z-index:999999;
  background:#fff;
  box-shadow:0 -4px 12px rgba(0,0,0,.15);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
">
  <div style="max-width:1200px;margin:0 auto;padding:20px;display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between;">
    <div style="flex:1;min-width:260px;">
      <strong>Gestione cookie e privacy policy</strong><br>
      <span style="font-size:14px;color:#444">
        Utilizziamo cookie essenziali per il funzionamento del sito. Per tutti gli altri puoi accettare,
        rifiutare o personalizzare le tue preferenze.
      </span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button data-cwx="accept">Accetta tutto</button>
      <button data-cwx="reject">Rifiuta</button>
      <button data-cwx="prefs">Gestisci preferenze</button>
    </div>
  </div>
</div>
`;

  function showBanner() {
  if (document.getElementById("cookiewx-banner")) return;
  var wrap = document.createElement("div");
  wrap.innerHTML = CWX_BANNER_HTML;
  document.body.appendChild(wrap.firstElementChild);
  bindBannerEvents();
}

function hideBanner() {
  var el = document.getElementById("cookiewx-banner");
  if (el) el.remove();
}

function saveConsent(preferenze, tipo) {
  try {
    var payload = {
      accettato: true,
      preferenze: preferenze,
      tipoConsenso: tipo,
      dataConsenso: new Date().toISOString()
    };

    // 1️⃣ Salva LOCALMENTE (UX immediata)
    localStorage.setItem(KEYS.CONSENSO, JSON.stringify(payload));
    localStorage.setItem(KEYS.TICK, String(Date.now()));

    // 2️⃣ Invia a CookieWX backend (best effort)
    sendConsentToBackend(payload);

    log("💾 CookieWX: consenso salvato", payload);
  } catch (e) {
    log("❌ CookieWX: errore salvataggio consenso", e);
  }
}

  function sendConsentToBackend(payload) {
  try {
    fetch("https://www.cookiewx.com/_functions/consenso", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dominio: location.hostname,
        consenso: payload,
        userAgent: navigator.userAgent,
        referrer: document.referrer || null
      })
    }).catch(function () {
      // silenzioso: il loader non deve MAI rompersi
    });
  } catch (_) {}
}
  
  function bindBannerEvents() {
  var root = document.getElementById("cookiewx-banner");
  if (!root) return;

  root.querySelector('[data-cwx="accept"]').onclick = function () {
    saveConsent({ essenziali:true, funzionali:true, statistici:true, marketing:true }, "totale");
    hideBanner();
    kickReload();
  };

  root.querySelector('[data-cwx="reject"]').onclick = function () {
    saveConsent({ essenziali:true, funzionali:false, statistici:false, marketing:false }, "rifiutato");
    hideBanner();
    kickReload();
  };

  root.querySelector('[data-cwx="prefs"]').onclick = function () {
    hideBanner();
    showPreferences(); // lo faremo dopo
  };
}

  

  // ---------- SAFE LOG ----------
  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, arguments); } catch (_) {}
  }

  // ---------- ALWAYS ALLOW (Wix + same-site) ----------
  function isAlwaysAllowed(url) {
  try {
    var u = new URL(url, location.href);
    var host = u.hostname.replace(/^www\./, "");
    var site = location.hostname.replace(/^www\./, "");

    var allow = [
      site,

      // CookieWX
      "cookiewx-cdn.pages.dev",
      "pages.dev",

      // Wix core
      "wix.com",
      "wixstatic.com",
      "wixsite.com",
      "wixmp.com",
      "wixdns.net",
      "parastorage.com",
      "static.parastorage.com",
    ];

    return allow.some(function (d) {
      return host === d || host.endsWith("." + d);
    });
  } catch (e) {
    // fail-safe: se non riesco a parsare, NON blocco
    return true;
  }
}

  function shouldBlockUrl(url) {
    if (!url) return false;
    if (isAlwaysAllowed(url)) return false;
    return true; // di base blocchiamo tutto ciò che è 3rd-party (non Wix e non stesso dominio)
  }

  // ---------- STATE ----------
  window.CookieWX = window.CookieWX || {
    version: "2.1.0",
    consent: { funzionali: false, statistici: false, marketing: false },
    regole: { cookies: [], scripts: [], iframes: [] }
  };

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

function readConsentFromStorage() {
  // 1) prova key diretta
  var raw = localStorage.getItem(KEYS.CONSENSO);

  // 2) fallback Wix platform_app_*
  if (!raw) {
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf("platform_app_") !== 0) return;

        var box = safeJsonParse(localStorage.getItem(k) || "{}", {});
        if (box && typeof box[KEYS.CONSENSO] === "string") {
          raw = box[KEYS.CONSENSO];
        }
      });
    } catch (_) {}
  }

  if (!raw) return null;

  // 3) parse reale consenso
  var obj = safeJsonParse(raw, null);
  if (!obj || !obj.preferenze) return null;

  return {
    funzionali: !!obj.preferenze.funzionali,
    statistici: !!obj.preferenze.statistici,
    marketing:  !!obj.preferenze.marketing
  };
}

  function readLocalCompat(key) {
  // 1) prova key diretta
  var direct = localStorage.getItem(key);
  if (direct != null) return direct;

  // 2) fallback Wix: platform_app_*
  try {
    var keys = Object.keys(localStorage);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf("platform_app_") !== 0) continue;

      var box = safeJsonParse(localStorage.getItem(k) || "{}", {});
      // Wix salva le tue key come proprietà dentro questo JSON
      if (box && typeof box[key] === "string") return box[key];
    }
  } catch (_) {}

  return null;
}
  
  function readRegoleFromStorage() {
    var raw = readLocalCompat(KEYS.REGOLE);
    if (!raw) return { cookies: [], scripts: [], iframes: [] };

    var r = safeJsonParse(raw, {});
return {
  version: r.version || "0",
  cookies: Array.isArray(r.cookies) ? r.cookies : [],
  scripts: Array.isArray(r.scripts) ? r.scripts : [],
  iframes: Array.isArray(r.iframes) ? r.iframes : []
};
  }

function hasConsentFor(category) {
  category = String(category || "").toLowerCase();

  // ✅ essenziali sempre ammessi
  if (category === "essenziali" || category === "essential" || category === "necessary") return true;

  var c = (window.CookieWX && window.CookieWX.consent) ? window.CookieWX.consent : {};
  if (category === "funzionali") return !!c.funzionali;
  if (category === "statistici") return !!c.statistici;
  if (category === "marketing")  return !!c.marketing;
  return false;
}

  // ---------- FALLBACK CATEGORIZATION (se DB non matcha) ----------
  function categorizeUrlFallback(url) {
    try {
      var u = new URL(url, location.href);
      var h = u.hostname.replace(/^www\./, "");

      if (
        h.endsWith("facebook.com") ||
        h.endsWith("facebook.net") ||
        h.endsWith("instagram.com") ||
        h.endsWith("doubleclick.net") ||
        h.endsWith("googlesyndication.com") ||
        h.endsWith("googleadservices.com") ||
        h.endsWith("tiktok.com") ||
        h.endsWith("tiktokcdn.com")
      ) return "marketing";

      if (
        h.endsWith("google-analytics.com") ||
        h.endsWith("analytics.google.com") ||
        h.endsWith("googletagmanager.com") ||
        h.endsWith("hotjar.com") ||
        h.endsWith("clarity.ms") ||
        h.endsWith("segment.com")
      ) return "statistici";

      if (
        h.endsWith("youtube.com") ||
        h.endsWith("youtube-nocookie.com") ||
        h.endsWith("ytimg.com") ||
        h.endsWith("google.com") ||
        h.endsWith("gstatic.com")
      ) return "marketing";

      return "funzionali";
    } catch (e) {
      return "funzionali";
    }
  }

  // ---------- DB RULE MATCH (scripts/iframes) ----------
  function normalizeUrl(u) {
    return String(u || "").trim();
  }

  function categoryFromDbRule(list, url) {
    url = normalizeUrl(url);
    if (!url) return null;
    if (!Array.isArray(list)) return null;

    // regola può essere:
    // { src: "xxx", categoria:"marketing" } oppure { url:"xxx", categoria:"..." } oppure string
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var needle = "";

      if (typeof r === "string") {
        needle = r;
      } else if (r && typeof r === "object") {
        needle = r.src || r.url || "";
      }

      needle = normalizeUrl(needle);
      if (!needle) continue;

      // match “contains”
      if (url.indexOf(needle) !== -1) {
        var cat = (r && typeof r === "object" && r.categoria) ? r.categoria : null;
        return cat || null;
      }
    }
    return null;
  }

  function getCategoryForScript(url) {
    var catDb = categoryFromDbRule(window.CookieWX.regole.scripts, url);
    return catDb || categorizeUrlFallback(url);
  }

function getCategoryForIframe(url) {
  var catDb = categoryFromDbRule(window.CookieWX.regole.iframes, url);

  // ⛔ filesusr.com NON è sempre ammesso
  // se non ho una regola DB, lo considero marketing
  try {
    var u = new URL(url, location.href);
    var h = u.hostname.replace(/^www\./, "");
    if (h.endsWith("filesusr.com")) {
      return catDb || "marketing";
    }
  } catch (_) {}

  return catDb || categorizeUrlFallback(url);
}

  // ---------- QUEUE ----------
  var Q = { scripts: [], iframes: [] };

  function blockScript(el, src, category) {
    el.setAttribute("data-cwx-blocked", "1");
    el.setAttribute("data-cwx-category", category);
    el.setAttribute("data-cwx-src", src);

    el.removeAttribute("src");
    try { el.type = "text/plain"; } catch (_) {}

    Q.scripts.push(el);
    log("🧱 CookieWX blocca SCRIPT:", category, src);
  }

  function blockIframe(el, src, category) {
    el.setAttribute("data-cwx-blocked", "1");
    el.setAttribute("data-cwx-category", category);
    el.setAttribute("data-cwx-src", src);

    el.removeAttribute("src");
    Q.iframes.push(el);
    log("🧱 CookieWX blocca IFRAME:", category, src);
  }

  function handleScriptElement(el) {
    if (!el || el.getAttribute("data-cwx-checked")) return;
    el.setAttribute("data-cwx-checked", "1");

    var src = el.getAttribute("src");
    if (!src) return;
    if (!shouldBlockUrl(src)) return;

    var category = getCategoryForScript(src);

    if (!hasConsentFor(category)) {
      blockScript(el, src, category);
    }
  }

  function handleIframeElement(el) {
    if (!el || el.getAttribute("data-cwx-checked")) return;
    el.setAttribute("data-cwx-checked", "1");

    var src = el.getAttribute("src");
    if (!src) return;
    if (!shouldBlockUrl(src)) return;

    var category = getCategoryForIframe(src);

    if (!hasConsentFor(category)) {
      blockIframe(el, src, category);
    }
  }
try {
  if (document.currentScript) {
    document.currentScript.setAttribute("data-cwx-checked", "1");
  }
} catch (_) {}
  function scanNow() {
    try {
      document.querySelectorAll("script[src]").forEach(handleScriptElement);
      document.querySelectorAll("iframe[src]").forEach(handleIframeElement);
    } catch (_) {}
  }

  var obs = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type !== "childList") continue;

      m.addedNodes && m.addedNodes.forEach(function (n) {
        if (!n || n.nodeType !== 1) return;
        var tag = (n.tagName || "").toLowerCase();

        if (tag === "script") handleScriptElement(n);
        if (tag === "iframe") handleIframeElement(n);

        try {
          n.querySelectorAll && n.querySelectorAll("script[src]").forEach(handleScriptElement);
          n.querySelectorAll && n.querySelectorAll("iframe[src]").forEach(handleIframeElement);
        } catch (_) {}
      });
    }
  });
  // ---------- RESET CHECK (per riesaminare dopo cambio consenso) ----------
  function resetCheckedFlags() {
    try {
      // riesamina tutto ad ogni tick (iframe anche se già visti)
      document.querySelectorAll("script[data-cwx-checked], iframe[data-cwx-checked]").forEach(function(el){
        // evita di rianalizzare il loader stesso
        if (el === document.currentScript) return;
        el.removeAttribute("data-cwx-checked");
      });
    } catch (_) {}
  }
  function releaseBlocked() {
    // scripts
    var scripts = Q.scripts.slice();
    Q.scripts = [];

    scripts.forEach(function (el) {
      var src = el.getAttribute("data-cwx-src");
      var category = el.getAttribute("data-cwx-category") || "funzionali";
      if (!src) return;

      if (hasConsentFor(category)) {
        try { el.type = "text/javascript"; } catch (_) {}
        el.setAttribute("src", src);
        el.removeAttribute("data-cwx-blocked");
        log("✅ CookieWX rilascia SCRIPT:", category, src);
      } else {
        Q.scripts.push(el);
      }
    });

    // iframes
    var iframes = Q.iframes.slice();
    Q.iframes = [];

    iframes.forEach(function (el) {
      var src = el.getAttribute("data-cwx-src");
      var category = el.getAttribute("data-cwx-category") || "funzionali";
      if (!src) return;

      if (hasConsentFor(category)) {
        el.setAttribute("src", src);
        el.removeAttribute("data-cwx-blocked");
        log("✅ CookieWX rilascia IFRAME:", category, src);
      } else {
        Q.iframes.push(el);
      }
    });
  }
  // ---------- TEARDOWN/RESTORE IFRAME già montati ----------
  function enforceIframeTeardown() {
    try {
      document.querySelectorAll("iframe").forEach(function (ifr) {
        var src = ifr.getAttribute("src") || "";
        var saved = ifr.getAttribute("data-cwx-src") || "";
        var effective = src || saved;
        if (!effective || effective === "about:blank") return;

        // se non è 3rd party, non tocco
        if (!shouldBlockUrl(effective)) return;

        var cat = getCategoryForIframe(effective);

        // se NON ho consenso → spengo iframe già montato
        if (!hasConsentFor(cat)) {
          if (!saved && src) {
            ifr.setAttribute("data-cwx-src", src);
          }
          // spegni davvero (non solo removeAttribute)
          ifr.setAttribute("src", "about:blank");
          ifr.style.display = "none";
          log("🧱 CookieWX teardown IFRAME:", cat, effective);
          return;
        }

        // se HO consenso → ripristino
        if (saved && (!src || src === "about:blank")) {
          ifr.style.display = "";
          ifr.setAttribute("src", saved);
          log("✅ CookieWX restore IFRAME:", cat, saved);
        } else {
          // se era hidden per teardown, ri-mostro
          ifr.style.display = "";
        }
      });
    } catch (_) {}
  }
  function applyConsent(consentObj) {
    if (!consentObj) return;

    window.CookieWX.consent = {
      funzionali: !!consentObj.funzionali,
      statistici: !!consentObj.statistici,
      marketing:  !!consentObj.marketing
    };

    log("⚙️ CookieWX consenso applicato:", window.CookieWX.consent);
enforceIframeTeardown();

setTimeout(function () {
  enforceIframeTeardown();
  resetCheckedFlags();
  scanNow();
}, 50);

releaseBlocked();
  }

  function applyFromStorage() {

  // 🔹 1) regole (con controllo versione)
  var prevVersion = (window.CookieWX.regole && window.CookieWX.regole.version) || "0";
  var nextRegole = readRegoleFromStorage();

  if (nextRegole.version !== prevVersion) {
    log("🔄 CookieWX: regole aggiornate, reset queue");
    Q.scripts = [];
    Q.iframes = [];
  }

  window.CookieWX.regole = nextRegole;

  // 🔹 2) consenso
var c = readConsentFromStorage();
if (c) {
  applyConsent(c);
  hideBanner();
} else {
  window.CookieWX.consent = { funzionali: false, statistici: false, marketing: false };
  log("ℹ️ CookieWX: nessun consenso, mostro banner.");
  showBanner();
  enforceIframeTeardown();
}
  // 🔹 3) rianalizza DOM
  restoreFavicons();   // 👈 QUESTA RIGA VA QUI
  resetCheckedFlags();
  scanNow();
}

  // API globale (opzionale)
  window.CookieWX.applyConsent = applyConsent;
  window.CookieWX.applyFromStorage = applyFromStorage;

  // ---------- BOOT ----------
  // Observer + scan
  try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  

  // Applica stato iniziale
  applyFromStorage();
  scanNow();
// ✅ Wix mounts a lot of iframes late: re-apply a few times on first load
setTimeout(function () {
  log("⏳ CookieWX: delayed re-apply (500ms)");
  applyFromStorage();
}, 500);

setTimeout(function () {
  log("⏳ CookieWX: delayed re-apply (1500ms)");
  applyFromStorage();
}, 1500);
  // ---------- UPDATE TRIGGERS ----------
  // 1) storage (tab diverse)
  window.addEventListener("storage", function (e) {
    if (!e) return;
    if (e.key === KEYS.CONSENSO || e.key === KEYS.REGOLE || e.key === KEYS.TICK) {
      log("🔁 CookieWX: storage update:", e.key);
      applyFromStorage();
    }
  });

  // 2) polling tick (stessa tab, Wix)
  var lastTick = readLocalCompat(KEYS.TICK) || "";
  setInterval(function () {
    var t = readLocalCompat(KEYS.TICK) || "";
    if (t !== lastTick) {
      lastTick = t;
      log("🔁 CookieWX: tick changed, re-apply");
      applyFromStorage();
    }
  }, 400);

// 3) opzionale: postMessage (bridge Wix -> loader)
window.addEventListener("message", function (e) {
  if (!e || !e.data) return;

  // ✅ SYNC completo: regole + consenso (opzione A)
if (e.data.type === "COOKIEWX_SYNC") {
  if (e.data.regole) {
    window.CookieWX.regole = e.data.regole;
    log("📦 CookieWX: regole sync ricevute");
  }

  if (e.data.consent) {
    applyConsent(e.data.consent);   // applica consenso
    log("✅ CookieWX: consenso sync ricevuto");
  }

  enforceIframeTeardown();          // ✅ AGGIUNGI
  resetCheckedFlags();              // ✅ AGGIUNGI
  scanNow();                        // rianalizza DOM

  return;
}

  // ✅ compatibilità: vecchio solo-consenso
if (e.data.type === "COOKIEWX_CONSENT" && e.data.consent) {
  applyConsent(e.data.consent);
  enforceIframeTeardown();   // ✅
  resetCheckedFlags();       // ✅
  scanNow();
}
});

})();
