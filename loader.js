/* =========================================================
 * CookieWX Loader v2.1 (Wix-ready)
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

      // ✅ HTML component Wix (html1)
      "filesusr.com"
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
    var raw = readLocalCompat(KEYS.CONSENSO);
    if (!raw) return null;

    var obj = safeJsonParse(raw, null);
    if (!obj) return null;

    var pref = obj.preferenze || obj.preferences || obj.consent || null;
    if (!pref) return null;

    return {
      funzionali: !!pref.funzionali,
      statistici: !!pref.statistici,
      marketing:  !!pref.marketing
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

  function applyConsent(consentObj) {
    if (!consentObj) return;

    window.CookieWX.consent = {
      funzionali: !!consentObj.funzionali,
      statistici: !!consentObj.statistici,
      marketing:  !!consentObj.marketing
    };

    log("⚙️ CookieWX consenso applicato:", window.CookieWX.consent);
    releaseBlocked();
  }

  function applyFromStorage() {
    // 1) regole
    window.CookieWX.regole = readRegoleFromStorage();

    // 2) consenso
    var c = readConsentFromStorage();
    if (c) {
      applyConsent(c);
    } else {
      // nessun consenso => tutto false (blocco)
      window.CookieWX.consent = { funzionali: false, statistici: false, marketing: false };
      log("ℹ️ CookieWX: nessun consenso, resto in blocco.");
    }

    // 3) ricanalizza DOM (utile quando regole cambiano)
    scanNow();
  }

  // API globale (opzionale)
  window.CookieWX.applyConsent = applyConsent;
  window.CookieWX.applyFromStorage = applyFromStorage;

  // ---------- BOOT ----------
  // Observer + scan
  try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  scanNow();

  // Applica stato iniziale
  applyFromStorage();

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
      applyConsent(e.data.consent);
      log("✅ CookieWX: consenso sync ricevuto");
    }

    // rianalizza dopo sync (utile se cambiano regole/iframe/script)
    scanNow();
    return;
  }

  // ✅ compatibilità: vecchio solo-consenso
  if (e.data.type === "COOKIEWX_CONSENT" && e.data.consent) {
    applyConsent(e.data.consent);
  }
});

})();
