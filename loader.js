/* =========================================================
 * CookieWX Loader v4.6.1
 * Runtime Consent Firewall — versione unica completa
 *
 * Obiettivo:
 * - Banner + preferenze + badge
 * - Nessuna modifica favicon
 * - Fallback sconosciuto = Marketing
 * - Regole DB come fonte quando disponibili
 * - Vendor registry per principali tracker
 * - Blocco runtime: gtag, dataLayer, fbq, ttq, ecc.
 * - Blocco rete: fetch, XHR, sendBeacon
 * - Blocco pixel: Image.src / img.src
 * - Blocco nuovi script/iframe dopo caricamento loader
 * - Placeholder iframe/video bloccati
 * - Pulizia cookie non consentiti
 *
 * Limite tecnico:
 * - Non può annullare richieste già partite prima del loader.
 * - Può però bloccare trasmissioni successive e runtime.
 * ========================================================= */

(function CookieWXLoaderV42() {
  "use strict";

  /* =========================================================
   * CAP. 0 — SAFE BOOT
   * ========================================================= */

  if (window.__COOKIEWX_LOADER_V42__) return;
  window.__COOKIEWX_LOADER_V42__ = true;


  /* =========================================================
   * CAP. 1 — CONFIG
   * ========================================================= */

  var DEBUG = true;
  var VERSION = "4.7.5"; // [S20 2026-09-23] logo powered-by + icona preferenze self-hosted: WebP 72x72 su cdn.cookiewx.com/assets/ (era PNG Wix 733 KB a oggetto su ogni sito cliente); [S19] cache loader max-age=3600 + SWR 24h via _headers CDN

  var KEYS = {
    CONSENSO: "cookiewxConsenso",
    REGOLE: "cookiewxRegole",
    TICK: "cookiewxTick",
    USER_ID: "cookiewxUserId"
  };

  /* [S17b 2026-09-23 — v4.7.3] Garbage collection del localStorage a
   * cambio VERSION. A ogni nuova versione del loader si buttano:
   *  - le cache effimere (config banner, marker "regole mancanti" S15):
   *    vengono riscaricate/ricalcolate subito (config con SWR S14, marker
   *    al primo pull regole);
   *  - QUALSIASI chiave cookiewx* non nella whitelist: retaggi di
   *    versioni passate (es. chiavi rinominate) non restano appesi per
   *    sempre.
   * MAI toccate: CONSENSO e TICK (prova legale del consenso), USER_ID
   * (identita' analytics), REGOLE (fail-safe del blocco se l'API e' giu';
   * si auto-aggiorna al pull, max 5 min). Chiavi platform_app_* (compat
   * era Wix, readLocalCompat) fuori scope: prefisso diverso. */
  var STORAGE_VERSION_KEY = "cookiewxLoaderV";
  var STORAGE_KEEP_KEYS = [
    "cookiewxConsenso", "cookiewxTick", "cookiewxUserId",
    "cookiewxRegole", "cookiewxCfgCacheV1", "cookiewxRegoleMissingV1",
    "cookiewxLoaderV"
  ];
  function gcStorageOnVersionChange() {
    try {
      if (localStorage.getItem(STORAGE_VERSION_KEY) === VERSION) return;
      var keep = {};
      for (var i = 0; i < STORAGE_KEEP_KEYS.length; i++) {
        keep[STORAGE_KEEP_KEYS[i]] = true;
      }
      var keys = Object.keys(localStorage);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (k.indexOf("cookiewx") === 0 && !keep[k]) {
          localStorage.removeItem(k);
        }
      }
      localStorage.removeItem("cookiewxCfgCacheV1");
      localStorage.removeItem("cookiewxRegoleMissingV1");
      localStorage.setItem(STORAGE_VERSION_KEY, VERSION);
    } catch (_) {}
  }

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
    // [BR3 2026-09-15] Inversione pre-cutover: il PRIMARIO del consenso e'
    // il nuovo backend Cloudflare (api.cookiewx.com -> D1, vista dashboard).
    CONSENT_URL: "https://api.cookiewx.com/consent",
    // [BR6 2026-09-16] v4.4.1: secondaria Wix SPENTA. Dopo il cutover U4
    // www.cookiewx.com non e' piu' Wix e la rotta rispondeva 405 a ogni
    // consenso (ignorata in silenzio, ma richiesta sprecata). I consensi
    // vivono solo su D1. Il blocco di invio resta ma e' inattivo (guard
    // su CONSENT_URL_WIX); riattivabile se mai servisse una seconda copia.
    CONSENT_URL_WIX: null,
    WIX_TIMEOUT_MS: 4000
  };

  /* =========================================================
   * NUOVO BACKEND (v4.3) — opzionale, con fallback.
   * [S13 2026-09-22 — v4.6.2] DEFAULT produzione: se window.COOKIEWX_API
   * (o CookieWX.config.apiBase) NON e' valorizzato, API_BASE punta a
   * https://api.cookiewx.com. Prima del fix il default era "" → API null
   * → pullConfigFromBackend() non partiva MAI sui siti reali (nessuno
   * snippet dichiara l'override) e "Personalizza banner" restava muto.
   * L'override da window resta possibile per dev/demo.
   * ========================================================= */
  var API_BASE = String(
    (window.CookieWX && window.CookieWX.config && window.CookieWX.config.apiBase) ||
    window.COOKIEWX_API ||
    "https://api.cookiewx.com"
  ).replace(/\/+$/, "");

  var API = API_BASE
    ? {
        REGOLE: API_BASE + "/api/regole",
        CONFIG: API_BASE + "/api/config",
        // [S13] la produzione espone POST /consent (NON /api/consensi,
        // che era l'endpoint dell'Express dev): con il default di API_BASE
        // questo ramo diventa il percorso PRIMARIO del consenso — un 404
        // qui avrebbe spento la raccolta consensi su tutti i siti.
        CONSENSI: API_BASE + "/consent"
      }
    : null;

  var CATEGORY = {
    ESSENZIALI: "essenziali",
    FUNZIONALI: "funzionali",
    STATISTICI: "statistici",
    MARKETING: "marketing"
  };

  var Q = {
    scripts: [],
    iframes: [],
    manualScripts: [],
    manualIframes: []
  };

  var CWX_TEMP_PREFS = {
    funzionali: true,
    statistici: true,
    marketing: true
  };

  var ORIGINALS = {};


  /* =========================================================
   * CAP. 2 — LOG
   * ========================================================= */

  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, arguments); } catch (_) {}
  }

  function warn() {
    if (!DEBUG) return;
    try { console.warn.apply(console, arguments); } catch (_) {}
  }

    var CWX_TELEMETRY = {
    events: []
  };

  function recordTelemetry(event) {
    try {
      event = event || {};
      event.timestamp = new Date().toISOString();
      event.loaderVersion = VERSION;

      CWX_TELEMETRY.events.push(event);

      if (CWX_TELEMETRY.events.length > 300) {
        CWX_TELEMETRY.events.shift();
      }

      window.postMessage({
        type: "COOKIEWX_TELEMETRY_EVENT",
        event: event
      }, "*");
    } catch (_) {}
  }

  function publishTelemetrySnapshot() {
    try {
      window.postMessage({
        type: "COOKIEWX_TELEMETRY_SNAPSHOT",
        telemetry: {
          events: CWX_TELEMETRY.events.slice(),
          count: CWX_TELEMETRY.events.length
        }
      }, "*");
    } catch (_) {}
  }


  /* =========================================================
   * CAP. 3 — UTILS
   * ========================================================= */

  function safeString(value) {
    return String(value == null ? "" : value).trim();
  }

  /* [BR7 2026-09-16 — v4.5] Chiave sito (legata ad account/abbonamento,
   * backend B11). Letta dallo script tag con cui il loader e' installato:
   * attributo data-cookiewx-key="cwx_..." (preferito) oppure parametro
   * ?k= nell'URL del loader. Se assente: comportamento invariato (solo
   * dominio) — sara' il server (B11) a decidere grace legacy o rifiuto.
   * La chiave nello snippet e' pubblica per natura (come l'ID di Google
   * Analytics): la sicurezza e' nel binding dominio + stato abbonamento.
   * Override opzionale: window.COOKIEWX_SITE_KEY (test/integrazioni). */
  var SITE_KEY = (function () {
    try {
      var forced = safeString(window.COOKIEWX_SITE_KEY);
      if (forced) return forced;
      var s = (typeof document !== "undefined") ? document.currentScript : null;
      if (!s && typeof document !== "undefined") {
        // async/defer: currentScript e' null — cerco lo script del loader
        var all = document.getElementsByTagName("script");
        for (var i = all.length - 1; i >= 0; i--) {
          if (/loader\.js/.test((all[i] && all[i].src) || "")) { s = all[i]; break; }
        }
      }
      if (!s) return "";
      var k = safeString(s.getAttribute("data-cookiewx-key"));
      if (!k) {
        var m = /[?&]k=([^&#]+)/.exec(s.src || "");
        k = m ? safeString(decodeURIComponent(m[1])) : "";
      }
      // sanity: lunghezza ragionevole, niente spazi/controsequenze
      if (k && k.length <= 128 && !/[\s"'<>]/.test(k)) return k;
      return "";
    } catch (_) {
      return "";
    }
  })();

  function lower(value) {
    return safeString(value).toLowerCase();
  }

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

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

  function normalizeCategory(value) {
    var v = lower(value);

    if (!v) return "";

    if (
      v === "essenziale" ||
      v === "essenziali" ||
      v === "essential" ||
      v === "necessary" ||
      v === "necessari" ||
      v === "gestione cookie" ||
      v === "gestione consenso" ||
      v === "cmp"
    ) {
      return CATEGORY.ESSENZIALI;
    }

    if (
      v === "funzionale" ||
      v === "funzionali" ||
      v === "functional" ||
      v === "preferences" ||
      v === "preferenze" ||
      v === "supporto" ||
      v === "pagamenti"
    ) {
      return CATEGORY.FUNZIONALI;
    }

    if (
      v === "statistico" ||
      v === "statistici" ||
      v === "analytics" ||
      v === "analytic" ||
      v === "performance"
    ) {
      return CATEGORY.STATISTICI;
    }

    if (
      v === "marketing" ||
      v === "ads" ||
      v === "advertising" ||
      v === "social" ||
      v === "affiliazione"
    ) {
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

  function getPathname(url) {
    try {
      return new URL(url, location.href).pathname.toLowerCase();
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

  function hostMatches(host, domain) {
    host = lower(host).replace(/^www\./, "");
    domain = lower(domain).replace(/^www\./, "");

    if (!host || !domain) return false;

    return host === domain || host.endsWith("." + domain);
  }

  function isSameSiteUrl(url) {
    var host = getHostname(url);
    var site = getCurrentSiteHost();

    return !!(host && site && hostMatches(host, site));
  }

  function isFaviconOrSiteIconElement(el) {
  try {
    if (!el || !el.tagName) return false;

    var tag = lower(el.tagName);

    if (tag !== "link") return false;

    var rel = lower(el.getAttribute("rel") || "");

    return (
      rel.indexOf("icon") !== -1 ||
      rel.indexOf("shortcut icon") !== -1 ||
      rel.indexOf("apple-touch-icon") !== -1 ||
      rel.indexOf("mask-icon") !== -1 ||
      rel.indexOf("manifest") !== -1
    );
  } catch (_) {
    return false;
  }
}

function isFaviconOrSiteIconUrl(url) {
  url = lower(url);

  return (
    url.indexOf("favicon") !== -1 ||
    url.indexOf("apple-touch-icon") !== -1 ||
    url.indexOf("site.webmanifest") !== -1 ||
    url.indexOf("browserconfig.xml") !== -1 ||
    url.endsWith(".ico")
  );
}

  function getUrlFromInput(input) {
    try {
      if (!input) return "";

      if (typeof input === "string") return input;

      if (input instanceof Request) return input.url || "";

      if (input.href) return input.href;

      return String(input || "");
    } catch (_) {
      return "";
    }
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
    try {
      var direct = localStorage.getItem(key);

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
   * CAP. 5 — STATO GLOBALE
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
   * CAP. 6 — CONSENSO / REGOLE
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
   * CAP. 7 — VENDOR REGISTRY
   * ========================================================= */

  var VENDORS = [
    {
      name: "Wix Analytics",
      category: CATEGORY.STATISTICI,
      hosts: ["frog.wix.com"],
      paths: [],
      cookies: []
    },
    {
      name: "Wix Apps",
      category: CATEGORY.FUNZIONALI,
      hosts: ["panorama.wixapps.net", "wixapps.net"],
      paths: [],
      cookies: []
    },
    {
      name: "Google Tag Manager",
      category: CATEGORY.STATISTICI,
      hosts: ["googletagmanager.com"],
      cookies: []
    },
    {
      name: "Google Analytics",
      category: CATEGORY.STATISTICI,
      hosts: ["google-analytics.com", "analytics.google.com"],
      paths: ["/g/collect", "/collect", "/j/collect"],
      cookies: ["_ga", "_gid", "_gat", "_gat_gtag", "_ga_"]
    },
    {
      name: "Google Ads / DoubleClick",
      category: CATEGORY.MARKETING,
      hosts: [
        "googleadservices.com",
        "doubleclick.net",
        "googlesyndication.com",
        "adservice.google.com"
      ],
      paths: [
        "/pagead/",
        "/ads/",
        "/ccm/",
        "/conversion/",
        "/activityi"
      ],
      cookies: ["_gcl_au", "_gcl_aw", "_gcl_dc", "_gcl_gb", "ide", "test_cookie"]
    },
    {
      name: "Meta Pixel",
      category: CATEGORY.MARKETING,
      hosts: ["facebook.com", "facebook.net", "connect.facebook.net", "instagram.com"],
      paths: ["/tr", "/events"],
      apis: ["fbq", "_fbq"],
      cookies: ["_fbp", "_fbc", "fr"]
    },
    {
      name: "TikTok Pixel",
      category: CATEGORY.MARKETING,
      hosts: ["analytics.tiktok.com", "business-api.tiktok.com", "tiktok.com", "tiktokcdn.com"],
      paths: ["/i18n/pixel", "/api/v2/pixel", "/events"],
      apis: ["ttq"],
      cookies: ["_ttp", "ttclid", "ttcsid"]
    },
    {
      name: "LinkedIn Insight",
      category: CATEGORY.MARKETING,
      hosts: ["linkedin.com", "licdn.com", "snap.licdn.com", "px.ads.linkedin.com"],
      apis: ["lintrk"],
      cookies: ["li_fat_id", "bcookie", "lidc", "bscookie"]
    },
    {
      name: "Microsoft Ads / Bing UET",
      category: CATEGORY.MARKETING,
      hosts: ["bat.bing.com", "bing.com"],
      paths: ["/action", "/bat.js"],
      apis: ["uetq"],
      cookies: ["_uetvid", "_uetsid", "muid"]
    },
    {
      name: "Pinterest Tag",
      category: CATEGORY.MARKETING,
      hosts: ["pinterest.com", "pinimg.com", "ct.pinterest.com", "s.pinimg.com"],
      apis: ["pintrk"],
      cookies: ["_pinterest_ct_ua", "_pin_unauth"]
    },
    {
      name: "Snapchat Pixel",
      category: CATEGORY.MARKETING,
      hosts: ["snapchat.com", "sc-static.net", "tr.snapchat.com"],
      apis: ["snaptr"],
      cookies: ["sc_at"]
    },
    {
      name: "Reddit Ads",
      category: CATEGORY.MARKETING,
      hosts: ["redditstatic.com", "redditmedia.com", "events.redditmedia.com"],
      apis: ["rdt"],
      cookies: ["rdt_uuid"]
    },
    {
      name: "X / Twitter Ads",
      category: CATEGORY.MARKETING,
      hosts: ["ads-twitter.com", "static.ads-twitter.com", "analytics.twitter.com", "twitter.com", "x.com"],
      apis: ["twq"],
      cookies: ["personalization_id"]
    },
    {
      name: "Microsoft Clarity",
      category: CATEGORY.STATISTICI,
      hosts: ["clarity.ms"],
      apis: ["clarity"],
      cookies: ["_clck", "_clsk", "cluid"]
    },
    {
      name: "Hotjar",
      category: CATEGORY.STATISTICI,
      hosts: ["hotjar.com", "hotjar.io"],
      cookies: ["_hjSession", "_hjSessionUser", "_hjIncludedInSessionSample"]
    },
    {
      name: "Segment",
      category: CATEGORY.STATISTICI,
      hosts: ["segment.com", "segment.io", "cdn.segment.com"],
      cookies: ["ajs_anonymous_id", "ajs_user_id"]
    },
    {
      name: "Matomo",
      category: CATEGORY.STATISTICI,
      hosts: ["matomo.cloud", "piwik.pro"],
      cookies: ["_pk_id", "_pk_ses", "_pk_ref"]
    },
    {
      name: "YouTube",
      category: CATEGORY.MARKETING,
      hosts: ["youtube.com", "youtube-nocookie.com", "ytimg.com", "googlevideo.com"],
      cookies: ["yt-remote", "visitor_info1_live", "ysc"]
    },
    {
      name: "Vimeo",
      category: CATEGORY.MARKETING,
      hosts: ["vimeo.com", "player.vimeo.com", "vimeocdn.com"],
      cookies: ["vuid"]
    },
    {
      name: "Google Maps",
      category: CATEGORY.MARKETING,
      hosts: ["maps.googleapis.com", "maps.gstatic.com", "google.com"],
      paths: ["/maps"],
      cookies: ["nid"]
    },
    {
      name: "HubSpot",
      category: CATEGORY.FUNZIONALI,
      hosts: ["hubspot.com", "hs-scripts.com", "hs-analytics.net", "hsforms.net", "usemessages.com"],
      cookies: ["hubspotutk", "__hstc", "__hssc", "__hssrc"]
    },
    {
      name: "Intercom",
      category: CATEGORY.FUNZIONALI,
      hosts: ["intercom.io", "intercomcdn.com"],
      cookies: ["intercom-id", "intercom-session"]
    },
    {
      name: "Tawk.to",
      category: CATEGORY.FUNZIONALI,
      hosts: ["tawk.to", "embed.tawk.to"],
      cookies: ["twk_idm_key"]
    },
    {
      name: "Zendesk",
      category: CATEGORY.FUNZIONALI,
      hosts: ["zendesk.com", "zdassets.com", "zopim.com"],
      cookies: ["__zlcmid"]
    },
    {
      name: "Crisp",
      category: CATEGORY.FUNZIONALI,
      hosts: ["crisp.chat", "client.crisp.chat"],
      cookies: ["crisp-client"]
    },
    {
      name: "Stripe",
      category: CATEGORY.FUNZIONALI,
      hosts: ["stripe.com", "js.stripe.com"],
      cookies: ["__stripe_mid", "__stripe_sid"]
    },
    {
      name: "PayPal",
      category: CATEGORY.FUNZIONALI,
      hosts: ["paypal.com", "paypalobjects.com"],
      cookies: ["paypal"]
    }
  ];

  function findVendorByUrl(url) {
    var host = getHostname(url);
    var path = getPathname(url);

    if (!host) return null;

    for (var i = 0; i < VENDORS.length; i++) {
      var vendor = VENDORS[i];

      var hostHit = (vendor.hosts || []).some(function (d) {
        return hostMatches(host, d);
      });

      if (!hostHit) continue;

      if (vendor.paths && vendor.paths.length) {
        var pathHit = vendor.paths.some(function (p) {
          return path.indexOf(lower(p)) !== -1 || lower(url).indexOf(lower(p)) !== -1;
        });

        if (pathHit) return vendor;

        return vendor;
      }

      return vendor;
    }

    return null;
  }

  function findVendorByCookie(name) {
    name = lower(name);

    if (!name) return null;

    for (var i = 0; i < VENDORS.length; i++) {
      var vendor = VENDORS[i];

      var hit = (vendor.cookies || []).some(function (pattern) {
        pattern = lower(pattern);

        if (!pattern) return false;

        return name === pattern || name.indexOf(pattern) === 0;
      });

      if (hit) return vendor;
    }

    return null;
  }

  function findVendorByApi(api) {
    api = lower(api);

    if (!api) return null;

    for (var i = 0; i < VENDORS.length; i++) {
      var vendor = VENDORS[i];

      var hit = (vendor.apis || []).some(function (x) {
        return lower(x) === api;
      });

      if (hit) return vendor;
    }

    return null;
  }


  /* =========================================================
   * CAP. 8 — REGOLE DATABASE
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

  // [S18] true se l'ago e' la PURA ORIGINE con scheme ("https://host" o
  // "https://host/"): un ago cosi' non deve mai matchare per sottostringa
  // URL di origini diverse (es. "https://sito.it" inghiotteva anche
  // "https://sito.it.cdn.altro.com/..."). Per URL diversi dall'origine
  // esatta dell'ago: niente match. Gli aghi host-nudi ("googletagmanager.com")
  // restano invariati: sono il formato legittimo delle regole vendor.
  function bareOriginSchemeHost(needle) {
    var m = /^https?:\/\/([^/?#\s]+)\/?$/i.exec(needle || "");
    return m ? m[1].replace(/^www\./, "").toLowerCase() : "";
  }

  function urlMatchesNeedle(url, needle) {
    url = lower(url);
    needle = lower(needle);

    if (!url || !needle) return false;

    // [S18] ago bare-origin con scheme: solo match di origine ESATTA
    var bareHost = bareOriginSchemeHost(needle);
    if (bareHost) {
      return getHostname(url) === bareHost;
    }

    if (url.indexOf(needle) !== -1) return true;

    var host = getHostname(url);
    var needleHost = "";

    try {
      needleHost = new URL(needle, location.href).hostname.replace(/^www\./, "").toLowerCase();
    } catch (_) {
      needleHost = needle.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase();
    }

    if (!host || !needleHost) return false;

    return hostMatches(host, needleHost);
  }

  // [S18] true se l'ago specifica un PATH oltre all'origine
  // ("https://host/tracker.js", "host.com/gtm.js"). Un ago senza path
  // (origine pura o host nudo) NON puo' classificare risorse same-site:
  // e' quasi sempre un dato sporco dello scanner (documento base
  // classificato al posto dello script, vedi S18 lato dati).
  function needleHasPath(needle) {
    var rest = String(needle || "").replace(/^https?:\/\//i, "");
    var slash = rest.indexOf("/");
    return slash !== -1 && rest.length > slash + 1;
  }

  function categoryFromDbUrlRule(list, url, onlyPathNeedles) {
    if (!Array.isArray(list) || !url) return "";

    for (var i = 0; i < list.length; i++) {
      var rule = list[i];
      var needles = getRuleNeedles(rule);

      for (var j = 0; j < needles.length; j++) {
        if (onlyPathNeedles && !needleHasPath(needles[j])) continue;
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
   * CAP. 9 — CATEGORY RESOLVER UNICO
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

  function isTechnicalEssentialUrl(url) {
    var host = getHostname(url);

    if (!host) return false;

    if (isSameSiteUrl(url)) return true;

    var technicalHosts = [
      "cookiewx.com",
      "cookiewx-cdn.pages.dev",

      "challenges.cloudflare.com",

      "wixstatic.com",
      "wixsite.com",
      "wixmp.com",
      "wixdns.net",
      "static.parastorage.com",
      "siteassets.parastorage.com",
      "parastorage.com"
    ];

    return technicalHosts.some(function (d) {
      return hostMatches(host, d);
    });
  }

  function resolveCookie(name) {
    name = lower(name);

    if (!name) {
      return {
        kind: "cookie",
        value: name,
        category: CATEGORY.MARKETING,
        vendor: "Sconosciuto",
        source: "fallback"
      };
    }

    var catDb = categoryFromDbCookieRule(name);

    if (catDb) {
      return {
        kind: "cookie",
        value: name,
        category: catDb,
        vendor: "Regola database",
        source: "db"
      };
    }

    var vendor = findVendorByCookie(name);

    if (vendor) {
      return {
        kind: "cookie",
        value: name,
        category: vendor.category,
        vendor: vendor.name,
        source: "vendor"
      };
    }

    if (isEssentialCookieName(name)) {
      return {
        kind: "cookie",
        value: name,
        category: CATEGORY.ESSENZIALI,
        vendor: "Tecnico essenziale",
        source: "fallback"
      };
    }

    if (
      name.indexOf("_ga") === 0 ||
      name.indexOf("_gid") === 0 ||
      name.indexOf("_gat") === 0 ||
      name.indexOf("__utm") === 0
    ) {
      return {
        kind: "cookie",
        value: name,
        category: CATEGORY.STATISTICI,
        vendor: "Analytics fallback",
        source: "fallback"
      };
    }

    if (
      name.indexOf("_fb") === 0 ||
      name === "fr" ||
      name.indexOf("_gcl") === 0
    ) {
      return {
        kind: "cookie",
        value: name,
        category: CATEGORY.MARKETING,
        vendor: "Marketing fallback",
        source: "fallback"
      };
    }

    return {
      kind: "cookie",
      value: name,
      category: CATEGORY.MARKETING,
      vendor: "Sconosciuto",
      source: "fallback"
    };
  }

    function getForcedCriticalUrlInfo(kind, url) {
    var host = getHostname(url);
    var path = getPathname(url);
    var full = lower(url);

    if (!host) return null;

      // Cloudflare Turnstile / Challenge Platform: sicurezza anti-bot, essenziale
if (
  hostMatches(host, "challenges.cloudflare.com") ||
  full.indexOf("challenges.cloudflare.com/turnstile") !== -1 ||
  full.indexOf("challenges.cloudflare.com/cdn-cgi/challenge-platform") !== -1
) {
  return {
    kind: kind,
    value: url,
    category: CATEGORY.ESSENZIALI,
    vendor: "Cloudflare Turnstile",
    source: "forced-security"
  };
}

      // Supabase Auth: autenticazione richiesta dall'utente, essenziale
if (
  hostMatches(host, "supabase.co") &&
  path.indexOf("/auth/v1/") === 0
) {
  return {
    kind: kind,
    value: url,
    category: CATEGORY.ESSENZIALI,
    vendor: "Supabase Auth",
    source: "forced-auth"
  };
}

    // Wix Analytics: statistico, non essenziale
    if (hostMatches(host, "frog.wix.com")) {
      return {
        kind: kind,
        value: url,
        category: CATEGORY.STATISTICI,
        vendor: "Wix Analytics",
        source: "forced"
      };
    }

    // Wix Apps: funzionale, non essenziale
    if (
      hostMatches(host, "panorama.wixapps.net") ||
      hostMatches(host, "wixapps.net")
    ) {
      return {
        kind: kind,
        value: url,
        category: CATEGORY.FUNZIONALI,
        vendor: "Wix Apps",
        source: "forced"
      };
    }

    // Google Ads / DoubleClick
    if (
      hostMatches(host, "doubleclick.net") ||
      hostMatches(host, "googleads.g.doubleclick.net") ||
      hostMatches(host, "ad.doubleclick.net") ||
      hostMatches(host, "googleadservices.com") ||
      hostMatches(host, "googlesyndication.com") ||
      full.indexOf("google.com/pagead") !== -1 ||
      full.indexOf("google.it/pagead") !== -1 ||
      full.indexOf("google.com/ads") !== -1 ||
      full.indexOf("google.it/ads") !== -1 ||
      full.indexOf("google.com/ccm") !== -1 ||
      path.indexOf("/pagead") !== -1 ||
      path.indexOf("/conversion") !== -1 ||
      path.indexOf("/activityi") !== -1
    ) {
      return {
        kind: kind,
        value: url,
        category: CATEGORY.MARKETING,
        vendor: "Google Ads / DoubleClick",
        source: "forced"
      };
    }

    // GTM / Analytics
    if (
      hostMatches(host, "googletagmanager.com") ||
      hostMatches(host, "google-analytics.com") ||
      hostMatches(host, "analytics.google.com") ||
      hostMatches(host, "region1.google-analytics.com")
    ) {
      return {
        kind: kind,
        value: url,
        category: CATEGORY.STATISTICI,
        vendor: "Google Analytics / Tag Manager",
        source: "forced"
      };
    }

    return null;
  }

  function getKnownBackendUrlInfo(kind, url) {
  var host = getHostname(url);
  var path = getPathname(url);

  if (!host) return null;

  // Progetti Supabase: <project-ref>.supabase.co
  if (!hostMatches(host, "supabase.co")) {
    return null;
  }

  var isOfficialSupabaseBackend =
    path.indexOf("/auth/v1/") === 0 ||
    path.indexOf("/rest/v1/") === 0 ||
    path.indexOf("/storage/v1/") === 0 ||
    path.indexOf("/realtime/v1/") === 0 ||
    path.indexOf("/functions/v1/") === 0;

  if (!isOfficialSupabaseBackend) {
    return null;
  }

  return {
    kind: kind,
    value: url,
    category: CATEGORY.ESSENZIALI,
    vendor: "Supabase Backend",
    source: "known-backend"
  };
}

  function resolveUrl(kind, url) {
    url = safeString(url);

    if (!url) {
      return {
        kind: kind,
        value: url,
        category: CATEGORY.MARKETING,
        vendor: "Sconosciuto",
        source: "fallback"
      };
    }

    var forced = getForcedCriticalUrlInfo(kind, url);

    if (forced) {
      return forced;
    }

    var list = [];

    if (kind === "script") list = window.CookieWX.regole.scripts || [];
    if (kind === "iframe") list = window.CookieWX.regole.iframes || [];
    if (kind === "request" || kind === "pixel" || kind === "beacon") {
      list = []
        .concat(window.CookieWX.regole.scripts || [])
        .concat(window.CookieWX.regole.iframes || []);
    }

// [S18] same-site = MAI bloccato: le risorse caricate dall'origine del
// sito stesso (o suoi sottodomini) sono first-party → ESSENZIALI, prima
// ancora delle regole DB. Unica eccezione: una regola DB con ago su PATH
// specifico (es. "https://sito.it/tracker.js") — una regola bare-origin
// tipo "https://sito.it" → statistici e' un dato sporco dello scanner e
// non puo' piu' inghiottire tutti gli script del sito (bug smartincrelations
// 23/09: chunk /_next/* bloccati pre-consenso).
if (isSameSiteUrl(url)) {
  var catDbPath = categoryFromDbUrlRule(list, url, true);

  if (catDbPath) {
    return {
      kind: kind,
      value: url,
      category: catDbPath,
      vendor: "Regola database",
      source: "db-path"
    };
  }

  return {
    kind: kind,
    value: url,
    category: CATEGORY.ESSENZIALI,
    vendor: "First-party (same-site)",
    source: "same-site"
  };
}

var catDb = categoryFromDbUrlRule(list, url);

if (catDb) {
  return {
    kind: kind,
    value: url,
    category: catDb,
    vendor: "Regola database",
    source: "db"
  };
}

// Backend tecnici noti
var knownBackend = getKnownBackendUrlInfo(kind, url);

if (knownBackend) {
  return knownBackend;
}

var vendor = findVendorByUrl(url);

    if (vendor) {
      return {
        kind: kind,
        value: url,
        category: vendor.category,
        vendor: vendor.name,
        source: "vendor"
      };
    }

    if (isTechnicalEssentialUrl(url)) {
      return {
        kind: kind,
        value: url,
        category: CATEGORY.ESSENZIALI,
        vendor: "Tecnico essenziale",
        source: "fallback"
      };
    }

    return {
      kind: kind,
      value: url,
      category: CATEGORY.MARKETING,
      vendor: "Sconosciuto",
      source: "fallback"
    };
  }

  function resolveResource(kind, value) {
    if (kind === "cookie") return resolveCookie(value);

    return resolveUrl(kind, value);
  }

  function canUse(kind, value) {
    var info = resolveResource(kind, value);

    return hasConsentFor(info.category);
  }

  function shouldBlock(kind, value) {
    return !canUse(kind, value);
  }


  /* =========================================================
   * CAP. 10 — GOOGLE CONSENT FIREWALL
   * ========================================================= */

  window.dataLayer = window.dataLayer || [];

  function installGoogleConsentDefaults() {
    try {
      window.dataLayer = window.dataLayer || [];
      window.__COOKIEWX_GA_IDS__ = window.__COOKIEWX_GA_IDS__ || [];

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

      log("CookieWX: Google Consent default denied");
    } catch (e) {
      warn("CookieWX: Google default denied error", e);
    }
  }

  function detectGAFromScripts() {
    try {
      window.__COOKIEWX_GA_IDS__ = window.__COOKIEWX_GA_IDS__ || [];

      document.querySelectorAll('script[src*="gtag/js?id="], script[src*="googletagmanager.com/gtag/js"]').forEach(function (s) {
        var src = s.getAttribute("src") || "";
        var match = src.match(/[?&]id=([^&]+)/);

        if (!match) return;

        var id = match[1];

        if (window.__COOKIEWX_GA_IDS__.indexOf(id) === -1) {
          window.__COOKIEWX_GA_IDS__.push(id);
        }

        if (!hasConsentFor(CATEGORY.STATISTICI)) {
          window["ga-disable-" + id] = true;
        }
      });
    } catch (_) {}
  }

  function updateGoogleConsent(consent) {
    try {
      var update = {
        ad_storage: consent.marketing ? "granted" : "denied",
        analytics_storage: consent.statistici ? "granted" : "denied",
        ad_user_data: consent.marketing ? "granted" : "denied",
        ad_personalization: consent.marketing ? "granted" : "denied",
        functionality_storage: consent.funzionali ? "granted" : "denied",
        personalization_storage: consent.funzionali ? "granted" : "denied",
        security_storage: "granted"
      };

      window.dataLayer = window.dataLayer || [];

      window.dataLayer.push(["consent", "update", update]);

      if (typeof ORIGINALS.gtag === "function") {
        ORIGINALS.gtag("consent", "update", update);
      }

      log("CookieWX: Google Consent update", update);
    } catch (e) {
      warn("CookieWX: updateGoogleConsent error", e);
    }
  }

  function classifyGtagCall(args) {
    try {
      var command = args && args[0];

      if (command === "consent") {
        return CATEGORY.ESSENZIALI;
      }

      if (command === "config") {
        return CATEGORY.STATISTICI;
      }

      if (command === "event") {
        return CATEGORY.MARKETING;
      }

      if (command === "set") {
        return CATEGORY.FUNZIONALI;
      }

      return CATEGORY.MARKETING;
    } catch (_) {
      return CATEGORY.MARKETING;
    }
  }

  function installDataLayerAndGtagFirewall() {
    try {
      if (window.__COOKIEWX_GOOGLE_FIREWALL__) return;
      window.__COOKIEWX_GOOGLE_FIREWALL__ = true;

      window.dataLayer = window.dataLayer || [];

      ORIGINALS.dataLayerPush = window.dataLayer.push.bind(window.dataLayer);
      ORIGINALS.gtag = typeof window.gtag === "function"
        ? window.gtag
        : function () {
          ORIGINALS.dataLayerPush(arguments);
        };

      window.dataLayer.push = function () {
        var item = arguments[0];

        try {
          if (Array.isArray(item)) {
            var category = classifyGtagCall(item);

            if (!hasConsentFor(category)) {
              warn("CookieWX: dataLayer bloccato", category, item);
              return window.dataLayer.length;
            }

            if (item[0] === "config" && typeof item[1] === "string") {
              window.__COOKIEWX_GA_IDS__ = window.__COOKIEWX_GA_IDS__ || [];

              if (window.__COOKIEWX_GA_IDS__.indexOf(item[1]) === -1) {
                window.__COOKIEWX_GA_IDS__.push(item[1]);
              }

              window["ga-disable-" + item[1]] = !hasConsentFor(CATEGORY.STATISTICI);
            }
          }
        } catch (_) {}

        return ORIGINALS.dataLayerPush.apply(window.dataLayer, arguments);
      };

      window.gtag = function () {
        var args = Array.prototype.slice.call(arguments);
        var category = classifyGtagCall(args);

        if (!hasConsentFor(category)) {
          warn("CookieWX: gtag bloccato", category, args);
          return;
        }

        return window.dataLayer.push(args);
      };

      log("CookieWX: Google runtime firewall installato");
    } catch (e) {
      warn("CookieWX: installDataLayerAndGtagFirewall error", e);
    }
  }

  function hardDisableGoogleRuntime() {
    try {
      detectGAFromScripts();

      window.__COOKIEWX_GA_IDS__ = window.__COOKIEWX_GA_IDS__ || [];

      window.__COOKIEWX_GA_IDS__.forEach(function (id) {
        window["ga-disable-" + id] = true;
      });

      if (window.ga) {
        window.ga = function () {
          warn("CookieWX: ga bloccato");
        };
      }

      log("CookieWX: Google runtime disabled");
    } catch (e) {
      warn("CookieWX: hardDisableGoogleRuntime error", e);
    }
  }

  function reEnableGoogleRuntimeIfAllowed() {
    try {
      if (!hasConsentFor(CATEGORY.STATISTICI) && !hasConsentFor(CATEGORY.MARKETING)) return;

      detectGAFromScripts();

      window.__COOKIEWX_GA_IDS__ = window.__COOKIEWX_GA_IDS__ || [];

      window.__COOKIEWX_GA_IDS__.forEach(function (id) {
        window["ga-disable-" + id] = !hasConsentFor(CATEGORY.STATISTICI);
      });

      updateGoogleConsent(window.CookieWX.consent);

      if (hasConsentFor(CATEGORY.STATISTICI)) {
        window.__COOKIEWX_GA_IDS__.forEach(function (id) {
          try {
            window.gtag("config", id);
            window.gtag("event", "page_view");
          } catch (_) {}
        });
      }

      log("CookieWX: Google runtime riattivato se consentito");
    } catch (e) {
      warn("CookieWX: reEnableGoogleRuntimeIfAllowed error", e);
    }
  }


  /* =========================================================
   * CAP. 11 — MARKETING API FIREWALL
   * ========================================================= */

  function installMarketingApiFirewall() {
    try {
      if (window.__COOKIEWX_MARKETING_API_FIREWALL__) return;
      window.__COOKIEWX_MARKETING_API_FIREWALL__ = true;

      [
        "fbq",
        "_fbq",
        "ttq",
        "lintrk",
        "pintrk",
        "snaptr",
        "twq",
        "rdt",
        "uetq",
        "clarity"
      ].forEach(function (api) {
        var vendor = findVendorByApi(api);
        var category = vendor ? vendor.category : CATEGORY.MARKETING;

        ORIGINALS["api_" + api] = window[api];

        window[api] = function () {
          if (!hasConsentFor(category)) {
            warn("CookieWX: API runtime bloccata", api, category, arguments);
            return;
          }

          if (typeof ORIGINALS["api_" + api] === "function") {
            return ORIGINALS["api_" + api].apply(this, arguments);
          }
        };
      });

      log("CookieWX: Marketing API firewall installato");
    } catch (e) {
      warn("CookieWX: installMarketingApiFirewall error", e);
    }
  }


  /* =========================================================
   * CAP. 12 — NETWORK FIREWALL
   * ========================================================= */

  function isCookieWXInternalUrl(url) {
    var host = getHostname(url);

    return hostMatches(host, "cookiewx.com") || hostMatches(host, "cookiewx-cdn.pages.dev");
  }

    function canTransmit(kind, url) {
    if (!url) return true;

    if (isCookieWXInternalUrl(url)) {
      recordTelemetry({
        type: kind,
        action: "allowed",
        category: CATEGORY.ESSENZIALI,
        vendor: "CookieWX",
        url: url,
        reason: "cookiewx_internal"
      });

      return true;
    }

    var info = resolveResource(kind, url);

    if (!hasConsentFor(info.category)) {
      warn("CookieWX: trasmissione bloccata", kind, info.category, info.vendor, url);

      recordTelemetry({
        type: kind,
        action: "blocked",
        category: info.category,
        vendor: info.vendor || "",
        url: url,
        reason: "missing_consent"
      });

      return false;
    }

    recordTelemetry({
      type: kind,
      action: "allowed",
      category: info.category,
      vendor: info.vendor || "",
      url: url,
      reason: "consent_granted"
    });

    return true;
  }

  function installFetchFirewall() {
    try {
      if (window.__COOKIEWX_FETCH_FIREWALL__) return;
      window.__COOKIEWX_FETCH_FIREWALL__ = true;

      if (!window.fetch) return;

      ORIGINALS.fetch = window.fetch.bind(window);

      window.fetch = function (input, init) {
        var url = getUrlFromInput(input);

        if (!canTransmit("request", url)) {
          if (typeof Response !== "undefined") {
            return Promise.resolve(new Response("", {
              status: 204,
              statusText: "CookieWX blocked"
            }));
          }

          return Promise.reject(new Error("CookieWX blocked"));
        }

        return ORIGINALS.fetch(input, init);
      };

      log("CookieWX: fetch firewall installato");
    } catch (e) {
      warn("CookieWX: installFetchFirewall error", e);
    }
  }

  function installXHRFirewall() {
    try {
      if (window.__COOKIEWX_XHR_FIREWALL__) return;
      window.__COOKIEWX_XHR_FIREWALL__ = true;

      if (!window.XMLHttpRequest) return;

      ORIGINALS.xhrOpen = XMLHttpRequest.prototype.open;
      ORIGINALS.xhrSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          this.__cwx_url = url;
          this.__cwx_method = method;
        } catch (_) {}

        return ORIGINALS.xhrOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function () {
        var url = "";

        try {
          url = this.__cwx_url || "";
        } catch (_) {}

        if (url && !canTransmit("request", url)) {
          try {
            this.abort();
          } catch (_) {}

          warn("CookieWX: XHR bloccato", url);
          return;
        }

        return ORIGINALS.xhrSend.apply(this, arguments);
      };

      log("CookieWX: XHR firewall installato");
    } catch (e) {
      warn("CookieWX: installXHRFirewall error", e);
    }
  }

  function installBeaconFirewall() {
    try {
      if (window.__COOKIEWX_BEACON_FIREWALL__) return;
      window.__COOKIEWX_BEACON_FIREWALL__ = true;

      if (!navigator.sendBeacon) return;

      ORIGINALS.sendBeacon = navigator.sendBeacon.bind(navigator);

      navigator.sendBeacon = function (url, data) {
        if (!canTransmit("beacon", url)) {
          warn("CookieWX: sendBeacon bloccato", url);
          return true;
        }

        return ORIGINALS.sendBeacon(url, data);
      };

      log("CookieWX: sendBeacon firewall installato");
    } catch (e) {
      warn("CookieWX: installBeaconFirewall error", e);
    }
  }

  function installImagePixelFirewall() {
    try {
      if (window.__COOKIEWX_IMAGE_FIREWALL__) return;
      window.__COOKIEWX_IMAGE_FIREWALL__ = true;

      var proto = window.HTMLImageElement && window.HTMLImageElement.prototype;

      if (!proto) return;

      var desc = Object.getOwnPropertyDescriptor(proto, "src");

      if (desc && desc.set && desc.get && desc.configurable !== false) {
        ORIGINALS.imageSrcDescriptor = desc;

        Object.defineProperty(proto, "src", {
          configurable: true,
          enumerable: desc.enumerable,

          get: function () {
            return desc.get.call(this);
          },

          set: function (value) {
            var url = safeString(value);

            if (url && !canTransmit("pixel", url)) {
              this.setAttribute("data-cwx-blocked-pixel", url);
              warn("CookieWX: Image.src bloccato", url);
              return;
            }

            return desc.set.call(this, value);
          }
        });
      }

      log("CookieWX: Image pixel firewall installato");
    } catch (e) {
      warn("CookieWX: installImagePixelFirewall error", e);
    }
  }


  /* =========================================================
   * CAP. 13 — COOKIE GUARD
   * ========================================================= */

  function installCookieGuard() {
  try {
    if (window.__COOKIEWX_COOKIE_GUARD__) return;

    var proto = Document.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, "cookie");

    if (!descriptor || !descriptor.set || !descriptor.get || descriptor.configurable === false) {
      warn("CookieWX: document.cookie non intercettabile");
      return;
    }

    window.__COOKIEWX_COOKIE_GUARD__ = true;
    ORIGINALS.cookieDescriptor = descriptor;

    Object.defineProperty(proto, "cookie", {
      configurable: true,
      enumerable: descriptor.enumerable,

      get: function () {
        return descriptor.get.call(document);
      },

      set: function (value) {
        try {
          var name = lower(String(value).split("=")[0]);
          var info = resolveResource("cookie", name);

          if (!hasConsentFor(info.category)) {
            warn("CookieWX: cookie write bloccato", name, info.category, info.vendor);
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

        var info = resolveResource("cookie", name);

        if (!hasConsentFor(info.category)) {
          deleteCookieEverywhere(name);
          log("CookieWX: cookie eliminato", name, info.category, info.vendor);
        }
      });
    } catch (e) {
      warn("CookieWX: deleteCookiesWithoutConsent error", e);
    }
  }


  /* =========================================================
   * CAP. 14 — DOM / SCRIPT / IFRAME FIREWALL
   * ========================================================= */

  function markCurrentScriptSafe() {
    try {
      if (document.currentScript) {
        document.currentScript.setAttribute("data-cwx-checked", "1");
        document.currentScript.setAttribute("data-cwx-safe", "1");
      }
    } catch (_) {}
  }

  function getNodeSrc(node) {
    if (!node || node.nodeType !== 1) return "";

    return (
      node.getAttribute("src") ||
      node.getAttribute("data-src") ||
      node.getAttribute("data-lazy-src") ||
      node.getAttribute("data-cookiewx-src") ||
      node.getAttribute("data-cwx-src") ||
      ""
    );
  }

  function blockScript(el, src, info) {
    try {
      if (!el || !src) return;

      info = info || resolveResource("script", src);

      el.setAttribute("data-cwx-blocked", "1");
      el.setAttribute("data-cwx-category", info.category);
      el.setAttribute("data-cwx-vendor", info.vendor || "");
      el.setAttribute("data-cwx-src", src);

      // [S18] conserva il type originale (module, importmap...) prima di
      // inerzializzare: al rilascio verra' ripristinato sul clone.
      try {
        var origType = el.getAttribute("type");
        if (origType && lower(origType) !== "text/plain") {
          el.setAttribute("data-cwx-type", origType);
        }
      } catch (_) {}

      try {
        el.type = "text/plain";
      } catch (_) {}

      el.removeAttribute("src");

      Q.scripts.push(el);

      log("CookieWX: script bloccato", info.category, info.vendor, src);

      recordTelemetry({
        type: "script",
        action: "blocked",
        category: info.category,
        vendor: info.vendor || "",
        url: src,
        reason: "missing_consent_dom"
      });
      
    } catch (e) {
      warn("CookieWX: blockScript error", e);
    }
  }

  function handleScriptElement(el) {
    try {
      if (!el) return;
      if (el.getAttribute("data-cwx-checked")) return;
      if (el.getAttribute("data-cwx-safe")) return;
      if (el.getAttribute("data-cookiewx")) return;

      el.setAttribute("data-cwx-checked", "1");

      var src = el.getAttribute("src");

      if (!src) return;

      var info = resolveResource("script", src);

      if (!hasConsentFor(info.category)) {
        blockScript(el, src, info);
      }
    } catch (e) {
      warn("CookieWX: handleScriptElement error", e);
    }
  }

  function releaseBlockedScripts() {
    var list = Q.scripts.slice();
    Q.scripts = [];

    list.forEach(function (oldEl) {
      try {
        var src = oldEl.getAttribute("data-cwx-src");
        var category = oldEl.getAttribute("data-cwx-category") || CATEGORY.MARKETING;

        if (!src) return;

        if (!hasConsentFor(category)) {
          Q.scripts.push(oldEl);
          return;
        }

        var s = document.createElement("script");

        Array.prototype.slice.call(oldEl.attributes || []).forEach(function (attr) {
          if (attr.name.indexOf("data-cwx") === 0) return;
          if (attr.name === "type") return;
          if (attr.name === "src") return;

          try {
            s.setAttribute(attr.name, attr.value);
          } catch (_) {}
        });

        // [S18] ripristina il type originale (module, importmap...) salvato
        // al blocco in data-cwx-type: senza, un type="module" rilasciato
        // come script classico genera la tempesta di SyntaxError vista su
        // smartincrelations.it (chunk /_next/*).
        var cwxOrigType = oldEl.getAttribute("data-cwx-type") || "";
        if (cwxOrigType) {
          try {
            s.setAttribute("type", cwxOrigType);
          } catch (_) {}
        }

        s.setAttribute("data-cwx-safe", "1");
        s.src = src;

        if (oldEl.parentNode) {
          oldEl.parentNode.insertBefore(s, oldEl.nextSibling);
        } else if (document.head) {
          document.head.appendChild(s);
        }

        log("CookieWX: script rilasciato", category, src);
      } catch (e) {
        warn("CookieWX: releaseBlockedScripts error", e);
      }
    });
  }

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

  function createIframePlaceholder(iframe, src, info) {
    try {
      injectPlaceholderStyle();

      var existingId = iframe.getAttribute("data-cwx-placeholder-id");

      if (existingId) {
        var old = document.getElementById(existingId);
        if (old) return old;
      }

      info = info || resolveResource("iframe", src);

      var id = "cwx-ph-" + Math.random().toString(16).slice(2);
      var size = getIframeDisplaySize(iframe);
      var policyUrl = getPolicyUrl();

      var box = document.createElement("div");
      box.id = id;
      box.className = "cwx-placeholder";
      box.setAttribute("data-cwx-placeholder-for", src || "");
      box.setAttribute("data-cwx-category", info.category || CATEGORY.MARKETING);
      box.style.minHeight = size.height;

      if (size.width !== "100%") {
        box.style.maxWidth = size.width;
      }

      box.innerHTML =
        '<div class="cwx-placeholder-inner">' +
          '<div class="cwx-placeholder-title">Contenuto bloccato per preferenze cookie</div>' +
          '<div class="cwx-placeholder-text">' +
            'Per visualizzare questo elemento devi accettare i cookie ' +
            '<strong>' + escapeHtml(categoryLabel(info.category)) + '</strong>.' +
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

  function blockIframe(el, src, info) {
    try {
      if (!el || !src) return;

      info = info || resolveResource("iframe", src);

      el.setAttribute("data-cwx-blocked", "1");
      el.setAttribute("data-cwx-category", info.category);
      el.setAttribute("data-cwx-vendor", info.vendor || "");
      el.setAttribute("data-cwx-src", src);

      if (!el.getAttribute("data-cwx-original-display")) {
        el.setAttribute("data-cwx-original-display", el.style.display || "");
      }

      createIframePlaceholder(el, src, info);

      el.setAttribute("src", "about:blank");
      el.style.display = "none";

      Q.iframes.push(el);

      log("CookieWX: iframe bloccato", info.category, info.vendor, src);

      recordTelemetry({
        type: "iframe",
        action: "blocked",
        category: info.category,
        vendor: info.vendor || "",
        url: src,
        reason: "missing_consent_dom"
      });
      
    } catch (e) {
      warn("CookieWX: blockIframe error", e);
    }
  }

  function handleIframeElement(el) {
    try {
      if (!el) return;
      if (el.getAttribute("data-cwx-checked")) return;
      if (el.getAttribute("data-cookiewx")) return;

      el.setAttribute("data-cwx-checked", "1");

      var src = getNodeSrc(el);

      if (!src || src === "about:blank") return;

      var info = resolveResource("iframe", src);

      if (!hasConsentFor(info.category)) {
        blockIframe(el, src, info);
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

        if (!hasConsentFor(category)) {
          Q.iframes.push(el);
          return;
        }

        removeIframePlaceholder(el);

        el.style.display = el.getAttribute("data-cwx-original-display") || "";
        el.setAttribute("src", src);
        el.removeAttribute("data-cwx-blocked");

        log("CookieWX: iframe rilasciato", category, src);
      } catch (_) {}
    });
  }

  function enforceIframeTeardown() {
    try {
      document.querySelectorAll("iframe").forEach(function (iframe) {
        var src = getNodeSrc(iframe);

        if (!src || src === "about:blank") return;

        var info = resolveResource("iframe", src);

        if (!hasConsentFor(info.category)) {
          if (!iframe.getAttribute("data-cwx-src")) {
            iframe.setAttribute("data-cwx-src", src);
          }

          blockIframe(iframe, src, info);
          return;
        }

        removeIframePlaceholder(iframe);
      });
    } catch (e) {
      warn("CookieWX: enforceIframeTeardown error", e);
    }
  }


  /* =========================================================
   * CAP. 15 — MANUAL TAGGING SUPPORT
   * ========================================================= */

  function scanManualTaggedElements() {
    try {
      document.querySelectorAll("script[data-cookiewx], iframe[data-cookiewx]").forEach(function (el) {
        var tag = lower(el.tagName);
        var category = normalizeCategory(el.getAttribute("data-cookiewx") || CATEGORY.MARKETING);

        if (tag === "script") {
          if (el.getAttribute("data-cwx-manual-registered")) return;

          el.setAttribute("data-cwx-manual-registered", "1");

          Q.manualScripts.push(el);

          if (!hasConsentFor(category)) {
            try {
              var manualType = el.getAttribute("type");
              if (manualType && lower(manualType) !== "text/plain") {
                el.setAttribute("data-cwx-type", manualType); // [S18]
              }
            } catch (_) {}
            try {
              el.type = "text/plain";
            } catch (_) {}
          }
        }

        if (tag === "iframe") {
          if (el.getAttribute("data-cwx-manual-registered")) return;

          el.setAttribute("data-cwx-manual-registered", "1");

          var src = el.getAttribute("data-cookiewx-src") || el.getAttribute("data-cwx-src") || el.getAttribute("src") || "";

          if (src) {
            el.setAttribute("data-cwx-src", src);
          }

          Q.manualIframes.push(el);

          if (!hasConsentFor(category) && src) {
            blockIframe(el, src, {
              category: category,
              vendor: "Manual tagging",
              source: "manual"
            });
          }
        }
      });
    } catch (e) {
      warn("CookieWX: scanManualTaggedElements error", e);
    }
  }

  function releaseManualTaggedElements() {
    try {
      Q.manualScripts.forEach(function (oldEl) {
        var category = normalizeCategory(oldEl.getAttribute("data-cookiewx") || CATEGORY.MARKETING);

        if (!hasConsentFor(category)) return;
        if (oldEl.getAttribute("data-cwx-released")) return;

        var src = oldEl.getAttribute("data-cookiewx-src") || oldEl.getAttribute("data-cwx-src") || oldEl.getAttribute("src") || "";
        var s = document.createElement("script");

        Array.prototype.slice.call(oldEl.attributes || []).forEach(function (attr) {
          if (attr.name.indexOf("data-cwx") === 0) return;
          if (attr.name === "data-cookiewx") return;
          if (attr.name === "data-cookiewx-src") return;
          if (attr.name === "type") return;
          if (attr.name === "src") return;

          try {
            s.setAttribute(attr.name, attr.value);
          } catch (_) {}
        });

        // [S18] ripristina il type originale salvato al blocco (module...)
        var cwxOrigTypeManual = oldEl.getAttribute("data-cwx-type") || "";
        if (cwxOrigTypeManual) {
          try {
            s.setAttribute("type", cwxOrigTypeManual);
          } catch (_) {}
        }

        s.setAttribute("data-cwx-safe", "1");

        if (src) {
          s.src = src;
        } else {
          s.text = oldEl.text || oldEl.textContent || "";
        }

        oldEl.setAttribute("data-cwx-released", "1");

        if (oldEl.parentNode) {
          oldEl.parentNode.insertBefore(s, oldEl.nextSibling);
        } else if (document.head) {
          document.head.appendChild(s);
        }

        log("CookieWX: manual script rilasciato", category, src || "inline");
      });

      Q.manualIframes.forEach(function (el) {
        var category = normalizeCategory(el.getAttribute("data-cookiewx") || CATEGORY.MARKETING);
        var src = el.getAttribute("data-cwx-src") || el.getAttribute("data-cookiewx-src") || "";

        if (!src) return;
        if (!hasConsentFor(category)) return;

        removeIframePlaceholder(el);

        el.style.display = el.getAttribute("data-cwx-original-display") || "";
        el.setAttribute("src", src);
        el.removeAttribute("data-cwx-blocked");

        log("CookieWX: manual iframe rilasciato", category, src);
      });
    } catch (e) {
      warn("CookieWX: releaseManualTaggedElements error", e);
    }
  }


  /* =========================================================
   * CAP. 16 — DOM INSERT / ATTRIBUTE FIREWALL
   * ========================================================= */

  function neutralizeNodeBeforeInsert(node) {
    try {
      if (!node || node.nodeType !== 1) return node;

      var tag = lower(node.tagName);

      if (isFaviconOrSiteIconElement(node)) {
  return node;
}

      if (tag === "script") {
        if (node.getAttribute("data-cwx-safe")) return node;
        if (node.getAttribute("data-cookiewx")) return node;

        var src = node.getAttribute("src") || "";

        if (!src) return node;

        var info = resolveResource("script", src);

        if (!hasConsentFor(info.category)) {
          node.setAttribute("data-cwx-blocked", "1");
          node.setAttribute("data-cwx-category", info.category);
          node.setAttribute("data-cwx-vendor", info.vendor || "");
          node.setAttribute("data-cwx-src", src);

          try {
            var nodeType = node.getAttribute("type");
            if (nodeType && lower(nodeType) !== "text/plain") {
              node.setAttribute("data-cwx-type", nodeType); // [S18]
            }
          } catch (_) {}

          try {
            node.type = "text/plain";
          } catch (_) {}

          node.removeAttribute("src");
          Q.scripts.push(node);

          log("CookieWX: script neutralizzato prima dell'inserimento", info.category, info.vendor, src);
        }
      }

      if (tag === "iframe") {
        if (node.getAttribute("data-cookiewx")) return node;

        var iframeSrc = getNodeSrc(node);

        if (!iframeSrc || iframeSrc === "about:blank") return node;

        var iframeInfo = resolveResource("iframe", iframeSrc);

        if (!hasConsentFor(iframeInfo.category)) {
          node.setAttribute("data-cwx-blocked", "1");
          node.setAttribute("data-cwx-category", iframeInfo.category);
          node.setAttribute("data-cwx-vendor", iframeInfo.vendor || "");
          node.setAttribute("data-cwx-src", iframeSrc);
          node.setAttribute("src", "about:blank");

          Q.iframes.push(node);

          setTimeout(function () {
            createIframePlaceholder(node, iframeSrc, iframeInfo);
            node.style.display = "none";
          }, 0);

          log("CookieWX: iframe neutralizzato prima dell'inserimento", iframeInfo.category, iframeInfo.vendor, iframeSrc);
        }
      }

      if (tag === "img") {
        var imgSrc = node.getAttribute("src") || "";

          if (isFaviconOrSiteIconUrl(imgSrc)) {
    return node;
  }

        if (imgSrc && !canTransmit("pixel", imgSrc)) {
          node.setAttribute("data-cwx-blocked-pixel", imgSrc);
          node.removeAttribute("src");
        }
      }

      return node;
    } catch (e) {
      warn("CookieWX: neutralizeNodeBeforeInsert error", e);
      return node;
    }
  }

  function installDomInsertFirewall() {
    try {
      if (window.__COOKIEWX_DOM_INSERT_FIREWALL__) return;
      window.__COOKIEWX_DOM_INSERT_FIREWALL__ = true;

      ORIGINALS.appendChild = Node.prototype.appendChild;
      ORIGINALS.insertBefore = Node.prototype.insertBefore;
      ORIGINALS.replaceChild = Node.prototype.replaceChild;

      Node.prototype.appendChild = function (node) {
        node = neutralizeNodeBeforeInsert(node);
        return ORIGINALS.appendChild.call(this, node);
      };

      Node.prototype.insertBefore = function (node, ref) {
        node = neutralizeNodeBeforeInsert(node);
        return ORIGINALS.insertBefore.call(this, node, ref);
      };

      Node.prototype.replaceChild = function (node, oldChild) {
        node = neutralizeNodeBeforeInsert(node);
        return ORIGINALS.replaceChild.call(this, node, oldChild);
      };

      if (Element.prototype.setAttribute) {
        ORIGINALS.setAttribute = Element.prototype.setAttribute;

        Element.prototype.setAttribute = function (name, value) {
          try {
            var tag = lower(this.tagName);
            var attr = lower(name);

            if (isFaviconOrSiteIconElement(this)) {
  return ORIGINALS.setAttribute.call(this, name, value);
}

            if ((tag === "script" || tag === "iframe" || tag === "img") && attr === "src") {
              var kind = tag === "script"
                ? "script"
                : tag === "iframe"
                  ? "iframe"
                  : "pixel";

              var info = resolveResource(kind, value);

              if (!hasConsentFor(info.category)) {
                if (tag === "script") {
                  this.setAttribute("data-cwx-blocked", "1");
                  this.setAttribute("data-cwx-category", info.category);
                  this.setAttribute("data-cwx-vendor", info.vendor || "");
                  this.setAttribute("data-cwx-src", value);

                  try {
                    var fwType = this.getAttribute("type");
                    if (fwType && lower(fwType) !== "text/plain") {
                      this.setAttribute("data-cwx-type", fwType); // [S18]
                    }
                  } catch (_) {}

                  try {
                    this.type = "text/plain";
                  } catch (_) {}

                  Q.scripts.push(this);
                  warn("CookieWX: setAttribute src script bloccato", info.category, info.vendor, value);
                  return;
                }

                if (tag === "iframe") {
                  this.setAttribute("data-cwx-blocked", "1");
                  this.setAttribute("data-cwx-category", info.category);
                  this.setAttribute("data-cwx-vendor", info.vendor || "");
                  this.setAttribute("data-cwx-src", value);

                  warn("CookieWX: setAttribute src iframe bloccato", info.category, info.vendor, value);
                  return ORIGINALS.setAttribute.call(this, name, "about:blank");
                }

                if (tag === "img") {
                  this.setAttribute("data-cwx-blocked-pixel", value);
                  warn("CookieWX: setAttribute src img bloccato", info.category, info.vendor, value);
                  return;
                }
              }
            }
          } catch (_) {}

          return ORIGINALS.setAttribute.call(this, name, value);
        };
      }

      log("CookieWX: DOM insert firewall installato");
    } catch (e) {
      warn("CookieWX: installDomInsertFirewall error", e);
    }
  }

  function installDocumentWriteFirewall() {
    try {
      if (window.__COOKIEWX_DOCUMENT_WRITE_FIREWALL__) return;
      window.__COOKIEWX_DOCUMENT_WRITE_FIREWALL__ = true;

      ORIGINALS.documentWrite = document.write ? document.write.bind(document) : null;
      ORIGINALS.documentWriteln = document.writeln ? document.writeln.bind(document) : null;

      function sanitizeHtml(html) {
        html = String(html || "");

        var blocked = false;

        VENDORS.forEach(function (vendor) {
          (vendor.hosts || []).forEach(function (host) {
            if (html.toLowerCase().indexOf(host.toLowerCase()) !== -1 && !hasConsentFor(vendor.category)) {
              blocked = true;
            }
          });
        });

        if (!blocked) return html;

        warn("CookieWX: document.write potenzialmente tracciante bloccato");
        return "";
      }

      if (ORIGINALS.documentWrite) {
        document.write = function () {
          var html = Array.prototype.slice.call(arguments).join("");
          return ORIGINALS.documentWrite(sanitizeHtml(html));
        };
      }

      if (ORIGINALS.documentWriteln) {
        document.writeln = function () {
          var html = Array.prototype.slice.call(arguments).join("");
          return ORIGINALS.documentWriteln(sanitizeHtml(html));
        };
      }

      log("CookieWX: document.write firewall installato");
    } catch (e) {
      warn("CookieWX: installDocumentWriteFirewall error", e);
    }
  }


  /* =========================================================
   * CAP. 17 — SCAN DOM
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
      scanManualTaggedElements();

      document.querySelectorAll("script[src]").forEach(handleScriptElement);
      document.querySelectorAll("iframe[src], iframe[data-src], iframe[data-lazy-src]").forEach(handleIframeElement);

      deleteCookiesWithoutConsent();
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
   * CAP. 18 — BANNER
   * ========================================================= */

  var CWX_BANNER_HTML =
    '<div id="cookiewx-banner">' +
      '<div class="cwx-banner-inner">' +
        '<div class="cwx-banner-copy">' +
          '<div class="cwx-banner-title">Gestione cookie e privacy policy</div>' +
          '<div class="cwx-banner-text">' +
            'Utilizziamo cookie essenziali per il funzionamento del sito. ' +
            'Con il tuo consenso possiamo usare anche cookie funzionali, statistici e marketing. ' +
            // [BR8] il punto finale sta DENTRO il wrapper del link: se il
            // link e' nascosto (nessuna policyUrl) non resta punteggiatura
            // orfana ("...marketing. .").
            '<span data-cwx-policy-wrap><a href="#" data-cwx-policy>Cookie e privacy policy</a>.</span>' +
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
            // [S20] logo self-hosted WebP 72x72 su CDN proprio (era PNG Wix 733 KB)
            '<img src="https://cdn.cookiewx.com/assets/powered-logo-72.webp" alt="CookieWX" class="cwx-powered-logo" width="36" height="36">' +
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


  /* =========================================================
   * CAP. 18b — CONFIG BANNER REMOTA (v4.3)
   * Se il nuovo backend e' configurato (window.COOKIEWX_API),
   * scarica la config del banner per questo dominio: colori,
   * testi, posizione, tema. Senza config o senza backend:
   * aspetto di default, nessuna rottura.
   * ========================================================= */

  var bannerConfig = null;

  function bannerDominio() {
    return safeString(
      (window.CookieWX && window.CookieWX.config && window.CookieWX.config.rulesBackendDomain) ||
      window.COOKIEWX_RULES_DOMAIN ||
      location.hostname
    );
  }

  function ensureBackdrop() {
    if (document.getElementById("cookiewx-backdrop")) return;
    if (!document.body) return;
    var b = document.createElement("div");
    b.id = "cookiewx-backdrop";
    b.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483646;";
    document.body.appendChild(b);
  }

  function removeBackdrop() {
    var b = document.getElementById("cookiewx-backdrop");
    if (b) b.remove();
  }

  function applyBannerConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return;
    bannerConfig = cfg;
    window.CookieWX.bannerConfig = cfg;

    var banner = document.getElementById(IDS.BANNER);

    // --- testi ---
    if (banner) {
      var t = banner.querySelector(".cwx-banner-title");
      if (t && cfg.titolo) t.textContent = String(cfg.titolo);
      var x = banner.querySelector(".cwx-banner-text");
      if (x && cfg.testo) {
        x.innerHTML = escapeHtml(String(cfg.testo)) +
          ' <span data-cwx-policy-wrap><a href="#" data-cwx-policy>Cookie e privacy policy</a>.</span>';
        bindPolicyLink();
      }
      var pw = banner.querySelector(".cwx-powered-wrap");
      if (pw) pw.style.display = cfg.mostraBranding === false ? "none" : "";
    }

    // --- stile: colore, tema, posizione ---
    var old = document.getElementById("cookiewx-banner-theme");
    if (old) old.remove();

    var css = "";
    var col = /^#[0-9a-fA-F]{3,8}$/.test(cfg.colorePrimario || "") ? cfg.colorePrimario : null;
    if (col) {
      css += '#cookiewx-banner button[data-cwx="accept"]{background:' + col + ' !important;}';
      css += '#cookiewx-banner button[data-cwx="prefs"]{background:' + col + '1A !important;color:' + col + ' !important;}';
    }
    if (cfg.tema === "scuro") {
      css += "#cookiewx-banner{background:#171720 !important;}";
      css += "#cookiewx-banner .cwx-banner-title{color:#f4f4f5 !important;}";
      css += "#cookiewx-banner .cwx-banner-text{color:#a1a1aa !important;}";
      css += "#cookiewx-banner .cwx-banner-text a{color:#f4f4f5 !important;}";
      css += "#cookiewx-banner .cwx-powered-wrap{color:#a1a1aa !important;}";
    }

    var pos = cfg.posizione;
    if (pos === "basso-sinistra" || pos === "basso-destra" || pos === "centro") {
      var cardCss =
        "#cookiewx-banner{width:min(430px,calc(100vw - 32px)) !important;border-radius:16px !important;box-shadow:0 12px 34px rgba(0,0,0,.28) !important;}" +
        "#cookiewx-banner .cwx-banner-inner{flex-direction:column !important;align-items:stretch !important;padding:18px !important;}" +
        "#cookiewx-banner .cwx-banner-actions{display:grid !important;grid-template-columns:1fr !important;width:100% !important;}" +
        "#cookiewx-banner .cwx-powered-wrap{justify-content:center !important;}";
      if (pos === "basso-sinistra") {
        css += "#cookiewx-banner{inset:auto auto 16px 16px !important;}" + cardCss;
        removeBackdrop();
      } else if (pos === "basso-destra") {
        css += "#cookiewx-banner{inset:auto 16px 16px auto !important;}" + cardCss;
        removeBackdrop();
      } else {
        css += "#cookiewx-banner{inset:50% auto auto 50% !important;transform:translate(-50%,calc(-50% + 24px)) !important;}" + cardCss +
          "#cookiewx-banner.cwx-banner-show{transform:translate(-50%,-50%) !important;}";
        ensureBackdrop();
      }
    } else {
      removeBackdrop();
    }

    if (css && document.head) {
      var st = document.createElement("style");
      st.id = "cookiewx-banner-theme";
      st.textContent = css;
      document.head.appendChild(st);
    }
  }

  /* [BR7 2026-09-16 — v4.5] Cache config in localStorage + fail-open
   * duro: il controllo chiave lato server (B11) NON deve rallentare il
   * banner. Cache fresca → zero chiamate; cache scaduta → il banner parte
   * SUBITO con l'ultima config valida e la ri-validazione avviene in
   * background con timeout 1s; rete giù → resta cache/default.
   * [S12 2026-09-22 — v4.6.2] TTL 24h → 5 minuti.
   * [S14 2026-09-22 — v4.7.0] NO FLASH del tema default:
   * stale-while-revalidate SEMPRE — qualsiasi config in cache (di
   * qualsiasi eta') e' applicata PRIMA del primo render e ri-validata in
   * background a ogni caricamento (il TTL non serve piu': la cache non e'
   * mai la fonte "finale" di una visita). Primo visitatore senza cache:
   * la fetch parte al parse dello script e il primo paint del banner
   * attende la risposta max CFG_FIRST_PAINT_TIMEOUT_MS, poi fail-open
   * col default (il banner non resta MAI nascosto). */
  var CFG_CACHE_KEY = "cookiewxCfgCacheV1";
  var CFG_TIMEOUT_MS = 1000;
  var CFG_FIRST_PAINT_TIMEOUT_MS = 500;
  // Promise del primo fetch config (solo visitatore senza cache):
  // showBanner ne attende la risoluzione prima del primo paint.
  var cfgFirstPaintReady = null;

  function readCfgCache(dominio) {
    try {
      var o = safeJsonParse(localStorage.getItem(CFG_CACHE_KEY), null);
      if (!o || !o.cfg || o.dominio !== dominio) return null;
      if (safeString(o.k) !== SITE_KEY) return null; // chiave cambiata: ricarica
      return o;
    } catch (_) {
      return null;
    }
  }

  function fetchBannerConfig(dominio, onDone) {
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () {
      try { ctrl.abort(); } catch (_) {}
    }, CFG_TIMEOUT_MS) : null;

    fetch(API.CONFIG + "?dominio=" + encodeURIComponent(dominio) +
        (SITE_KEY ? "&k=" + encodeURIComponent(SITE_KEY) : ""), {
      method: "GET",
      credentials: "omit",
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.ok ? r.json() : null; // 404 = nessuna config salvata: default
    }).then(function (cfg) {
      if (cfg) {
        log("CookieWX: config banner dal backend", cfg);
        try {
          localStorage.setItem(CFG_CACHE_KEY, JSON.stringify({
            ts: Date.now(),
            dominio: dominio,
            k: SITE_KEY,
            cfg: cfg
          }));
        } catch (_) {}
        applyBannerConfig(cfg);
      }
      if (onDone) onDone();
    }).catch(function () {
      if (timer) clearTimeout(timer);
      // fail-open: resta l'ultima config valida in cache (o il default)
      if (onDone) onDone();
    });
  }

  function pullConfigFromBackend() {
    if (!API) return; // nuovo backend non configurato: aspetto di default
    var dominio = bannerDominio();
    if (!dominio) return;

    var cached = readCfgCache(dominio);

    // [S14①] SWR SEMPRE: cache di qualsiasi eta' applicata SUBITO (in
    // boot questa funzione e' chiamata PRIMA di applyFromStorage/showBanner,
    // quindi il primo paint nasce gia' con la config), poi ri-validazione
    // in background a ogni caricamento.
    if (cached) {
      log("CookieWX: config banner da cache (SWR)");
      applyBannerConfig(cached.cfg);
      fetchBannerConfig(dominio, null);
      return;
    }

    // [S14②] primo visitatore senza cache: la fetch parte ORA (parse
    // dello script); showBanner ritarda il primo paint fino alla
    // risposta, con timeout duro poi fail-open col default.
    cfgFirstPaintReady = new Promise(function (resolve) {
      var settled = false;
      function fin() {
        if (settled) return;
        settled = true;
        resolve();
      }
      setTimeout(fin, CFG_FIRST_PAINT_TIMEOUT_MS);
      fetchBannerConfig(dominio, fin);
    });
  }

  function showBanner() {
    if (document.getElementById(IDS.BANNER)) return;

    anConsent("mostrato"); // [B24] telemetria CMP anonima (buffer se beacon non ancora attivo)

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

      // config remota eventualmente gia' scaricata prima del mount
      if (bannerConfig) applyBannerConfig(bannerConfig);
      // [S15] dominio senza regole e senza testo personalizzato: testo
      // neutro, mai categorie inventate
      neutralizeBannerIfNeeded();

      requestAnimationFrame(function () {
        banner.classList.add("cwx-banner-show");
      });
    }

    // [S14②] visitatore senza cache: la config e' in arrivo — il primo
    // paint attende la risposta (max CFG_FIRST_PAINT_TIMEOUT_MS, vedi
    // pullConfigFromBackend) per non mostrare mai il tema default.
    // [S15] se lo stato regole e' ignoto si attende anche la prima
    // risposta di getRegole: un dominio senza regole nasce col testo
    // neutro, senza flash di categorie inventate.
    // Risolti o scaduti che siano, il banner si monta comunque.
    if (cfgFirstPaintReady || rulesFirstPaintReady) {
      var gates = [];
      if (cfgFirstPaintReady) gates.push(cfgFirstPaintReady);
      if (rulesFirstPaintReady) gates.push(rulesFirstPaintReady);
      Promise.all(gates).then(function () { mount(); });
      return;
    }

    mount();
  }

  function hideBanner() {
    var el = document.getElementById(IDS.BANNER);

    if (!el) return;

    el.classList.remove("cwx-banner-show");
    removeBackdrop();

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

    // [BR8] il wrapper contiene link + punto finale: nascondendo lui non
    // resta punteggiatura orfana quando manca la policyUrl.
    var wrap = link.closest ? link.closest("[data-cwx-policy-wrap]") : null;

    var url = getPolicyUrl();

    if (url) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.style.display = "";
      if (wrap) wrap.style.display = "";
    } else {
      link.removeAttribute("href");
      if (wrap) {
        wrap.style.display = "none";
      } else {
        link.style.display = "none";
      }
    }
  }


  /* =========================================================
   * CAP. 19 — MODALE PREFERENZE
   * ========================================================= */

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
        var key = normalizeCategory(el.getAttribute("data-cwx-pref"));

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
        var key = normalizeCategory(el.getAttribute("data-cwx-pref"));

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
   * CAP. 20 — BADGE
   * ========================================================= */

  var CWX_BADGE_HTML =
    '<div id="' + IDS.BADGE + '" class="cwx-badge" title="Preferenze cookie">' +
      // [S20] icona self-hosted WebP 72x72 su CDN proprio (era PNG Wix)
      '<img src="https://cdn.cookiewx.com/assets/icon-prefs-72.webp" alt="Cookie preferences" width="36" height="36">' +
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
   * CAP. 21 — SALVATAGGIO CONSENSO
   * ========================================================= */

  function saveConsent(preferenze, tipo) {
    try {
      var payload = {
        accettato: !!(
          preferenze.funzionali ||
          preferenze.statistici ||
          preferenze.marketing
        ),
        preferenze: {
          essenziali: true,
          funzionali: !!preferenze.funzionali,
          statistici: !!preferenze.statistici,
          marketing: !!preferenze.marketing
        },
        tipoConsenso: tipo,
        dataConsenso: new Date().toISOString(),
        loaderVersion: VERSION,
        policyUrl: getPolicyUrl() || ""
      };

      localStorage.setItem(KEYS.CONSENSO, JSON.stringify(payload));
      localStorage.setItem(KEYS.TICK, String(Date.now()));

      sendConsentToBackend(payload);
      applyConsent(payload.preferenze);

      // [B24] telemetria CMP anonima per il tasso di consenso
      anConsent(
        tipo === "totale" ? "accettato" :
        tipo === "ess-only" ? "rifiutato" : "personalizzato"
      );

      log("CookieWX: consenso salvato", payload);
    } catch (e) {
      warn("CookieWX: saveConsent error", e);
    }
  }

  function sendConsentToBackend(consensoPayload) {
    try {
      // [PATCH A7 SENTINEL 2026-09-14] privacy: mai inviare query/hash di
      // URL e referrer (possono contenere token/PII, es. ?resetToken=...):
      // si invia solo origin + pathname.
      var urlSafe = location.origin + location.pathname;
      var referrerSafe = null;
      try {
        if (document.referrer) {
          var refUrl = new URL(document.referrer);
          referrerSafe = refUrl.origin + refUrl.pathname;
        }
      } catch (_) {
        referrerSafe = null;
      }

      var payload = {
        // bannerDominio() rispetta l'override demo (COOKIEWX_RULES_DOMAIN);
        // in produzione equivale a location.hostname
        domain: bannerDominio(),
        userId: getOrCreateUserId(),
        consenso: consensoPayload,
        referrer: referrerSafe,
        url: urlSafe,
        loaderVersion: VERSION
      };

      // [BR7] chiave sito, se lo snippet la dichiara (valida la server, B11)
      if (SITE_KEY) payload.k = SITE_KEY;

      // Dev/demo: se COOKIEWX_API e' valorizzato, il consenso va al
      // backend indicato (e NON ai server di produzione).
      if (API) {
        try {
          fetch(API.CONSENSI, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            keepalive: true
          }).catch(function () {});
        } catch (_) {}
        log("CookieWX: consenso inviato backend custom", payload);
        return;
      }

      // [BR3] PRIMARIO: nuovo backend Cloudflare (D1). Fire-and-forget,
      // keepalive per sopravvivere al cambio pagina.
      fetch(BACKEND.CONSENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});

      // [BR3] SECONDARIA best-effort: Wix legacy, solo finche' risponde.
      // Timeout duro via AbortController: non deve MAI bloccare o
      // rallentare il banner (dopo il cutover questa rotta 404isce in
      // silenzio e puo' essere rimossa alla dismissione di Wix).
      if (BACKEND.CONSENT_URL_WIX) {
        try {
          var wixOpts = {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
            // niente keepalive: non compatibile con AbortController ovunque
          };
          if (typeof AbortController !== "undefined") {
            var wixCtrl = new AbortController();
            wixOpts.signal = wixCtrl.signal;
            setTimeout(function () {
              try { wixCtrl.abort(); } catch (_) {}
            }, BACKEND.WIX_TIMEOUT_MS);
          }
          fetch(BACKEND.CONSENT_URL_WIX, wixOpts).catch(function () {});
        } catch (_) {}
      }

      log("CookieWX: consenso inviato backend", payload);
    } catch (_) {}
  }


  /* =========================================================
   * CAP. 22 — APPLICAZIONE CONSENSO
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
      hardDisableGoogleRuntime();
    } else {
      reEnableGoogleRuntimeIfAllowed();
    }

    deleteCookiesWithoutConsent();
    enforceIframeTeardown();
    scanManualTaggedElements();

    setTimeout(function () {
      deleteCookiesWithoutConsent();
      enforceIframeTeardown();
      resetCheckedFlags();
      scanNow();
      releaseManualTaggedElements();
      releaseBlockedScripts();
      releaseBlockedIframes();
    }, 50);

    setTimeout(function () {
      deleteCookiesWithoutConsent();
      enforceIframeTeardown();
    }, 500);

    anOnConsentChange(); // [B24] attiva pageview identificata + perf se statistici appena concessi

    log("CookieWX: consenso applicato", window.CookieWX.consent);
  }

  function applyFromStorage() {
    try {

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
        hardDisableGoogleRuntime();

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
   * CAP. 22b — B2 SCAN-TO-BLOCK: pull regole dal backend CookieWX
   * HeroWX Cloud classifica le risorse e pusha le regole in
   * RegoleCookieWX (POST /syncRegole); qui il loader le ritira
   * via GET /getRegole (CORS aperto) e le applica come un
   * COOKIEWX_SYNC. Non sovrascrive mai una versione piu' recente
   * (es. appena arrivata via postMessage dal banner) e preserva
   * la policyUrl eventualmente gia' impostata.
   * Disattivabile con window.CookieWX.config.rulesBackendSync = false.
   * ========================================================= */
  // Fase 3 (2026-09-13): switch da Wix al nuovo backend Cloudflare.
  // Parita' risposta verificata su produzione (shape e contenuto identici).
  var RULES_BACKEND_URL = "https://api.cookiewx.com/getRegole";
  var RULES_PULL_INTERVAL_MS = 5 * 60 * 1000;
  var rulesPullTimer = null;
  var rulesPullInFlight = false;

  /* [S15 2026-09-23 — v4.7.2] FAIL ONESTO se il backend non ha regole
   * per il dominio (404) o la chiave e' negata/sospesa (403): il banner
   * NON deve mai mostrare il testo di default che enumera categorie
   * ("funzionali, statistici e marketing") — affermazioni inventate sul
   * sito del cliente (caso nautrip.com, REGIA 22/09 21:35). Al suo posto
   * un banner minimale neutro (il consenso resta raccoglibile: spegnere
   * del tutto il banner sarebbe peggio per la compliance del cliente).
   * Lo stato e' persistito in localStorage per il primo paint delle
   * visite successive; alla prima visita il primo paint attende la prima
   * risposta regole (stesso timeout della config, vedi showBanner). */
  var REGOLE_MISSING_KEY = "cookiewxRegoleMissingV1";
  var regoleMissing = false;
  var rulesFirstPaintReady = null;
  var rulesFirstPaintResolve = null;

  function readRegoleMissing(dominio) {
    try {
      var o = safeJsonParse(localStorage.getItem(REGOLE_MISSING_KEY), null);
      return !!(o && o.missing && o.dominio === dominio && safeString(o.k) === SITE_KEY);
    } catch (_) { return false; }
  }

  function writeRegoleMissing(dominio, missing) {
    try {
      if (missing) {
        localStorage.setItem(REGOLE_MISSING_KEY, JSON.stringify({
          dominio: dominio, k: SITE_KEY, ts: Date.now()
        }));
      } else {
        localStorage.removeItem(REGOLE_MISSING_KEY);
      }
    } catch (_) {}
  }

  function resolveRulesFirstPaint() {
    try { if (rulesFirstPaintResolve) rulesFirstPaintResolve(); } catch (_) {}
  }

  // Testo neutro: nessuna categoria nominata, nessun claim sul blocco.
  // Il testo personalizzato del cliente (config salvata) ha precedenza.
  function neutralizeBannerIfNeeded() {
    if (!regoleMissing) return;
    if (bannerConfig && bannerConfig.testo) return;
    var banner = document.getElementById(IDS.BANNER);
    if (!banner) return;
    var t = banner.querySelector(".cwx-banner-title");
    if (t) t.textContent = "Gestione dei cookie";
    var x = banner.querySelector(".cwx-banner-text");
    if (x) {
      x.innerHTML = "Questo sito utilizza cookie e tecnologie simili. " +
        "Puoi accettare, rifiutare o gestire le tue scelte." +
        ' <span data-cwx-policy-wrap><a href="#" data-cwx-policy>Cookie e privacy policy</a>.</span>';
      bindPolicyLink();
    }
  }

  function versionTime(v) {
    if (!v) return 0;
    var n = Number(v);
    if (!isNaN(n) && String(v).trim() !== "") return n;
    var d = new Date(v).getTime();
    return isNaN(d) ? 0 : d;
  }

  function applyPulledRegole(regole) {
    var current = window.CookieWX.regole || {};
    var nextVersion = safeString(regole.updatedAt || Date.now());

    // non tornare indietro: se la versione locale e' piu' recente, salta
    if (versionTime(current.version) >= versionTime(nextVersion)) return;

    var next = {
      version: nextVersion,
      policyUrl: safeString(regole.policyUrl || current.policyUrl || ""),
      cookies: Array.isArray(regole.cookies) ? regole.cookies : [],
      scripts: Array.isArray(regole.scripts) ? regole.scripts : [],
      iframes: Array.isArray(regole.iframes) ? regole.iframes : []
    };

    window.CookieWX.regole = next;

    try {
      localStorage.setItem(KEYS.REGOLE, JSON.stringify(next));
    } catch (_) {}

    log("CookieWX: regole scaricate dal backend", nextVersion);
    enforceIframeTeardown();
    resetCheckedFlags();
    scanNow();
  }

  function pullRegoleFromBackend() {
    if (rulesPullInFlight) return;
    if (window.CookieWX && window.CookieWX.config && window.CookieWX.config.rulesBackendSync === false) return;

    // Override per demo/test: CookieWX.config.rulesBackendDomain o
    // window.COOKIEWX_RULES_DOMAIN forzano il dominio delle regole
    // (altrimenti si usa il dominio del sito corrente).
    var dominio = safeString(
      (window.CookieWX && window.CookieWX.config && window.CookieWX.config.rulesBackendDomain) ||
      window.COOKIEWX_RULES_DOMAIN ||
      location.hostname
    );
    if (!dominio) return;

    rulesPullInFlight = true;

    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;

    fetch(RULES_BACKEND_URL + "?dominio=" + encodeURIComponent(dominio) +
        (SITE_KEY ? "&k=" + encodeURIComponent(SITE_KEY) : ""), {
      method: "GET",
      credentials: "omit",
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      // [S15] 404 = nessuna regola per il dominio, 403 = chiave negata:
      // marca lo stato e neutralizza il testo del banner (mai categorie
      // inventate). Distinto dagli errori di rete (catch): li' resta tutto
      // com'e', fail-open.
      if (r && (r.status === 404 || r.status === 403)) {
        regoleMissing = true;
        writeRegoleMissing(dominio, true);
        warn("CookieWX: nessuna regola per il dominio " + dominio +
          " (HTTP " + r.status + ") — banner con testo neutro");
        neutralizeBannerIfNeeded();
        resolveRulesFirstPaint();
        return null;
      }
      return r.ok ? r.json() : null;
    }).then(function (regole) {
      rulesPullInFlight = false;
      resolveRulesFirstPaint();
      // [B24+S8] il flag analytics va letto PRIMA di OGNI guard: ne' il
      // guard di versione di applyPulledRegole ne' risposte parziali
      // (senza array cookies) devono impedire arming/disarming del beacon
      if (regole && typeof regole === "object") {
        anSetEnabled(regole.analytics === true, regole.analyticsPre === true);
      }
      if (!regole || !Array.isArray(regole.cookies)) return;
      if (regoleMissing) { // [S15] regole arrivate: stato rientrato
        regoleMissing = false;
        writeRegoleMissing(dominio, false);
      }
      applyPulledRegole(regole);
    }).catch(function (err) {
      rulesPullInFlight = false;
      resolveRulesFirstPaint();
      if (timer) clearTimeout(timer);
      warn("CookieWX: pull regole backend non riuscito", err);
    });
  }

  function startRulesBackendPull() {
    // [S15] se lo stato regole e' ignoto (mai scaricate e nessun marker
    // "missing"), il primo paint del banner attende la prima risposta
    // (max CFG_FIRST_PAINT_TIMEOUT_MS): cosi' un dominio senza regole
    // nasce gia' col testo neutro, senza flash di categorie inventate.
    var cached = readRegoleFromStorage();
    var regoleNote = !!(cached && cached.version && cached.version !== "0" &&
      ((cached.cookies || []).length + (cached.scripts || []).length +
       (cached.iframes || []).length) > 0);
    if (!regoleNote && !regoleMissing && !rulesFirstPaintReady) {
      rulesFirstPaintReady = new Promise(function (resolve) {
        rulesFirstPaintResolve = resolve;
        setTimeout(resolve, CFG_FIRST_PAINT_TIMEOUT_MS);
      });
    }
    // subito a boot + retry dopo 30s (copre il caso "regola appena pushata")
    // + ogni 5 min per aggiornamenti successivi
    setTimeout(pullRegoleFromBackend, 0);
    setTimeout(pullRegoleFromBackend, 30000);
    if (rulesPullTimer) clearInterval(rulesPullTimer);
    rulesPullTimer = setInterval(pullRegoleFromBackend, RULES_PULL_INTERVAL_MS);
  }


  /* =========================================================
   * CAP. 22c — B24 ANALYTICS BEACON (SCOUT 2026-09-20, v4.6.0)
   * Beacon lato loader per l'add-on Analytics. Contratto con
   * BASTION (📮 STATO-PROGETTO, voce B24): POST
   * /api/analytics/collect con navigator.sendBeacon, batch ogni
   * ~10s o a pagehide, max 50 eventi; il server risponde 204.
   * Gating DURO: niente traffico se getRegole non dichiara
   * analytics:true, e mai senza chiave sito (il server la
   * richiede, P5). Il server scarta comunque se l'add-on e'
   * spento: doppia protezione.
   * Modalita' A (default): eventi SOLO con consenso statistici;
   * ID anonimo casuale in sessionStorage, MAI cookie.
   * Modalita' B (pre-consenso, futura): se getRegole esporra'
   * analyticsPre:true, prima del consenso si invia SOLO la
   * pageview con anon:true (niente v, niente storage on-device).
   * Eventi consent (mostrato/accettato/rifiutato/personalizzato):
   * SEMPRE anonimi (mai v/d/r) — servono al tasso di consenso
   * aggregato, nessun dato identificativo.
   * Privacy loader-side: mai querystring in p/r (gli UTM della
   * pageview vengono letti dalla query ma la query non viaggia);
   * exit_click manda solo l'host di destinazione.
   * Override per test: CookieWX.config.analyticsForce (attiva il
   * beacon anche senza flag server — il server scarta se l'add-on
   * e' spento) e window.COOKIEWX_ANALYTICS_URL (endpoint diverso).
   * ========================================================= */
  var ANALYTICS_COLLECT_URL = safeString(window.COOKIEWX_ANALYTICS_URL) ||
    "https://api.cookiewx.com/api/analytics/collect";
  var AN_FLUSH_MS = 10000;
  var AN_HEARTBEAT_MS = 30000;

  var CWX_AN = {
    on: false,
    pre: false,
    started: false,
    q: [],
    buffered: [],
    vid: null,
    pvSent: false,
    perfSent: false,
    shownSent: false,
    scrollSent: {},
    lastHb: 0
  };

  function anHasStatsConsent() {
    try {
      return !!(window.CookieWX && window.CookieWX.consent &&
        window.CookieWX.consent.statistici);
    } catch (_) { return false; }
  }

  function anDevice() {
    try {
      var w = window.innerWidth || 0;
      if (w && w < 768) return "mobile";
      if (w && w < 1024) return "tablet";
      return "desktop";
    } catch (_) { return ""; }
  }

  function anPath() {
    // contratto B24: solo path, MAI querystring
    try { return location.pathname || "/"; } catch (_) { return "/"; }
  }

  function anReferrer() {
    try {
      if (!document.referrer) return "";
      var u = new URL(document.referrer);
      return u.origin + u.pathname;
    } catch (_) { return ""; }
  }

  function anUtm() {
    try {
      var q = new URLSearchParams(location.search || "");
      var s = safeString(q.get("utm_source"));
      var m = safeString(q.get("utm_medium"));
      var c = safeString(q.get("utm_campaign"));
      if (!s && !m && !c) return null;
      return { s: s, m: m, c: c };
    } catch (_) { return null; }
  }

  function anGetVid() {
    // ID anonimo SOLO post-consenso (Modalita' A). sessionStorage, mai cookie.
    if (!anHasStatsConsent()) return "";
    if (CWX_AN.vid) return CWX_AN.vid;
    try {
      var v = sessionStorage.getItem("cookiewxAnVid") || "";
      if (!v) {
        v = "v" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        sessionStorage.setItem("cookiewxAnVid", v);
      }
      CWX_AN.vid = v;
    } catch (_) { CWX_AN.vid = ""; }
    return CWX_AN.vid;
  }

  function anPush(ev) {
    try {
      CWX_AN.q.push(ev);
      while (CWX_AN.q.length > 50) CWX_AN.q.shift();
    } catch (_) {}
  }

  function anTrack(tipo, extra) {
    if (!CWX_AN.on) return;
    try {
      extra = extra || {};
      if (!anHasStatsConsent()) {
        // pre-consenso: solo la pageview anonima di Modalita' B
        if (CWX_AN.pre && tipo === "pageview") {
          anPush({ t: "pageview", anon: true, p: anPath(), d: anDevice(), r: anReferrer() });
        }
        return;
      }
      var ev = { t: tipo, p: anPath() };
      var v = anGetVid();
      if (v) ev.v = v;
      ev.d = anDevice();
      if (tipo === "pageview") {
        ev.r = anReferrer();
        var utm = anUtm();
        if (utm) ev.utm = utm;
      } else if (tipo === "heartbeat") {
        ev.sec = Math.max(1, Math.min(600, Math.round(extra.sec || 0)));
      } else if (tipo === "exit_click") {
        ev.dest = safeString(extra.dest);
        if (!ev.dest) return;
      } else if (tipo === "click") {
        ev.label = safeString(extra.label).slice(0, 120);
        if (!ev.label) return;
      } else if (tipo === "scroll") {
        ev.s = extra.s;
      } else if (tipo === "perf") {
        ev.ms = Math.max(0, Math.round(extra.ms || 0));
      }
      anPush(ev);
    } catch (_) {}
  }

  function anConsent(azione) {
    // Telemetria CMP anonima: buffer breve se getRegole non e' ancora
    // tornato (il banner si mostra al boot, prima della risposta).
    if (azione === "mostrato") {
      if (CWX_AN.shownSent) return;
      CWX_AN.shownSent = true;
    }
    var ev = { t: "consent", a: azione };
    if (!CWX_AN.on) {
      try {
        CWX_AN.buffered.push(ev);
        if (CWX_AN.buffered.length > 5) CWX_AN.buffered.shift();
      } catch (_) {}
      return;
    }
    anPush(ev);
  }

  function anFlush() {
    if (!CWX_AN.on || !CWX_AN.q.length) return;
    var batch = CWX_AN.q.splice(0, 50);
    var body;
    try {
      body = JSON.stringify({ k: SITE_KEY, dominio: bannerDominio(), eventi: batch });
    } catch (_) { return; }
    var sent = false;
    try {
      if (navigator.sendBeacon) {
        // [S17 2026-09-23 — v4.7.1] Content-Type SAFELISTED: con
        // "application/json" Chrome preflighta il sendBeacon e la chiamata
        // non raggiunge MAI il server (provato live: beacon json persi,
        // beacon text/plain scritti in D1). Il server fa request.json()
        // sul body a prescindere dall'header → text/plain e' identico
        // semanticamente ma viaggia senza preflight.
        sent = navigator.sendBeacon(
          ANALYTICS_COLLECT_URL,
          new Blob([body], { type: "text/plain" })
        );
      }
    } catch (_) { sent = false; }
    if (!sent) {
      try {
        fetch(ANALYTICS_COLLECT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" }, // [S17] vedi sopra
          body: body,
          credentials: "omit",
          keepalive: true
        }).catch(function () {});
      } catch (_) {}
    }
  }

  function anMaybePageview() {
    if (!CWX_AN.on || CWX_AN.pvSent) return;
    if (anHasStatsConsent() || CWX_AN.pre) {
      CWX_AN.pvSent = true;
      anTrack("pageview");
    }
  }

  function anMaybePerf() {
    if (!CWX_AN.on || CWX_AN.perfSent) return;
    if (!anHasStatsConsent()) return;
    try {
      if (document.readyState !== "complete") return;
      CWX_AN.perfSent = true;
      var ms = (window.performance && performance.now) ? performance.now() : 0;
      anTrack("perf", { ms: ms });
    } catch (_) {}
  }

  function anOnConsentChange() {
    // chiamato da applyConsent: se gli statistici sono appena stati
    // accettati partono pageview identificata e perf (Modalita' A).
    if (!CWX_AN.on) return;
    anMaybePageview();
    anMaybePerf();
  }

  function anSetEnabled(flag, preFlag) {
    var cfg = (window.CookieWX && window.CookieWX.config) || {};
    var want = !!(flag || cfg.analyticsForce);
    CWX_AN.pre = !!preFlag || !!cfg.analyticsPreConsent;
    if (!want || !SITE_KEY) {
      if (CWX_AN.on) {
        CWX_AN.on = false;
        CWX_AN.q = [];
        log("CookieWX: analytics beacon disattivato");
      }
      return;
    }
    if (CWX_AN.on) return;
    CWX_AN.on = true;
    log("CookieWX: analytics beacon attivo (loader v" + VERSION + ")");
    // replay eventi consent bufferizzati prima dell'attivazione
    while (CWX_AN.buffered.length) {
      anPush(CWX_AN.buffered.shift());
    }
    anStart();
    anMaybePageview();
    anMaybePerf();
    anFlush();
  }

  function anStart() {
    if (CWX_AN.started) return;
    CWX_AN.started = true;
    CWX_AN.lastHb = Date.now();

    setInterval(anFlush, AN_FLUSH_MS);

    setInterval(function () {
      if (!CWX_AN.on) { CWX_AN.lastHb = Date.now(); return; }
      var now = Date.now();
      var sec = Math.round((now - CWX_AN.lastHb) / 1000);
      CWX_AN.lastHb = now;
      if (!anHasStatsConsent()) return;
      try {
        if (document.visibilityState === "hidden") return;
      } catch (_) {}
      if (sec >= 1) anTrack("heartbeat", { sec: sec });
    }, AN_HEARTBEAT_MS);

    // flush di fine pagina / tab in background
    try {
      window.addEventListener("pagehide", anFlush);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") anFlush();
      });
    } catch (_) {}

    // scroll 25/50/75/100 (una sola volta ciascuno per pagina)
    var scrollTick = false;
    function onAnScroll() {
      if (scrollTick) return;
      scrollTick = true;
      setTimeout(function () {
        scrollTick = false;
        if (!CWX_AN.on || !anHasStatsConsent()) return;
        try {
          var doc = document.documentElement;
          var total = (doc.scrollHeight || 0) - (window.innerHeight || 0);
          if (total <= 0) return;
          var pct = Math.min(100, Math.round(((window.scrollY || doc.scrollTop || 0) / total) * 100));
          var soglie = [25, 50, 75, 100];
          for (var i = 0; i < soglie.length; i++) {
            var s = soglie[i];
            if (pct >= s && !CWX_AN.scrollSent[s]) {
              CWX_AN.scrollSent[s] = true;
              anTrack("scroll", { s: s });
            }
          }
        } catch (_) {}
      }, 150);
    }
    try {
      window.addEventListener("scroll", onAnScroll, { passive: true });
    } catch (_) {
      window.addEventListener("scroll", onAnScroll);
    }

    // click delegato: [data-cwx-track] -> label; link esterno -> exit_click
    try {
      document.addEventListener("click", function (e) {
        if (!CWX_AN.on || !anHasStatsConsent()) return;
        try {
          var t = e.target;
          var tracked = t && t.closest ? t.closest("[data-cwx-track]") : null;
          if (tracked) {
            anTrack("click", { label: tracked.getAttribute("data-cwx-track") });
            return;
          }
          var a = t && t.closest ? t.closest("a[href]") : null;
          if (!a) return;
          var href = safeString(a.getAttribute("href"));
          if (!href || href.charAt(0) === "#") return;
          var u = new URL(href, location.href);
          if (u.hostname && u.hostname !== location.hostname) {
            anTrack("exit_click", { dest: u.hostname });
          }
        } catch (_) {}
      }, true);
    } catch (_) {}

    // perf a caricamento completo
    try {
      window.addEventListener("load", function () {
        setTimeout(anMaybePerf, 0);
      });
    } catch (_) {}
  }


  /* =========================================================
   * CAP. 23 — API PUBBLICA
   * ========================================================= */

  window.CookieWX.applyConsent = applyConsent;
  window.CookieWX.applyFromStorage = applyFromStorage;
  window.CookieWX.showPreferences = showPreferences;
  window.CookieWX.showBanner = showBanner;
  window.CookieWX.hideBanner = hideBanner;
  window.CookieWX.resolveResource = resolveResource;
    window.CookieWX.telemetry = CWX_TELEMETRY;
  window.CookieWX.publishTelemetrySnapshot = publishTelemetrySnapshot;
  // [B24] hook diagnostica/test (SENTINEL, PALCO): attiva/ferma il beacon
  // a mano — in produzione lo pilota getRegole (analytics:true). Il server
  // scarta comunque gli eventi se l'add-on e' spento.
  window.CookieWX.analyticsControl = anSetEnabled;

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
   * CAP. 24 — SYNC
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

  // =========================================================
  // SICUREZZA (2026-09-11) — Allowlist origini per i message
  // COOKIEWX_SYNC / COOKIEWX_CONSENT. Prima della patch QUALUNQUE
  // iframe nella pagina poteva iniettare regole (policyUrl di phishing
  // nel banner!) e forzare consensi falsi. Regola:
  //   1. sempre accettata l'origine del sito ospite (stesso origin:
  //      script inline/embed del cliente);
  //   2. accettati i domini cookiewx.com (iframe banner/configuratori
  //      serviti dal backend CookieWX);
  //   3. tutto il resto viene ignorato.
  // Per aggiungere un mittente legittimo cross-origin, estendere il
  // regex sotto (es. il dominio della dashboard embeddata).
  // =========================================================
  function isTrustedMessageOrigin(origin) {
    if (!origin) return false;
    if (origin === location.origin) return true;
    return /(^|\.)cookiewx\.com$/.test(origin.replace(/^https?:\/\//, ""));
  }

  window.addEventListener("message", function (e) {
    if (!e || !e.data) return;

    // [PATCH] origine non fidata: ignora il messaggio (anti-iniezione regole)
    if (!isTrustedMessageOrigin(e.origin)) {
      warn("CookieWX: messaggio ignorato da origine non fidata:", e.origin);
      return;
    }

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
   * CAP. 25 — BOOT
   * ========================================================= */

  function installAllFirewalls() {
    installGoogleConsentDefaults();
    installDataLayerAndGtagFirewall();
    installMarketingApiFirewall();
    installFetchFirewall();
    installXHRFirewall();
    installBeaconFirewall();
    installImagePixelFirewall();
    installCookieGuard();
    installDomInsertFirewall();
    installDocumentWriteFirewall();
  }

  function boot() {
    gcStorageOnVersionChange(); // [S17b] prima di OGNI lettura cache
    markCurrentScriptSafe();
    installAllFirewalls();

    detectGAFromScripts();

    try {
      domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch (_) {}

    // [S15] stato "regole mancanti" dalla visita precedente: se noto,
    // il primo paint nasce gia' neutro senza attendere la rete.
    regoleMissing = readRegoleMissing(bannerDominio());

    // [S14] pullConfig PRIMA di applyFromStorage: la config in cache e'
    // applicata prima del primo render; senza cache la fetch parte qui
    // (parse dello script) e showBanner attende max 500ms.
    pullConfigFromBackend();
    applyFromStorage();
    scanNow();
    startRulesBackendPull();

    setTimeout(function () {
      log("CookieWX: delayed apply 300ms");
      detectGAFromScripts();
      applyFromStorage();
    }, 300);

    setTimeout(function () {
      log("CookieWX: delayed apply 1000ms");
      detectGAFromScripts();
      applyFromStorage();
    }, 1000);

    setTimeout(function () {
      log("CookieWX: delayed apply 2500ms");
      detectGAFromScripts();
      applyFromStorage();
    }, 2500);

    setInterval(function () {
      deleteCookiesWithoutConsent();
    }, 3000);

        setTimeout(publishTelemetrySnapshot, 600);
    setTimeout(publishTelemetrySnapshot, 1600);
    setTimeout(publishTelemetrySnapshot, 3200);

    log("CookieWX Loader v" + VERSION + " avviato");
  }

  boot();

})();
