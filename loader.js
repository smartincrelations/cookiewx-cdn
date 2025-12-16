/* =========================================================
 * CookieWX Loader v2
 * - Da caricare in <head> il prima possibile
 * - Blocca SCRIPT/IFRAME prima del consenso
 * - Sblocca dopo (in base alle preferenze salvate)
 * ========================================================= */

(function () {
  if (window.__COOKIEWX_LOADER__) return;
  window.__COOKIEWX_LOADER__ = true;

  // ---------- CONFIG ----------
  var CONSENT_KEY = "cookiewxConsenso"; // <-- usa la tua chiave reale
  var DEBUG = true;

  // domini SEMPRE consentiti (Wix + sito stesso)
  function isAlwaysAllowed(url) {
    try {
      var u = new URL(url, location.href);
      var host = u.hostname.replace(/^www\./, "");
      var site = location.hostname.replace(/^www\./, "");

      // allowlist Wix + sito
      var allow = [
        site,
        "wix.com",
        "wixstatic.com",
        "wixsite.com",
        "wixmp.com",
        "wixdns.net",
        "parastorage.com",
        "static.parastorage.com"
      ];

      return allow.some(function (d) {
        return host === d || host.endsWith("." + d);
      });
    } catch (e) {
      return true; // se non riesco a parsare, non blocco (per evitare rotture)
    }
  }

  // mappa dominio -> categoria
  function categorizeUrl(url) {
    try {
      var u = new URL(url, location.href);
      var h = u.hostname.replace(/^www\./, "");

      // marketing
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

      // statistici
      if (
        h.endsWith("google-analytics.com") ||
        h.endsWith("analytics.google.com") ||
        h.endsWith("googletagmanager.com") ||
        h.endsWith("hotjar.com") ||
        h.endsWith("clarity.ms") ||
        h.endsWith("segment.com")
      ) return "statistici";

      // iframe tipici (maps/youtube)
      if (
        h.endsWith("youtube.com") ||
        h.endsWith("youtube-nocookie.com") ||
        h.endsWith("ytimg.com") ||
        h.endsWith("google.com") || // maps embed spesso sta qui
        h.endsWith("gstatic.com")
      ) return "marketing"; // spesso li vuoi sotto marketing (oppure funzionali: scegli tu)

      return "funzionali";
    } catch (e) {
      return "funzionali";
    }
  }

  // ---------- STATE ----------
  window.CookieWX = window.CookieWX || {
    version: "2.0.0",
    consent: { funzionali: false, statistici: false, marketing: false }
  };

  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, arguments); } catch (_) {}
  }

  function readConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);

      // Supporta sia {accettato:true, preferenze:{...}} sia {preferenze:{...}}
      var pref = obj.preferenze || obj.preferences || obj.consent || obj;
      if (!pref) return null;

      return {
        funzionali: !!pref.funzionali,
        statistici: !!pref.statistici,
        marketing: !!pref.marketing
      };
    } catch (e) {
      return null;
    }
  }

  function hasConsentFor(category) {
    var c = window.CookieWX && window.CookieWX.consent ? window.CookieWX.consent : {};
    if (category === "funzionali") return !!c.funzionali;
    if (category === "statistici") return !!c.statistici;
    if (category === "marketing") return !!c.marketing;
    return false;
  }

  // queue di elementi bloccati
  var Q = {
    scripts: [],
    iframes: []
  };

  // ---------- BLOCKERS ----------
  function blockScript(el, src, category) {
    // salva e neutralizza
    el.setAttribute("data-cwx-blocked", "1");
    el.setAttribute("data-cwx-category", category);
    el.setAttribute("data-cwx-src", src);

    // evita fetch
    el.removeAttribute("src");
    // per sicurezza: type non eseguibile
    try { el.type = "text/plain"; } catch (_) {}

    Q.scripts.push(el);
    log("🧱 CookieWX blocca SCRIPT:", category, src);
  }

  function blockIframe(el, src, category) {
    el.setAttribute("data-cwx-blocked", "1");
    el.setAttribute("data-cwx-category", category);
    el.setAttribute("data-cwx-src", src);

    // evita fetch
    el.removeAttribute("src");

    Q.iframes.push(el);
    log("🧱 CookieWX blocca IFRAME:", category, src);
  }

  function shouldBlockUrl(url) {
    if (!url) return false;
    if (isAlwaysAllowed(url)) return false;
    return true;
  }

  function handleScriptElement(el) {
    if (!el || el.getAttribute("data-cwx-checked")) return;
    el.setAttribute("data-cwx-checked", "1");

    var src = el.getAttribute("src");
    if (!src) return;

    if (!shouldBlockUrl(src)) return;

    var category = categorizeUrl(src);

    // se non c'è consenso per quella categoria -> blocca
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

    var category = categorizeUrl(src);
    if (!hasConsentFor(category)) {
      blockIframe(el, src, category);
    }
  }

  // scanner iniziale (nel caso qualcosa sia già in DOM)
  function scanNow() {
    try {
      document.querySelectorAll("script[src]").forEach(handleScriptElement);
      document.querySelectorAll("iframe[src]").forEach(handleIframeElement);
    } catch (_) {}
  }

  // MutationObserver per bloccare anche ciò che viene aggiunto dopo
  var obs = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "childList") {
        m.addedNodes && m.addedNodes.forEach(function (n) {
          if (!n || n.nodeType !== 1) return;
          var tag = (n.tagName || "").toLowerCase();

          if (tag === "script") handleScriptElement(n);
          if (tag === "iframe") handleIframeElement(n);

          // se un wrapper contiene script/iframe
          try {
            n.querySelectorAll && n.querySelectorAll("script[src]").forEach(handleScriptElement);
            n.querySelectorAll && n.querySelectorAll("iframe[src]").forEach(handleIframeElement);
          } catch (_) {}
        });
      }
    }
  });

  // ---------- RELEASE ----------
  function releaseBlocked() {
    // scripts
    var scripts = Q.scripts.slice();
    Q.scripts = [];

    scripts.forEach(function (el) {
      var src = el.getAttribute("data-cwx-src");
      var category = el.getAttribute("data-cwx-category") || "funzionali";
      if (!src) return;

      if (hasConsentFor(category)) {
        try {
          el.type = "text/javascript";
        } catch (_) {}
        el.setAttribute("src", src);
        el.removeAttribute("data-cwx-blocked");
        log("✅ CookieWX rilascia SCRIPT:", category, src);
      } else {
        // resta bloccato
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
      marketing: !!consentObj.marketing
    };

    log("⚙️ CookieWX consenso applicato:", window.CookieWX.consent);
    releaseBlocked();
  }

  // API globale (comoda dal banner)
  window.CookieWX.applyConsent = applyConsent;

  // ---------- BOOT ----------
  // 1) carica consenso se esiste già
  var c0 = readConsent();
  if (c0) applyConsent(c0);
  else log("ℹ️ CookieWX: nessun consenso salvato, blocco attivo.");

  // 2) avvia observer + scan
  try {
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  scanNow();

  // 3) segnali di aggiornamento consenso (banner)
  window.addEventListener("storage", function (e) {
    if (e.key === CONSENT_KEY) {
      var c = readConsent();
      applyConsent(c);
    }
  });

  window.addEventListener("message", function (e) {
    // il tuo banner iframe può fare:
    // parent.postMessage({ type:"COOKIEWX_CONSENT", consent:{...} }, "*")
    if (!e || !e.data) return;
    if (e.data.type === "COOKIEWX_CONSENT" && e.data.consent) {
      applyConsent(e.data.consent);
    }
  });
})();
