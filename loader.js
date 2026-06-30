/* =========================================================
 * CookieWX Loader v4.2.0
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
  var VERSION = "4.2.0";

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
      v === "necessari"
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
   * CAP. 4 — CLEANUP VECCHIE FAVICON CookieWX
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

    return hostMatches(host, needleHost);
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

    var list = [];

    if (kind === "script") list = window.CookieWX.regole.scripts || [];
    if (kind === "iframe") list = window.CookieWX.regole.iframes || [];
    if (kind === "request" || kind === "pixel" || kind === "beacon") {
      list = []
        .concat(window.CookieWX.regole.scripts || [])
        .concat(window.CookieWX.regole.iframes || []);
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
      window.__COOKIEWX_COOKIE_GUARD__ = true;

      var descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

      if (!descriptor || !descriptor.set || descriptor.configurable === false) {
        warn("CookieWX: document.cookie non intercettabile");
        return;
      }

      ORIGINALS.cookieDescriptor = descriptor;

      Object.defineProperty(document, "cookie", {
        configurable: true,
        enumerable: true,

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
      cleanupLegacyFavicons();
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
        url: location.href,
        loaderVersion: VERSION
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
   * CAP. 23 — API PUBBLICA
   * ========================================================= */

  window.CookieWX.applyConsent = applyConsent;
  window.CookieWX.applyFromStorage = applyFromStorage;
  window.CookieWX.showPreferences = showPreferences;
  window.CookieWX.showBanner = showBanner;
  window.CookieWX.hideBanner = hideBanner;
  window.CookieWX.resolveResource = resolveResource;

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
    markCurrentScriptSafe();
    cleanupLegacyFavicons();

    installAllFirewalls();

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
