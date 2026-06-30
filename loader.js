/* =========================================================
 * CookieWX Loader v3.0.0
 * Versione operativa senza validazione abbonamento
 *
 * Obiettivi:
 * - Non modifica mai la favicon del sito cliente.
 * - Legge consenso da: cookiewxConsenso
 * - Legge regole da:   cookiewxRegole
 * - Trigger update:    cookiewxTick
 * - Usa categorie da database quando disponibili.
 * - Se non riconosce una risorsa, la tratta come Marketing.
 * - Blocca script/iframe 3rd-party prima del consenso.
 * - Mostra placeholder per iframe/video bloccati.
 * - Legge policyUrl da window.CookieWX.regole.policyUrl.
 * ========================================================= */

(function CookieWXLoader() {
  "use strict";

  /* =========================================================
   * CAP. 0 — SAFE BOOT
   * ========================================================= */

  if (window.__COOKIEWX_LOADER_V3__) return;
  window.__COOKIEWX_LOADER_V3__ = true;


  /* =========================================================
   * CAP. 1 — CONFIG, COSTANTI, DEBUG
   * ========================================================= */

  var DEBUG = true;

  var VERSION = "3.0.0";

  var KEYS = {
    CONSENSO: "cookiewxConsenso",
    REGOLE: "cookiewxRegole",
    TICK: "cookiewxTick",
    USER_ID: "cookiewxUserId"
  };

  var IDS = {
    BANNER: "cookiewx-banner",
    BANNER_STYLE: "cookiewx-banner-style",
    PREFS: "cookiewx-preferences",
    PREFS_STYLE: "cookiewx-preferences-style",
    BADGE: "cookiewx-badge",
    BADGE_STYLE: "cookiewx-badge-style",
    PLACEHOLDER_STYLE: "cookiewx-placeholder-style"
  };

  var BACKEND = {
    CONSENT_URL: "https://www.cookiewx.com/_functions/cookiewxConsent"
  };

  var CATEGORY = {
    ESSENZIALI: "essenziali",
    FUNZIONALI: "funzionali",
    STATISTICI: "statistici",
    MARKETING: "marketing"
  };

  var Q = {
    scripts: [],
    iframes: []
  };

  var CWX_TEMP_PREFS = {
    funzionali: true,
    statistici: true,
    marketing: true
  };

  function log() {
    if (!DEBUG) return;
    try {
      console.log.apply(console, arguments);
    } catch (_) {}
  }

  function warn() {
    if (!DEBUG) return;
    try {
      console.warn.apply(console, arguments);
    } catch (_) {}
  }


  /* =========================================================
   * CAP. 2 — CLEANUP VECCHIE VERSIONI
   * ========================================================= */

  function cleanupLegacyFavicons() {
    try {
      document.querySelectorAll("link[data-cwx-favicon]").forEach(function (el) {
        el.remove();
      });
    } catch (_) {}
  }

  cleanupLegacyFavicons();


  /* =========================================================
   * CAP. 3 — STATO GLOBALE CookieWX
   * ========================================================= */

  window.CookieWX = window.CookieWX || {};

  window.CookieWX.version = VERSION;

  window.CookieWX.consent = window.CookieWX.consent || {
    funzionali: false,
    statistici: false,
    marketing: false
  };

  window.CookieWX.regole = window.CookieWX.regole || {
    version: "0",
    policyUrl: "",
    cookies: [],
    scripts: [],
    iframes: []
  };


  /* =========================================================
   * CAP. 4 — UTILS BASE
   * ========================================================= */

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function safeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function lower(value) {
    return safeString(value).toLowerCase();
  }

  function normalizeCategory(value) {
    var v = lower(value);

    if (!v) return "";

    if (v === "essenziale" || v === "essential" || v === "necessary" || v === "necessari") {
      return CATEGORY.ESSENZIALI;
    }

    if (v === "funzionale" || v === "functional" || v === "preferences" || v === "preferenze") {
      return CATEGORY.FUNZIONALI;
    }

    if (v === "statistico" || v === "statistici" || v === "analytics" || v === "analytic") {
      return CATEGORY.STATISTICI;
    }

    if (v === "marketing" || v === "ads" || v === "advertising" || v === "social") {
      return CATEGORY.MARKETING;
    }

    return v;
  }

  function categoryLabel(category) {
    category = normalizeCategory(category);

    if (category === CATEGORY.ESSENZIALI) return "Essenziali";
    if (category === CATEGORY.FUNZIONALI) return "Funzionali";
    if (category === CATEGORY.STATISTICI) return "Statistici";
    if (category === CATEGORY.MARKETING) return "Marketing";

    return "Marketing";
  }

  function getHostname(url) {
    try {
      return new URL(url, location.href).hostname.replace(/^www\./, "").toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function getCurrentSiteHost() {
    try {
      return location.hostname.replace(/^www\./, "").toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function isSameSite(url) {
    var host = getHostname(url);
    var site = getCurrentSiteHost();

    if (!host || !site) return false;

    return host === site || host.endsWith("." + site);
  }

  function getOrCreateUserId() {
    try {
      var id = localStorage.getItem(KEYS.USER_ID);
      if (id) return id;

      if (window.crypto && crypto.getRandomValues) {
        id = "cwx-" + ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
          return (
            c ^
            crypto.getRandomValues(new Uint8Array(1))[0] &
            15 >> c / 4
          ).toString(16);
        });
      } else {
        id = "cwx-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      }

      localStorage.setItem(KEYS.USER_ID, id);
      return id;
    } catch (_) {
      return "cwx-temp-" + Date.now();
    }
  }

  function readLocalCompat(key) {
    var direct = null;

    try {
      direct = localStorage.getItem(key);
      if (direct != null) return direct;
    } catch (_) {}

    try {
      var keys = Object.keys(localStorage);

      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];

        if (k.indexOf("platform_app_") !== 0) continue;

        var box = safeJsonParse(localStorage.getItem(k) || "{}", {});

        if (box && typeof box[key] === "string") {
          return box[key];
        }
      }
    } catch (_) {}

    return null;
  }

  function kickReload() {
    try {
      localStorage.setItem(KEYS.TICK, String(Date.now()));
    } catch (_) {}
  }


  /* =========================================================
   * CAP. 5 — LETTURA CONSENSO E REGOLE
   * ========================================================= */

  function readConsentFromStorage() {
    var raw = readLocalCompat(KEYS.CONSENSO);

    if (!raw) return null;

    var obj = safeJsonParse(raw, null);

    if (!obj || !obj.preferenze) return null;

    return {
      funzionali: !!obj.preferenze.funzionali,
      statistici: !!obj.preferenze.statistici,
      marketing: !!obj.preferenze.marketing
    };
  }

  function readRegoleFromStorage() {
    var raw = readLocalCompat(KEYS.REGOLE);

    if (!raw) {
      return {
        version: "0",
        policyUrl: "",
        cookies: [],
        scripts: [],
        iframes: []
      };
    }

    var r = safeJsonParse(raw, {});

    return {
      version: safeString(r.version || r.updatedAt || "0"),
      policyUrl: safeString(r.policyUrl || r.privacyPolicyUrl || r.cookiePolicyUrl || ""),
      cookies: Array.isArray(r.cookies) ? r.cookies : [],
      scripts: Array.isArray(r.scripts) ? r.scripts : [],
      iframes: Array.isArray(r.iframes) ? r.iframes : []
    };
  }

  function getPolicyUrl() {
    try {
      return safeString(
        window.CookieWX &&
        window.CookieWX.regole &&
        window.CookieWX.regole.policyUrl
      );
    } catch (_) {
      return "";
    }
  }

  function hasConsentFor(category) {
    category = normalizeCategory(category);

    if (category === CATEGORY.ESSENZIALI) return true;

    var c = window.CookieWX && window.CookieWX.consent
      ? window.CookieWX.consent
      : {};

    if (category === CATEGORY.FUNZIONALI) return !!c.funzionali;
    if (category === CATEGORY.STATISTICI) return !!c.statistici;
    if (category === CATEGORY.MARKETING) return !!c.marketing;

    return false;
  }


  /* =========================================================
   * CAP. 6 — GOOGLE CONSENT MODE
   * ========================================================= */

  window.dataLayer = window.dataLayer || [];

  function rawGtag() {
    window.dataLayer.push(arguments);
  }

  window.gtag = window.gtag || rawGtag;

  window.__COOKIEWX_GA_IDS__ = window.__COOKIEWX_GA_IDS__ || [];
  window.__COOKIEWX_GOOGLE_BLOCKED__ = true;

  function detectGAFromScripts() {
    try {
      document.querySelectorAll('script[src*="gtag/js?id="]').forEach(function (s) {
        var src = s.getAttribute("src") || "";
        var match = src.match(/id=([^&]+)/);

        if (!match) return;

        var id = match[1];

        if (window.__COOKIEWX_GA_IDS__.indexOf(id) === -1) {
          window.__COOKIEWX_GA_IDS__.push(id);
          window["ga-disable-" + id] = true;
          log("CookieWX: GA ID rilevato:", id);
        }
      });
    } catch (_) {}
  }

  function setGoogleDefaultDenied() {
    try {
      window.dataLayer = window.dataLayer || [];

      window.dataLayer.push([
        "consent",
        "default",
        {
          ad_storage: "denied",
          analytics_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          functionality_storage: "denied",
          personalization_storage: "denied",
          security_storage: "granted",
          wait_for_update: 500
        }
      ]);

      window.gtag("consent", "default", {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        functionality_storage: "denied",
        personalization_storage: "denied",
        security_storage: "granted",
        wait_for_update: 500
      });

      log("CookieWX: Google Consent default denied");
    } catch (e) {
      warn("CookieWX: Google default denied error", e);
    }
  }

  function updateGoogleConsent(consent) {
    try {
      window.gtag("consent", "update", {
        ad_storage: consent.marketing ? "granted" : "denied",
        analytics_storage: consent.statistici ? "granted" : "denied",
        ad_user_data: consent.marketing ? "granted" : "denied",
        ad_personalization: consent.marketing ? "granted" : "denied",
        functionality_storage: consent.funzionali ? "granted" : "denied",
        personalization_storage: consent.funzionali ? "granted" : "denied",
        security_storage: "granted"
      });

      log("CookieWX: Google Consent aggiornato", consent);
    } catch (e) {
      warn("CookieWX: updateGoogleConsent error", e);
    }
  }

  function hardDisableGoogle() {
    try {
      window.__COOKIEWX_GOOGLE_BLOCKED__ = true;

      detectGAFromScripts();

      window.__COOKIEWX_GA_IDS__.forEach(function (id) {
        window["ga-disable-" + id] = true;
      });

      if (window.ga) {
        window.ga = function () {
          warn("CookieWX: ga bloccato");
        };
      }

      log("CookieWX: Google hard disabled");
    } catch (e) {
      warn("CookieWX: hardDisableGoogle error", e);
    }
  }

  function reEnableGoogleIfAllowed() {
    try {
      if (!window.CookieWX.consent.statistici && !window.CookieWX.consent.marketing) {
        return;
      }

      window.__COOKIEWX_GOOGLE_BLOCKED__ = false;

      detectGAFromScripts();

      window.__COOKIEWX_GA_IDS__.forEach(function (id) {
        window["ga-disable-" + id] = false;
      });

      updateGoogleConsent(window.CookieWX.consent);

      if (window.CookieWX.consent.statistici) {
        window.__COOKIEWX_GA_IDS__.forEach(function (id) {
          try {
            window.gtag("config", id);
            window.gtag("event", "page_view");
          } catch (_) {}
        });
      }

      log("CookieWX: Google riattivato se consentito");
    } catch (e) {
      warn("CookieWX: reEnableGoogleIfAllowed error", e);
    }
  }

  function installDataLayerGate() {
    try {
      if (window.__COOKIEWX_DATALAYER_GATE__) return;
      window.__COOKIEWX_DATALAYER_GATE__ = true;

      window.dataLayer = window.dataLayer || [];

      var originalPush = window.dataLayer.push.bind(window.dataLayer);

      window.dataLayer.push = function () {
        var item = arguments[0];

        if (
          Array.isArray(item) &&
          item[0] === "config" &&
          typeof item[1] === "string"
        ) {
          var measurementId = item[1];

          if (window.__COOKIEWX_GA_IDS__.indexOf(measurementId) === -1) {
            window.__COOKIEWX_GA_IDS__.push(measurementId);
          }

          if (!hasConsentFor(CATEGORY.STATISTICI)) {
            window["ga-disable-" + measurementId] = true;
            warn("CookieWX: config GA bloccato pre-consent", measurementId);
            return;
          }
        }

        return originalPush.apply(this, arguments);
      };
    } catch (e) {
      warn("CookieWX: installDataLayerGate error", e);
    }
  }

  setGoogleDefaultDenied();
  installDataLayerGate();

  /* =========================================================
 * CAP. 6.1 — MARKETING RUNTIME GUARD
 * ========================================================= */
/*
  Scopo:
  - Bloccare runtime marketing anche quando alcuni script sono già stati caricati.
  - Utile per Facebook Pixel, TikTok, LinkedIn, Pinterest, Snapchat, ecc.
  - Non può "disinstallare" codice già eseguito, ma impedisce nuove chiamate/eventi.
*/

function hasMarketingConsent() {
  return hasConsentFor(CATEGORY.MARKETING);
}

function blockedMarketingFunction(name) {
  return function () {
    if (!hasMarketingConsent()) {
      warn("CookieWX: runtime marketing bloccato", name, arguments);
      return;
    }
  };
}

function hardDisableMarketingRuntime() {
  try {
    window.__COOKIEWX_MARKETING_BLOCKED__ = true;

    var apis = [
      "fbq",
      "_fbq",
      "ttq",
      "lintrk",
      "pintrk",
      "snaptr",
      "twq",
      "rdt",
      "uetq"
    ];

    apis.forEach(function (api) {
      window[api] = blockedMarketingFunction(api);
    });

    /*
      Clarity può essere statistico o marketing a seconda della configurazione.
      Per prudenza, se manca consenso marketing/statistici lo blocchiamo.
    */
    if (!hasConsentFor(CATEGORY.STATISTICI) && !hasConsentFor(CATEGORY.MARKETING)) {
      window.clarity = blockedMarketingFunction("clarity");
    }

    log("CookieWX: marketing runtime hard disabled");
  } catch (e) {
    warn("CookieWX: hardDisableMarketingRuntime error", e);
  }
}

function reEnableMarketingRuntimeIfAllowed() {
  try {
    if (!hasMarketingConsent()) return;

    window.__COOKIEWX_MARKETING_BLOCKED__ = false;

    /*
      Non reiniettiamo manualmente Facebook/TikTok ecc.
      Li lasciamo ripartire solo se:
      - lo script era in queue e viene rilasciato
      - oppure il sito li richiama dopo il consenso.
    */
    log("CookieWX: marketing runtime consentito");
  } catch (e) {
    warn("CookieWX: reEnableMarketingRuntimeIfAllowed error", e);
  }
}


  /* =========================================================
   * CAP. 7 — CLASSIFICAZIONE DA DB
   * ========================================================= */

  function getRuleCategory(rule) {
    if (!rule || typeof rule !== "object") return "";

    return normalizeCategory(
      rule.tipologia ||
      rule.categoria ||
      rule.category ||
      rule.tipo ||
      ""
    );
  }

  function getRuleNeedles(rule) {
    var out = [];

    if (!rule) return out;

    if (typeof rule === "string") {
      out.push(rule);
      return out;
    }

    if (typeof rule !== "object") return out;

    [
      "name",
      "nome",
      "url",
      "src",
      "value",
      "pattern",
      "domainKey",
      "hostname",
      "dominio"
    ].forEach(function (field) {
      if (rule[field]) out.push(rule[field]);
    });

    if (Array.isArray(rule.urls)) {
      rule.urls.forEach(function (u) {
        if (u) out.push(u);
      });
    }

    return out.filter(Boolean).map(function (x) {
      return lower(x);
    });
  }

  function urlMatchesNeedle(url, needle) {
    url = lower(url);
    needle = lower(needle);

    if (!url || !needle) return false;

    if (url.indexOf(needle) !== -1) return true;

    var host = getHostname(url);
    var needleHost = "";

    try {
      needleHost = new URL(needle, location.href).hostname.replace(/^www\./, "").toLowerCase();
    } catch (_) {
      needleHost = needle.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase();
    }

    if (!host || !needleHost) return false;

    return host === needleHost || host.endsWith("." + needleHost);
  }

  function categoryFromDbUrlRule(list, url) {
    if (!Array.isArray(list) || !url) return "";

    for (var i = 0; i < list.length; i++) {
      var rule = list[i];
      var needles = getRuleNeedles(rule);

      for (var j = 0; j < needles.length; j++) {
        if (urlMatchesNeedle(url, needles[j])) {
          return getRuleCategory(rule);
        }
      }
    }

    return "";
  }

  function categoryFromDbCookieRule(name) {
    name = lower(name);

    var list = window.CookieWX.regole.cookies || [];

    if (!Array.isArray(list) || !name) return "";

    for (var i = 0; i < list.length; i++) {
      var rule = list[i];

      if (typeof rule === "string") {
        if (lower(rule) === name) return "";
        continue;
      }

      if (!rule || typeof rule !== "object") continue;

      var ruleName = lower(rule.name || rule.nome || rule.value || rule.pattern || "");

      if (ruleName && ruleName === name) {
        return getRuleCategory(rule);
      }
    }

    return "";
  }


  /* =========================================================
   * CAP. 8 — FALLBACK CATEGORIE
   * ========================================================= */

  function isEssentialCookieName(name) {
    name = lower(name);

    if (!name) return false;

    return (
      name.indexOf("session") !== -1 ||
      name.indexOf("csrf") !== -1 ||
      name.indexOf("xsrf") !== -1 ||
      name.indexOf("wix") !== -1 ||
      name.indexOf("consent") !== -1 ||
      name === "hs" ||
      name === "ssr-caching" ||
      name === "svsession" ||
      name === "xsrftoken" ||
      name === "cookiewxconsenso" ||
      name === "cookiewxuserid"
    );
  }

  function categorizeCookieFallback(name) {
    name = lower(name);

    if (isEssentialCookieName(name)) return CATEGORY.ESSENZIALI;

    if (
      name.indexOf("_ga") === 0 ||
      name.indexOf("_gid") === 0 ||
      name.indexOf("_gat") === 0 ||
      name.indexOf("__utm") === 0
    ) {
      return CATEGORY.STATISTICI;
    }

    if (
      name.indexOf("_fb") === 0 ||
      name === "fr" ||
      name.indexOf("_gcl") === 0 ||
      name.indexOf("fbc") !== -1 ||
      name.indexOf("fbp") !== -1
    ) {
      return CATEGORY.MARKETING;
    }

    return CATEGORY.MARKETING;
  }

  function categorizeUrlFallback(url, kind) {
    var host = getHostname(url);

    if (!host) return CATEGORY.MARKETING;

    if (isSameSite(url)) return CATEGORY.ESSENZIALI;

    if (isAlwaysAllowedHost(host)) return CATEGORY.ESSENZIALI;

    if (
      host.endsWith("google-analytics.com") ||
      host.endsWith("analytics.google.com") ||
      host.endsWith("hotjar.com") ||
      host.endsWith("clarity.ms") ||
      host.endsWith("segment.com") ||
      host.endsWith("matomo.cloud")
    ) {
      return CATEGORY.STATISTICI;
    }

    if (
      host.endsWith("googletagmanager.com")
    ) {
      return CATEGORY.STATISTICI;
    }

    if (
      host.endsWith("facebook.com") ||
      host.endsWith("facebook.net") ||
      host.endsWith("instagram.com") ||
      host.endsWith("doubleclick.net") ||
      host.endsWith("googlesyndication.com") ||
      host.endsWith("googleadservices.com") ||
      host.endsWith("tiktok.com") ||
      host.endsWith("tiktokcdn.com") ||
      host.endsWith("youtube.com") ||
      host.endsWith("youtube-nocookie.com") ||
      host.endsWith("ytimg.com") ||
      host.endsWith("vimeo.com") ||
      host.endsWith("player.vimeo.com") ||
      host.endsWith("google.com")
    ) {
      return CATEGORY.MARKETING;
    }

    return CATEGORY.MARKETING;
  }

  function getCategoryForCookie(name) {
    var catDb = categoryFromDbCookieRule(name);

    if (catDb) return catDb;

    return categorizeCookieFallback(name);
  }

  function getCategoryForScript(url) {
    var catDb = categoryFromDbUrlRule(window.CookieWX.regole.scripts, url);

    if (catDb) return catDb;

    return categorizeUrlFallback(url, "script");
  }

  function getCategoryForIframe(url) {
    var catDb = categoryFromDbUrlRule(window.CookieWX.regole.iframes, url);

    if (catDb) return catDb;

    return categorizeUrlFallback(url, "iframe");
  }

  function isAlwaysAllowedHost(host) {
    host = lower(host);

    var site = getCurrentSiteHost();

    if (!host) return false;

    if (site && (host === site || host.endsWith("." + site))) return true;

    var allow = [
      "cookiewx.com",
      "cookiewx-cdn.pages.dev",
      "pages.dev",

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
  }

  function shouldBlockUrl(url) {
    if (!url) return false;

    var host = getHostname(url);

    if (!host) return false;

    if (isAlwaysAllowedHost(host)) return false;

    return true;
  }


  /* =========================================================
   * CAP. 9 — COOKIE GUARD E PULIZIA COOKIE
   * ========================================================= */

  function installCookieGuard() {
    try {
      if (window.__COOKIEWX_COOKIE_GUARD__) return;
      window.__COOKIEWX_COOKIE_GUARD__ = true;

      var descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

      if (!descriptor || !descriptor.set || descriptor.configurable === false) {
        warn("CookieWX: document.cookie non intercettabile in questo ambiente");
        return;
      }

      Object.defineProperty(document, "cookie", {
        configurable: true,
        enumerable: true,

        get: function () {
          return descriptor.get.call(document);
        },

        set: function (value) {
          try {
            var name = lower(String(value).split("=")[0]);

            if (!name) return;

            var category = getCategoryForCookie(name);

            if (!hasConsentFor(category)) {
              warn("CookieWX: blocca cookie write", name, category);
              return;
            }

            descriptor.set.call(document, value);
          } catch (e) {
            try {
              descriptor.set.call(document, value);
            } catch (_) {}
          }
        }
      });

      log("CookieWX: cookie guard installato");
    } catch (e) {
      warn("CookieWX: installCookieGuard error", e);
    }
  }

  function deleteCookieEverywhere(name) {
    try {
      var hostname = location.hostname;
      var parts = hostname.split(".");
      var rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;

      var domains = [
        hostname,
        "." + hostname,
        rootDomain,
        "." + rootDomain
      ];

      domains.forEach(function (domain) {
        document.cookie =
          name + "=; path=/; domain=" + domain + "; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      });

      document.cookie =
        name + "=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    } catch (_) {}
  }

  function deleteCookiesWithoutConsent() {
    try {
      var cookies = document.cookie ? document.cookie.split(";") : [];

      cookies.forEach(function (cookie) {
        var name = safeString(cookie.split("=")[0]);

        if (!name) return;

        var category = getCategoryForCookie(name);

        if (!hasConsentFor(category)) {
          deleteCookieEverywhere(name);
          log("CookieWX: cookie eliminato per mancato consenso", name, category);
        }
      });
    } catch (e) {
      warn("CookieWX: deleteCookiesWithoutConsent error", e);
    }
  }


  /* =========================================================
   * CAP. 10 — SCRIPT GUARD
   * ========================================================= */

  function markCurrentScriptSafe() {
    try {
      if (document.currentScript) {
        document.currentScript.setAttribute("data-cwx-checked", "1");
        document.currentScript.setAttribute("data-cwx-safe", "1");
      }
    } catch (_) {}
  }

  function blockScript(el, src, category) {
    try {
      if (!el || !src) return;

      el.setAttribute("data-cwx-blocked", "1");
      el.setAttribute("data-cwx-category", category);
      el.setAttribute("data-cwx-src", src);

      el.removeAttribute("src");

      try {
        el.type = "text/plain";
      } catch (_) {}

      Q.scripts.push(el);

      log("CookieWX: script bloccato", category, src);
    } catch (e) {
      warn("CookieWX: blockScript error", e);
    }
  }

  function handleScriptElement(el) {
    try {
      if (!el) return;
      if (el.getAttribute("data-cwx-checked")) return;
      if (el.getAttribute("data-cwx-safe")) return;

      el.setAttribute("data-cwx-checked", "1");

      var src = el.getAttribute("src");

      if (!src) return;
      if (!shouldBlockUrl(src)) return;

      var category = getCategoryForScript(src);

      if (!hasConsentFor(category)) {
        blockScript(el, src, category);
      }
    } catch (e) {
      warn("CookieWX: handleScriptElement error", e);
    }
  }

  function releaseBlockedScripts() {
    var list = Q.scripts.slice();
    Q.scripts = [];

    list.forEach(function (el) {
      try {
        var src = el.getAttribute("data-cwx-src");
        var category = el.getAttribute("data-cwx-category") || CATEGORY.MARKETING;

        if (!src) return;

        if (hasConsentFor(category)) {
          try {
            el.type = "text/javascript";
          } catch (_) {}

          el.setAttribute("src", src);
          el.removeAttribute("data-cwx-blocked");

          log("CookieWX: script rilasciato", category, src);
        } else {
          Q.scripts.push(el);
        }
      } catch (_) {}
    });
  }


  /* =========================================================
   * CAP. 11 — IFRAME GUARD + PLACEHOLDER
   * ========================================================= */

  function injectPlaceholderStyle() {
    if (document.getElementById(IDS.PLACEHOLDER_STYLE)) return;
    if (!document.head) return;

    var style = document.createElement("style");
    style.id = IDS.PLACEHOLDER_STYLE;
    style.textContent = `
      .cwx-placeholder {
        box-sizing: border-box;
        width: 100%;
        min-height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background: #f5f7fb;
        border: 1px solid #dce5f2;
        border-radius: 14px;
        color: #111827;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
      }

      .cwx-placeholder-inner {
        max-width: 560px;
      }

      .cwx-placeholder-title {
        font-size: 17px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .cwx-placeholder-text {
        font-size: 14px;
        line-height: 1.45;
        color: #4b5563;
        margin-bottom: 14px;
      }

      .cwx-placeholder-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }

      .cwx-placeholder button {
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        font-family: inherit;
        background: #000;
        color: #fff;
      }

      .cwx-placeholder a {
        color: #111827;
        text-decoration: underline;
        font-size: 14px;
        display: inline-flex;
        align-items: center;
      }
    `;

    document.head.appendChild(style);
  }

  function getIframeDisplaySize(el) {
    var width = "100%";
    var height = "240px";

    try {
      var rect = el.getBoundingClientRect();

      if (rect.width && rect.width > 80) width = Math.round(rect.width) + "px";
      if (rect.height && rect.height > 80) height = Math.round(rect.height) + "px";

      var attrWidth = el.getAttribute("width");
      var attrHeight = el.getAttribute("height");

      if (attrWidth) width = /^\d+$/.test(attrWidth) ? attrWidth + "px" : attrWidth;
      if (attrHeight) height = /^\d+$/.test(attrHeight) ? attrHeight + "px" : attrHeight;
    } catch (_) {}

    return { width: width, height: height };
  }

  function createIframePlaceholder(iframe, src, category) {
    try {
      injectPlaceholderStyle();

      var existingId = iframe.getAttribute("data-cwx-placeholder-id");

      if (existingId) {
        var old = document.getElementById(existingId);
        if (old) return old;
      }

      var id = "cwx-ph-" + Math.random().toString(16).slice(2);
      var size = getIframeDisplaySize(iframe);
      var label = categoryLabel(category);
      var policyUrl = getPolicyUrl();

      var box = document.createElement("div");
      box.id = id;
      box.className = "cwx-placeholder";
      box.setAttribute("data-cwx-placeholder-for", src || "");
      box.setAttribute("data-cwx-category", category || CATEGORY.MARKETING);
      box.style.minHeight = size.height;

      if (size.width !== "100%") {
        box.style.maxWidth = size.width;
      }

      box.innerHTML =
        '<div class="cwx-placeholder-inner">' +
          '<div class="cwx-placeholder-title">Contenuto bloccato per preferenze cookie</div>' +
          '<div class="cwx-placeholder-text">' +
            'Per visualizzare questo elemento devi accettare i cookie ' +
            '<strong>' + escapeHtml(label) + '</strong>.' +
          '</div>' +
          '<div class="cwx-placeholder-actions">' +
            '<button type="button" data-cwx-open-prefs>Gestisci preferenze</button>' +
            (
              policyUrl
                ? '<a href="' + escapeAttr(policyUrl) + '" target="_blank" rel="noopener">Leggi la policy</a>'
                : ''
            ) +
          '</div>' +
        '</div>';

      iframe.setAttribute("data-cwx-placeholder-id", id);

      if (iframe.parentNode) {
        iframe.parentNode.insertBefore(box, iframe.nextSibling);
      }

      var btn = box.querySelector("[data-cwx-open-prefs]");

      if (btn) {
        btn.addEventListener("click", function () {
          hideBanner();
          showPreferences();
        });
      }

      return box;
    } catch (e) {
      warn("CookieWX: createIframePlaceholder error", e);
      return null;
    }
  }

  function removeIframePlaceholder(iframe) {
    try {
      var id = iframe.getAttribute("data-cwx-placeholder-id");

      if (!id) return;

      var ph = document.getElementById(id);

      if (ph) ph.remove();

      iframe.removeAttribute("data-cwx-placeholder-id");
    } catch (_) {}
  }

  function blockIframe(el, src, category) {
    try {
      if (!el || !src) return;

      el.setAttribute("data-cwx-blocked", "1");
      el.setAttribute("data-cwx-category", category);
      el.setAttribute("data-cwx-src", src);

      if (!el.getAttribute("data-cwx-original-display")) {
        el.setAttribute("data-cwx-original-display", el.style.display || "");
      }

      createIframePlaceholder(el, src, category);

      el.setAttribute("src", "about:blank");
      el.style.display = "none";

      Q.iframes.push(el);

      log("CookieWX: iframe bloccato", category, src);
    } catch (e) {
      warn("CookieWX: blockIframe error", e);
    }
  }

  function handleIframeElement(el) {
    try {
      if (!el) return;
      if (el.getAttribute("data-cwx-checked")) return;

      el.setAttribute("data-cwx-checked", "1");

      var src = el.getAttribute("src") || el.getAttribute("data-src") || el.getAttribute("data-lazy-src");

      if (!src) return;
      if (src === "about:blank") return;
      if (!shouldBlockUrl(src)) return;

      var category = getCategoryForIframe(src);

      if (!hasConsentFor(category)) {
        blockIframe(el, src, category);
      }
    } catch (e) {
      warn("CookieWX: handleIframeElement error", e);
    }
  }

  function releaseBlockedIframes() {
    var list = Q.iframes.slice();
    Q.iframes = [];

    list.forEach(function (el) {
      try {
        var src = el.getAttribute("data-cwx-src");
        var category = el.getAttribute("data-cwx-category") || CATEGORY.MARKETING;

        if (!src) return;

        if (hasConsentFor(category)) {
          removeIframePlaceholder(el);

          el.style.display = el.getAttribute("data-cwx-original-display") || "";
          el.setAttribute("src", src);
          el.removeAttribute("data-cwx-blocked");

          log("CookieWX: iframe rilasciato", category, src);
        } else {
          Q.iframes.push(el);
        }
      } catch (_) {}
    });
  }

  function enforceIframeTeardown() {
    try {
      document.querySelectorAll("iframe").forEach(function (iframe) {
        var src =
          iframe.getAttribute("src") ||
          iframe.getAttribute("data-cwx-src") ||
          iframe.getAttribute("data-src") ||
          iframe.getAttribute("data-lazy-src") ||
          "";

        if (!src || src === "about:blank") return;
        if (!shouldBlockUrl(src)) return;

        var category = getCategoryForIframe(src);

        if (!hasConsentFor(category)) {
          if (!iframe.getAttribute("data-cwx-src")) {
            iframe.setAttribute("data-cwx-src", src);
          }

          blockIframe(iframe, src, category);
          return;
        }

        removeIframePlaceholder(iframe);

        if (iframe.getAttribute("data-cwx-src")) {
          iframe.style.display = iframe.getAttribute("data-cwx-original-display") || "";
          iframe.setAttribute("src", iframe.getAttribute("data-cwx-src"));
          iframe.removeAttribute("data-cwx-blocked");
        }
      });
    } catch (e) {
      warn("CookieWX: enforceIframeTeardown error", e);
    }
  }


  /* =========================================================
   * CAP. 12 — SCAN DOM E MUTATION OBSERVER
   * ========================================================= */

  function resetCheckedFlags() {
    try {
      document.querySelectorAll("script[data-cwx-checked], iframe[data-cwx-checked]").forEach(function (el) {
        if (el.getAttribute("data-cwx-safe")) return;
        el.removeAttribute("data-cwx-checked");
      });
    } catch (_) {}
  }

  function scanNow() {
    try {
      document.querySelectorAll("script[src]").forEach(handleScriptElement);
      document.querySelectorAll("iframe[src], iframe[data-src], iframe[data-lazy-src]").forEach(handleIframeElement);
    } catch (e) {
      warn("CookieWX: scanNow error", e);
    }
  }

  var domObserver = new MutationObserver(function (mutations) {
    try {
      mutations.forEach(function (mutation) {
        if (mutation.type !== "childList") return;

        mutation.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;

          var tag = lower(node.tagName);

          if (tag === "script") handleScriptElement(node);
          if (tag === "iframe") handleIframeElement(node);

          if (node.querySelectorAll) {
            node.querySelectorAll("script[src]").forEach(handleScriptElement);
            node.querySelectorAll("iframe[src], iframe[data-src], iframe[data-lazy-src]").forEach(handleIframeElement);
          }
        });
      });
    } catch (e) {
      warn("CookieWX: MutationObserver error", e);
    }
  });


  /* =========================================================
   * CAP. 13 — BANNER PRINCIPALE
   * ========================================================= */

  var CWX_BANNER_HTML =
    '<div id="cookiewx-banner">' +
      '<div class="cwx-banner-inner">' +
        '<div class="cwx-banner-copy">' +
          '<div class="cwx-banner-title">Gestione cookie e privacy policy</div>' +
          '<div class="cwx-banner-text">' +
            'Utilizziamo cookie essenziali per il funzionamento del sito. ' +
            'Con il tuo consenso possiamo usare anche cookie funzionali, statistici e marketing. ' +
            '<a href="#" data-cwx-policy>Cookie e privacy policy</a>.' +
          '</div>' +
        '</div>' +

        '<div class="cwx-banner-actions">' +
          '<button type="button" data-cwx="accept">Accetta tutto</button>' +
          '<button type="button" data-cwx="reject">Rifiuta tutto</button>' +
          '<button type="button" data-cwx="prefs">Gestisci preferenze</button>' +
        '</div>' +

        '<div class="cwx-powered-wrap">' +
          '<span class="cwx-powered-text">Powered by</span>' +
          '<a href="https://www.cookiewx.com" target="_blank" rel="noopener" class="cwx-powered-link">' +
            '<img src="https://static.wixstatic.com/media/cf36e3_e6f4be6aacee48589e8adeb30ec67d1a~mv2.png" alt="CookieWX" class="cwx-powered-logo">' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  function injectBannerStyle() {
    if (document.getElementById(IDS.BANNER_STYLE)) return;
    if (!document.head) return;

    var style = document.createElement("style");
    style.id = IDS.BANNER_STYLE;

    style.textContent = `
      #cookiewx-banner {
        position: fixed;
        inset: auto 0 0 0;
        width: 100vw;
        z-index: 2147483647;
        pointer-events: auto;
        background: #ffffff;
        box-shadow: 0 -4px 18px rgba(0,0,0,.16);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        opacity: 0;
        transform: translateY(100%);
        transition: opacity .35s ease, transform .35s ease;
      }

      #cookiewx-banner.cwx-banner-show {
        opacity: 1;
        transform: translateY(0);
      }

      #cookiewx-banner .cwx-banner-inner {
        max-width: 1200px;
        margin: 0 auto;
        padding: 18px 20px;
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        align-items: center;
        justify-content: space-between;
      }

      #cookiewx-banner .cwx-banner-copy {
        flex: 1;
        min-width: 260px;
      }

      #cookiewx-banner .cwx-banner-title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 6px;
        color: #000;
      }

      #cookiewx-banner .cwx-banner-text {
        font-size: 14px;
        line-height: 1.45;
        color: #444;
      }

      #cookiewx-banner .cwx-banner-text a {
        color: #000;
        text-decoration: underline;
      }

      #cookiewx-banner .cwx-banner-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      #cookiewx-banner button {
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 14px;
        cursor: pointer;
        font-family: inherit;
        font-weight: 700;
        transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
      }

      #cookiewx-banner button:active {
        transform: scale(.97);
      }

      #cookiewx-banner button[data-cwx="accept"],
      #cookiewx-banner button[data-cwx="reject"] {
        background: #000;
        color: #fff;
        box-shadow: 0 6px 16px rgba(0,0,0,.18);
      }

      #cookiewx-banner button[data-cwx="prefs"] {
        background: #e6f0ff;
        color: #003366;
        box-shadow: 0 6px 16px rgba(0,64,128,.18);
      }

      #cookiewx-banner .cwx-powered-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #666;
      }

      #cookiewx-banner .cwx-powered-logo {
        height: 42px;
        width: auto;
        display: block;
        max-height: none;
      }

      @media (max-width: 768px) {
        #cookiewx-banner .cwx-banner-inner {
          align-items: stretch;
        }

        #cookiewx-banner .cwx-banner-copy,
        #cookiewx-banner .cwx-banner-actions,
        #cookiewx-banner .cwx-powered-wrap {
          width: 100%;
        }

        #cookiewx-banner .cwx-banner-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        #cookiewx-banner button {
          width: 100%;
          text-align: center;
        }

        #cookiewx-banner .cwx-powered-wrap {
          justify-content: center;
        }

        #cookiewx-banner .cwx-powered-logo {
          height: 36px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function showBanner() {
    if (document.getElementById(IDS.BANNER)) return;

    function mount() {
      if (!document.body) {
        requestAnimationFrame(mount);
        return;
      }

      injectBannerStyle();

      var wrap = document.createElement("div");
      wrap.innerHTML = CWX_BANNER_HTML;

      var banner = wrap.firstElementChild;
      document.body.appendChild(banner);

      bindBannerEvents();
      bindPolicyLink();

      requestAnimationFrame(function () {
        banner.classList.add("cwx-banner-show");
      });
    }

    mount();
  }

  function hideBanner() {
    var el = document.getElementById(IDS.BANNER);

    if (!el) return;

    el.classList.remove("cwx-banner-show");

    setTimeout(function () {
      if (el && el.parentNode) el.remove();
    }, 350);
  }

  function bindBannerEvents() {
    var root = document.getElementById(IDS.BANNER);

    if (!root) return;

    var accept = root.querySelector('[data-cwx="accept"]');
    var reject = root.querySelector('[data-cwx="reject"]');
    var prefs = root.querySelector('[data-cwx="prefs"]');

    if (accept) {
      accept.onclick = function () {
        saveConsent(
          {
            essenziali: true,
            funzionali: true,
            statistici: true,
            marketing: true
          },
          "totale"
        );

        hideBanner();
        showBadge();
        kickReload();
      };
    }

    if (reject) {
      reject.onclick = function () {
        saveConsent(
          {
            essenziali: true,
            funzionali: false,
            statistici: false,
            marketing: false
          },
          "ess-only"
        );

        hideBanner();
        showBadge();
        kickReload();
      };
    }

    if (prefs) {
      prefs.onclick = function () {
        hideBanner();
        showPreferences();
      };
    }
  }

  function bindPolicyLink() {
    var link = document.querySelector("[data-cwx-policy]");

    if (!link) return;

    var url = getPolicyUrl();

    if (url) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.style.display = "";
    } else {
      link.removeAttribute("href");
      link.style.display = "none";
    }
  }


  /* =========================================================
   * CAP. 14 — MODALE PREFERENZE
   * ========================================================= */

  var CWX_PREFERENCES_HTML =
    '<div id="cookiewx-preferences">' +
      '<div class="cwx-prefs-modal">' +
        '<h2>Gestisci preferenze cookie</h2>' +

        '<p>' +
          'Puoi scegliere quali categorie di cookie consentire. ' +
          'I cookie essenziali sono sempre attivi perché necessari al funzionamento del sito.' +
        '</p>' +

        preferenceRowHtml(
          "Essenziali",
          "Necessari per il funzionamento del sito, sicurezza, sessione e operazioni tecniche di base.",
          "essenziali",
          true,
          true
        ) +

        preferenceRowHtml(
          "Funzionali",
          "Consentono al sito di ricordare preferenze e impostazioni utili alla navigazione.",
          "funzionali",
          false,
          false
        ) +

        preferenceRowHtml(
          "Statistici",
          "Aiutano a capire come viene utilizzato il sito e a migliorarne prestazioni e contenuti.",
          "statistici",
          false,
          false
        ) +

        preferenceRowHtml(
          "Marketing",
          "Permettono contenuti, annunci personalizzati, video incorporati e servizi di terze parti.",
          "marketing",
          false,
          false
        ) +

        '<div class="cwx-prefs-footer">' +
          '<button type="button" data-cwx-pref-action="cancel">Annulla</button>' +
          '<button type="button" data-cwx-pref-action="save">Salva preferenze</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  function preferenceRowHtml(title, text, key, checked, disabled) {
    return (
      '<div class="cwx-row">' +
        '<div class="cwx-row-copy">' +
          '<strong>' + escapeHtml(title) + '</strong>' +
          '<small>' + escapeHtml(text) + '</small>' +
        '</div>' +
        '<label class="cwx-switch' + (disabled ? " cwx-disabled" : "") + '">' +
          '<input type="checkbox" data-cwx-pref="' + escapeAttr(key) + '"' +
            (checked ? " checked" : "") +
            (disabled ? " disabled" : "") +
          '>' +
          '<span class="cwx-slider"></span>' +
        '</label>' +
      '</div>'
    );
  }

  function injectPreferencesStyle() {
    if (document.getElementById(IDS.PREFS_STYLE)) return;
    if (!document.head) return;

    var style = document.createElement("style");
    style.id = IDS.PREFS_STYLE;

    style.textContent = `
      #cookiewx-preferences {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.55);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #cookiewx-preferences .cwx-prefs-modal {
        background: #fff;
        max-width: 620px;
        width: 100%;
        max-height: 92vh;
        overflow: auto;
        padding: 26px;
        border-radius: 16px;
        box-shadow: 0 8px 30px rgba(0,0,0,.25);
      }

      #cookiewx-preferences h2 {
        margin: 0 0 10px;
        font-size: 22px;
        line-height: 1.3;
        color: #111;
      }

      #cookiewx-preferences p {
        margin: 0 0 22px;
        font-size: 15px;
        line-height: 1.55;
        color: #444;
      }

      #cookiewx-preferences .cwx-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
      }

      #cookiewx-preferences .cwx-row-copy {
        min-width: 0;
      }

      #cookiewx-preferences strong {
        display: block;
        margin-bottom: 4px;
        font-size: 15px;
        color: #111;
      }

      #cookiewx-preferences small {
        display: block;
        font-size: 13px;
        line-height: 1.5;
        color: #555;
      }

      #cookiewx-preferences .cwx-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }

      #cookiewx-preferences .cwx-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      #cookiewx-preferences .cwx-slider {
        position: absolute;
        inset: 0;
        background-color: #d0d0d0;
        border-radius: 24px;
        transition: background-color .25s ease, box-shadow .25s ease;
        cursor: pointer;
      }

      #cookiewx-preferences .cwx-slider:before {
        content: "";
        position: absolute;
        height: 18px;
        width: 18px;
        left: 3px;
        top: 3px;
        background-color: #fff;
        border-radius: 50%;
        transition: transform .25s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,.3);
      }

      #cookiewx-preferences .cwx-switch input:checked + .cwx-slider {
        background-color: #2ecc71;
      }

      #cookiewx-preferences .cwx-switch input:checked + .cwx-slider:before {
        transform: translateX(20px);
      }

      #cookiewx-preferences .cwx-disabled {
        opacity: .55;
        pointer-events: none;
      }

      #cookiewx-preferences .cwx-prefs-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        flex-wrap: wrap;
        margin-top: 26px;
      }

      #cookiewx-preferences button {
        font-size: 14px;
        padding: 10px 16px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        font-family: inherit;
        font-weight: 700;
        transition: transform .15s ease, box-shadow .15s ease;
      }

      #cookiewx-preferences button:active {
        transform: scale(.96);
      }

      #cookiewx-preferences button[data-cwx-pref-action="cancel"] {
        background: transparent;
        color: #555;
      }

      #cookiewx-preferences button[data-cwx-pref-action="save"] {
        background: #000;
        color: #fff;
        box-shadow: 0 6px 16px rgba(0,0,0,.2);
      }

      @media (max-width: 560px) {
        #cookiewx-preferences {
          align-items: flex-end;
          padding: 0;
        }

        #cookiewx-preferences .cwx-prefs-modal {
          max-height: 90vh;
          border-radius: 18px 18px 0 0;
          padding: 22px;
        }

        #cookiewx-preferences .cwx-prefs-footer {
          display: grid;
          grid-template-columns: 1fr;
        }

        #cookiewx-preferences button {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function showPreferences() {
    if (document.getElementById(IDS.PREFS)) return;

    function mount() {
      if (!document.body) {
        requestAnimationFrame(mount);
        return;
      }

      injectPreferencesStyle();

      var wrap = document.createElement("div");
      wrap.innerHTML = CWX_PREFERENCES_HTML;

      document.body.appendChild(wrap.firstElementChild);

      var existing = readConsentFromStorage();

      if (existing) {
        CWX_TEMP_PREFS = {
          funzionali: existing.funzionali,
          statistici: existing.statistici,
          marketing: existing.marketing
        };
      } else {
        CWX_TEMP_PREFS = {
          funzionali: true,
          statistici: true,
          marketing: true
        };
      }

      document.querySelectorAll("[data-cwx-pref]").forEach(function (el) {
        var key = el.getAttribute("data-cwx-pref");

        if (key === CATEGORY.ESSENZIALI) {
          el.checked = true;
          return;
        }

        el.checked = !!CWX_TEMP_PREFS[key];
      });

      bindPreferencesEvents();
    }

    mount();
  }

  function hidePreferences() {
    var el = document.getElementById(IDS.PREFS);

    if (el) el.remove();
  }

  function bindPreferencesEvents() {
    var root = document.getElementById(IDS.PREFS);

    if (!root) return;

    root.querySelectorAll("[data-cwx-pref]").forEach(function (el) {
      el.onchange = function () {
        var key = el.getAttribute("data-cwx-pref");

        if (key === CATEGORY.ESSENZIALI) return;

        CWX_TEMP_PREFS[key] = !!el.checked;
      };
    });

    var cancel = root.querySelector('[data-cwx-pref-action="cancel"]');
    var save = root.querySelector('[data-cwx-pref-action="save"]');

    if (cancel) {
      cancel.onclick = function () {
        hidePreferences();

        if (!readConsentFromStorage()) {
          showBanner();
        }
      };
    }

    if (save) {
      save.onclick = function () {
        saveConsent(
          {
            essenziali: true,
            funzionali: !!CWX_TEMP_PREFS.funzionali,
            statistici: !!CWX_TEMP_PREFS.statistici,
            marketing: !!CWX_TEMP_PREFS.marketing
          },
          "custom"
        );

        hidePreferences();
        hideBanner();
        showBadge();
        kickReload();
      };
    }
  }


  /* =========================================================
   * CAP. 15 — BADGE FLOTTANTE
   * ========================================================= */

  var CWX_BADGE_HTML =
    '<div id="' + IDS.BADGE + '" class="cwx-badge" title="Preferenze cookie">' +
      '<img src="https://static.wixstatic.com/media/cf36e3_f2adf1efe1ce41079b157e69160ee495~mv2.png" alt="Cookie preferences">' +
    '</div>';

  function injectBadgeStyle() {
    if (document.getElementById(IDS.BADGE_STYLE)) return;
    if (!document.head) return;

    var style = document.createElement("style");
    style.id = IDS.BADGE_STYLE;

    style.textContent = `
      .cwx-badge {
        position: fixed;
        left: 0;
        bottom: 24px;
        cursor: pointer;
        z-index: 2147483647;
        background: none;
        box-shadow: none;
        transform: translateX(-55%);
        opacity: .55;
        transition:
          transform .45s cubic-bezier(0.22, 1, 0.36, 1),
          opacity .25s ease;
        will-change: transform;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        touch-action: manipulation;
      }

      .cwx-badge img {
        width: 36px;
        height: 36px;
        display: block;
        background: transparent !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        pointer-events: none;
        user-select: none;
      }

      .cwx-badge.cwx-open {
        transform: translateX(12px);
        opacity: 1;
      }

      .cwx-badge:hover {
        opacity: 1;
      }

      .cwx-badge.cwx-pulse {
        animation: cwx-pulse 2.2s infinite;
      }

      @keyframes cwx-pulse {
        0%   { transform: translateX(-55%) scale(1); }
        50%  { transform: translateX(-55%) scale(1.08); }
        100% { transform: translateX(-55%) scale(1); }
      }
    `;

    document.head.appendChild(style);
  }

  function showBadge() {
    function mount() {
      if (!document.body) {
        requestAnimationFrame(mount);
        return;
      }

      injectBadgeStyle();

      var el = document.getElementById(IDS.BADGE);

      if (!el) {
        var wrap = document.createElement("div");
        wrap.innerHTML = CWX_BADGE_HTML;
        document.body.appendChild(wrap.firstElementChild);
        bindBadgeEvents();
      }

      el = document.getElementById(IDS.BADGE);

      if (!el) return;

      el.style.display = "block";
      el.classList.remove("cwx-open");

      updateBadgeState();
    }

    mount();
  }

  function hideBadge() {
    var el = document.getElementById(IDS.BADGE);

    if (!el) return;

    el.classList.remove("cwx-open");
    el.style.display = "none";
  }

  function bindBadgeEvents() {
    var el = document.getElementById(IDS.BADGE);

    if (!el) return;

    el.addEventListener("click", function () {
      var isOpen = el.classList.contains("cwx-open");

      if (!isOpen) {
        el.classList.add("cwx-open");
        return;
      }

      hideBanner();
      showPreferences();
    });

    window.addEventListener("scroll", function () {
      el.classList.remove("cwx-open");
    }, { passive: true });
  }

  function updateBadgeState() {
    var el = document.getElementById(IDS.BADGE);

    if (!el) return;

    var c = readConsentFromStorage();

    el.classList.remove("cwx-pulse");

    if (!c) {
      el.title = "Gestisci preferenze cookie";
      el.classList.add("cwx-pulse");
    } else {
      el.title = "Preferenze cookie";
    }
  }


  /* =========================================================
   * CAP. 16 — SALVATAGGIO CONSENSO
   * ========================================================= */

  function saveConsent(preferenze, tipo) {
    try {
      var accettato = !!(
        preferenze.funzionali ||
        preferenze.statistici ||
        preferenze.marketing
      );

      var payload = {
        accettato: accettato,
        preferenze: {
          essenziali: true,
          funzionali: !!preferenze.funzionali,
          statistici: !!preferenze.statistici,
          marketing: !!preferenze.marketing
        },
        tipoConsenso: tipo,
        dataConsenso: new Date().toISOString()
      };

      localStorage.setItem(KEYS.CONSENSO, JSON.stringify(payload));
      localStorage.setItem(KEYS.TICK, String(Date.now()));

      sendConsentToBackend(payload);

      applyConsent(payload.preferenze);

      log("CookieWX: consenso salvato", payload);
    } catch (e) {
      warn("CookieWX: saveConsent error", e);
    }
  }

  function sendConsentToBackend(consensoPayload) {
    try {
      var payload = {
        domain: location.hostname,
        userId: getOrCreateUserId(),
        consenso: consensoPayload,
        referrer: document.referrer || null,
        url: location.href
      };

      fetch(BACKEND.CONSENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});

      log("CookieWX: consenso inviato backend", payload);
    } catch (_) {}
  }


  /* =========================================================
   * CAP. 17 — APPLICAZIONE CONSENSO
   * ========================================================= */

  function applyConsent(consentObj) {
    if (!consentObj) return;

    window.CookieWX.consent = {
      funzionali: !!consentObj.funzionali,
      statistici: !!consentObj.statistici,
      marketing: !!consentObj.marketing
    };

    updateGoogleConsent(window.CookieWX.consent);

    if (!window.CookieWX.consent.statistici) {
      hardDisableGoogle();
    } else {
      reEnableGoogleIfAllowed();
    }

    if (!window.CookieWX.consent.marketing) {
  hardDisableMarketingRuntime();
} else {
  reEnableMarketingRuntimeIfAllowed();
}

    deleteCookiesWithoutConsent();

    enforceIframeTeardown();

    setTimeout(function () {
      deleteCookiesWithoutConsent();
      enforceIframeTeardown();
      resetCheckedFlags();
      scanNow();
      releaseBlockedScripts();
      releaseBlockedIframes();
    }, 50);

    log("CookieWX: consenso applicato", window.CookieWX.consent);
  }

  function applyFromStorage() {
    try {
      cleanupLegacyFavicons();

      var prevVersion = window.CookieWX.regole && window.CookieWX.regole.version
        ? window.CookieWX.regole.version
        : "0";

      var nextRegole = readRegoleFromStorage();

      window.CookieWX.regole = nextRegole;

      if (nextRegole.version !== prevVersion) {
        log("CookieWX: regole aggiornate", nextRegole.version);
        Q.scripts = [];
        Q.iframes = [];
      }

      var consent = readConsentFromStorage();

      if (consent) {
        applyConsent(consent);
        hideBanner();
        showBadge();
      } else {
        window.CookieWX.consent = {
          funzionali: false,
          statistici: false,
          marketing: false
        };

        updateGoogleConsent(window.CookieWX.consent);
hardDisableGoogle();
hardDisableMarketingRuntime();

hideBadge();
showBanner();
        
        deleteCookiesWithoutConsent();
        enforceIframeTeardown();
      }

      bindPolicyLink();

      resetCheckedFlags();
      scanNow();
    } catch (e) {
      warn("CookieWX: applyFromStorage error", e);
    }
  }


  /* =========================================================
   * CAP. 18 — API PUBBLICA
   * ========================================================= */

  window.CookieWX.applyConsent = applyConsent;
  window.CookieWX.applyFromStorage = applyFromStorage;
  window.CookieWX.showPreferences = showPreferences;
  window.CookieWX.showBanner = showBanner;
  window.CookieWX.hideBanner = hideBanner;

  window.CookieWX.track = function (category, payload) {
    try {
      category = normalizeCategory(category);

      if (!hasConsentFor(category)) {
        warn("CookieWX.track bloccato", category, payload);
        return;
      }

      payload = payload || {};

      if (
        (category === CATEGORY.MARKETING || category === CATEGORY.STATISTICI) &&
        typeof window.gtag === "function" &&
        payload.event
      ) {
        window.gtag("event", payload.event, payload.params || {});
      }
    } catch (e) {
      warn("CookieWX.track error", e);
    }
  };


  /* =========================================================
   * CAP. 19 — SYNC STORAGE / POSTMESSAGE
   * ========================================================= */

  window.addEventListener("storage", function (e) {
    if (!e) return;

    if (
      e.key === KEYS.CONSENSO ||
      e.key === KEYS.REGOLE ||
      e.key === KEYS.TICK
    ) {
      log("CookieWX: storage update", e.key);
      applyFromStorage();
    }
  });

  var lastTick = readLocalCompat(KEYS.TICK) || "";

  setInterval(function () {
    var t = readLocalCompat(KEYS.TICK) || "";

    if (t !== lastTick) {
      lastTick = t;
      log("CookieWX: tick changed");
      applyFromStorage();
    }
  }, 400);

  window.addEventListener("message", function (e) {
    if (!e || !e.data) return;

    if (e.data.type === "COOKIEWX_SYNC") {
      if (e.data.regole) {
        window.CookieWX.regole = {
          version: safeString(e.data.regole.version || e.data.regole.updatedAt || Date.now()),
          policyUrl: safeString(e.data.regole.policyUrl || ""),
          cookies: Array.isArray(e.data.regole.cookies) ? e.data.regole.cookies : [],
          scripts: Array.isArray(e.data.regole.scripts) ? e.data.regole.scripts : [],
          iframes: Array.isArray(e.data.regole.iframes) ? e.data.regole.iframes : []
        };

        try {
          localStorage.setItem(KEYS.REGOLE, JSON.stringify(window.CookieWX.regole));
        } catch (_) {}

        log("CookieWX: regole ricevute via postMessage");
      }

      if (e.data.consent) {
        applyConsent(e.data.consent);
        log("CookieWX: consenso ricevuto via postMessage");
      }

      enforceIframeTeardown();
      resetCheckedFlags();
      scanNow();

      return;
    }

    if (e.data.type === "COOKIEWX_CONSENT" && e.data.consent) {
      applyConsent(e.data.consent);
      enforceIframeTeardown();
      resetCheckedFlags();
      scanNow();
    }
  });


  /* =========================================================
   * CAP. 20 — ESCAPE HTML
   * ========================================================= */

  function escapeHtml(value) {
    return safeString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }


  /* =========================================================
   * CAP. 21 — AVVIO
   * ========================================================= */

  function boot() {
    markCurrentScriptSafe();
    installCookieGuard();
    detectGAFromScripts();

    try {
      domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch (_) {}

    applyFromStorage();
    scanNow();

    setTimeout(function () {
      log("CookieWX: delayed apply 500ms");
      detectGAFromScripts();
      applyFromStorage();
    }, 500);

    setTimeout(function () {
      log("CookieWX: delayed apply 1500ms");
      detectGAFromScripts();
      applyFromStorage();
    }, 1500);

    setTimeout(function () {
      log("CookieWX: delayed apply 3000ms");
      detectGAFromScripts();
      applyFromStorage();
    }, 3000);

    log("CookieWX Loader v" + VERSION + " avviato");
  }

  if (document.readyState === "loading") {
    boot();
  } else {
    boot();
  }

})();
