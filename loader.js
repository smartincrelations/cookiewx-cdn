/* =========================================================
 * CookieWX Loader v2.2.1 (Wix-ready)
 * - Legge consenso da: cookiewxConsenso
 * - Legge regole da:   cookiewxRegole
 * - Trigger update:    cookiewxTick (polling + storage)
 * - Blocca SCRIPT/IFRAME 3rd-party finché non c'è consenso
 * - Usa categorie da DB quando disponibili
 * ========================================================= */

// CAP. 0 — BOOT & SAFE GUARD
(function () {
  if (window.__COOKIEWX_LOADER__) return;
  window.__COOKIEWX_LOADER__ = true;

// CAP. 1 — CONFIG & COSTANTI
  var DEBUG = true;

  var KEYS = {
    CONSENSO: "cookiewxConsenso",
    REGOLE:   "cookiewxRegole",
    TICK:     "cookiewxTick"
  };
  
  var CWX_FAVICONS = [];

// CAP. 2 — USER IDENTIFICATION
function getOrCreateUserId() {
  try {
    var key = "cookiewxUserId";
    var id = localStorage.getItem(key);
    if (id) return id;

    // UUID v4 semplice e robusto
    id = "cwx-" + ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );

    localStorage.setItem(key, id);
    return id;
  } catch (_) {
    // fallback estremo (session-only)
    return "cwx-temp-" + Date.now();
  }
}
// CAP. 3 — BRANDING / FAVICON
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

function injectCookieWXFavicon() {
  try {
    if (!document.head) return; // ⛔️ FIX CRITICO

    // rimuove SOLO favicon CookieWX precedenti
    document
      .querySelectorAll('link[data-cwx-favicon]')
      .forEach(function (el) {
        el.remove();
      });

    var href =
      "https://static.wixstatic.com/media/cf36e3_d9fff42867074acda9fd81e2037a9d57~mv2.png?v=" +
      Date.now();

    function addIcon(rel, sizes) {
      if (!document.head) return; // ⛔️ ULTERIORE SAFETY

      var link = document.createElement("link");
      link.rel = rel;
      link.href = href;
      if (sizes) link.sizes = sizes;
      link.type = "image/png";
      link.setAttribute("data-cwx-favicon", "1");
      document.head.appendChild(link);
    }

    addIcon("icon", "16x16");
    addIcon("icon", "32x32");
    addIcon("icon", "48x48");
    addIcon("apple-touch-icon", "180x180");
    addIcon("shortcut icon");
  } catch (e) {
    console.warn("CookieWX favicon error", e);
  }
}
  
function restoreFavicons() {
  try {
    // rimuove SOLO favicon CookieWX
    document.querySelectorAll('link[data-cwx-favicon]').forEach(function (el) {
      el.remove();
    });

    if (!CWX_FAVICONS.length) return;

    CWX_FAVICONS.forEach(function (f) {
      var link = document.createElement("link");
      link.rel = f.rel;
      link.href = f.href;
      if (f.type) link.type = f.type;
      document.head.appendChild(link);
    });
  } catch (_) {}
}

  // =========================================================
// CAP. 3.1 — HEAD WATCHER (Wix reload fix)
// =========================================================
(function watchHeadForFavicon() {
  function ensureFavicon() {
    var hasCwx = document.querySelector('link[data-cwx-favicon]');
    if (!hasCwx) {
      injectCookieWXFavicon();
    }
  }

  // head già pronto
  if (document.head) {
    ensureFavicon();

    var headObserver = new MutationObserver(function () {
      ensureFavicon();
    });

    headObserver.observe(document.head, {
      childList: true,
      subtree: true
    });
  } else {
    // Wix: head arriva dopo
    requestAnimationFrame(watchHeadForFavicon);
  }
})();

// CAP. 4 — UTILS ---------- TICK RELOAD ----------
function kickReload() {
  try {
    localStorage.setItem(KEYS.TICK, String(Date.now()));
  } catch (_) {}
}
  
  // =====================
// CAP. 5 — UI: BANNER PRINCIPALE
// =====================

  var CWX_BANNER_HTML = `
<div id="cookiewx-banner" style="
  position:fixed;
  inset:auto 0 0 0;
  width:100vw;
  z-index:2147483647;
  pointer-events:auto;
  background:#fff;
  box-shadow:0 -4px 12px rgba(0,0,0,.15);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
">
  <div style="max-width:1200px;margin:0 auto;padding:20px;display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between;">
    <div style="flex:1;min-width:260px;">
      <div style="
  font-size:18px;
  font-weight:600;
  margin-bottom:6px;
  color:#000;
">
  Gestione cookie e privacy policy
</div>
      <span style="font-size:14px;color:#444">
  Utilizziamo cookie essenziali per il funzionamento del sito.
  Per saperne di più consulta la
  <a href="#" data-cwx-policy style="color:#000;text-decoration:underline;">
    Cookie e privacy policy
  </a>.
</span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button data-cwx="accept">Accetta tutto</button>
      <button data-cwx="reject">Rifiuta tutto</button>
      <button data-cwx="prefs">Gestisci preferenze</button>
    </div>
    <div style="
  margin-top:12px;
  display:flex;
  align-items:center;
  gap:8px;
  font-size:12px;
  color:#666;
">
  <a href="https://www.cookiewx.com"
   target="_blank"
   rel="noopener"
   style="display:flex;align-items:center;gap:6px;text-decoration:none;">
  <img
    src="https://static.wixstatic.com/media/cf36e3_e6f4be6aacee48589e8adeb30ec67d1a~mv2.png"
    alt="Powered by CookieWX"
    style="height:30px;width:auto;opacity:.85;"
  >
</a>
</div>
  </div>
</div>
`;
(function injectBannerStyle() {
  if (document.getElementById("cwx-banner-style")) return;

  var style = document.createElement("style");
  style.id = "cwx-banner-style";
  style.textContent = `
    #cookiewx-banner{
      opacity:0;
      transform: translateY(100%);
      transition: opacity .35s ease, transform .35s ease;
    }
    #cookiewx-banner.cwx-banner-show{
      opacity:1;
      transform: translateY(0);
    }

    /* BOTTONI */
    #cookiewx-banner button{
      appearance:none;
      border:0;
      border-radius:10px;
      padding:10px 14px;
      font-size:14px;
      cursor:pointer;
      font-family:inherit;
      transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
    }
    #cookiewx-banner button:active{
      transform: scale(.97);
    }


    /* Accetta + Rifiuta (stessa evidenza – COMPLIANCE) */
#cookiewx-banner button[data-cwx="accept"],
#cookiewx-banner button[data-cwx="reject"]{
  background:#000;
  color:#fff;
  box-shadow: 0 6px 16px rgba(0,0,0,.18);
}

/* Gestisci preferenze – attivo, informativo */
#cookiewx-banner button[data-cwx="prefs"]{
  background:#e6f0ff;              /* azzurro chiaro */
  color:#003366;                   /* blu leggibile */
  box-shadow: 0 6px 16px rgba(0,64,128,.18);
}

    /* Mobile */
    @media (max-width: 768px){
      #cookiewx-banner > div > div{
        width:100%;
      }
      #cookiewx-banner button{
        width:100%;
        text-align:center;
      }
    }
  `;
  document.head.appendChild(style);
})();
function showBanner() {
  hideBadge(); // opzionale UX
  if (document.getElementById("cookiewx-banner")) return;

  function mount() {
    if (!document.body) {
      requestAnimationFrame(mount);
      return;
    }

    var wrap = document.createElement("div");
    wrap.innerHTML = CWX_BANNER_HTML;

    var banner = wrap.firstElementChild;
    document.body.appendChild(banner);

    // anima in ingresso
    requestAnimationFrame(function () {
      banner.classList.add("cwx-banner-show");
    });

    bindBannerEvents();
    bindPolicyLink();
  }

  mount();
}
  function hideBanner() {
  showBadge(); // opzionale UX
  var el = document.getElementById("cookiewx-banner");
  if (!el) return;

  el.classList.remove("cwx-banner-show");

  setTimeout(function () {
    if (el && el.parentNode) el.remove();
  }, 350);
}

function saveConsent(preferenze, tipo) {
  try {
    var accettato = (
      preferenze.funzionali ||
      preferenze.statistici ||
      preferenze.marketing
    );

    var payload = {
      accettato: accettato,
      preferenze: preferenze,
      tipoConsenso: tipo,
      dataConsenso: new Date().toISOString()
    };

    localStorage.setItem(KEYS.CONSENSO, JSON.stringify(payload));
    localStorage.setItem(KEYS.TICK, String(Date.now()));

    sendConsentToBackend(payload);

showBadge();          // ✅

log("💾 CookieWX: consenso salvato", payload);
  } catch (e) {
    log("❌ CookieWX: errore salvataggio consenso", e);
  }
}

function sendConsentToBackend(consensoPayload) {
  try {
var payload = {
  domain: location.hostname,
  userId: getOrCreateUserId(),
  consenso: consensoPayload,
  referrer: document.referrer || null
};

fetch("https://www.cookiewx.com/_functions/cookiewxConsent", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});

    log("📡 CookieWX → backend", payload);
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
    saveConsent({ essenziali:true, funzionali:false, statistici:false, marketing:false }, "ess-only");
    hideBanner();
    kickReload();
  };

  root.querySelector('[data-cwx="prefs"]').onclick = function () {
    hideBanner();
    showPreferences(); // lo faremo dopo
  };
}

  function bindPolicyLink() {
  var link = document.querySelector('[data-cwx-policy]');
  if (!link) return;

  var url = getPolicyUrl();
  if (url) {
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
  } else {
    link.style.display = "none"; // se non configurata
  }
}
// =========================================================
// CAP. 6 — UI: PREFERENZE COOKIE (CUSTOM)
// =========================================================

// stato temporaneo (prima del salvataggio)
var CWX_TEMP_PREFS = {
  funzionali: true,
  statistici: true,
  marketing: true
};

// ---------- HTML ----------
var CWX_PREFERENCES_HTML = `
<div id="cookiewx-preferences" style="
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.55);
  z-index:2147483647;
  display:flex;
  align-items:center;
  justify-content:center;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
">
  <div style="
    background:#ffffff;
    max-width:560px;
    width:92%;
    padding:26px;
    border-radius:14px;
    box-shadow:0 8px 30px rgba(0,0,0,.25);
  ">
    <h2 style="margin-top:0;font-size:22px;font-weight:600;">
      Gestisci preferenze cookie
    </h2>

    <p style="font-size:14px;color:#444;margin-bottom:22px;">
      Puoi scegliere quali categorie di cookie consentire.
      I cookie essenziali sono sempre attivi perché necessari al corretto funzionamento del sito.
    </p>

    <!-- ESSENZIALI -->
    <div class="cwx-row">
      <div>
        <strong>Essenziali</strong><br>
        <small style="color:#555;">
          Necessari per il funzionamento del sito, come accesso alle aree riservate,
          sicurezza e gestione delle operazioni di base. Non raccolgono dati personali
          e non possono essere disattivati.
        </small>
      </div>

      <label class="cwx-switch cwx-disabled">
        <input type="checkbox" checked disabled>
        <span class="cwx-slider"></span>
      </label>
    </div>

    <!-- FUNZIONALI -->
    <div class="cwx-row">
      <div>
        <strong>Funzionali</strong><br>
        <small style="color:#555;">
          Consentono al sito di ricordare le tue preferenze, come lingua, area geografica
          o impostazioni personalizzate, migliorando l’esperienza di navigazione.
        </small>
      </div>

      <label class="cwx-switch">
        <input type="checkbox" data-cwx-pref="funzionali">
        <span class="cwx-slider"></span>
      </label>
    </div>

    <!-- STATISTICI -->
    <div class="cwx-row">
      <div>
        <strong>Statistici</strong><br>
        <small style="color:#555;">
          Raccolgono informazioni in forma aggregata e anonima sull’utilizzo del sito,
          aiutandoci a migliorarne contenuti, prestazioni e funzionalità.
        </small>
      </div>

      <label class="cwx-switch">
        <input type="checkbox" data-cwx-pref="statistici">
        <span class="cwx-slider"></span>
      </label>
    </div>

    <!-- MARKETING -->
    <div class="cwx-row" style="margin-bottom:26px;">
      <div>
        <strong>Marketing</strong><br>
        <small style="color:#555;">
          Utilizzati per mostrarti contenuti e annunci personalizzati in base ai tuoi
          interessi. Possono essere impiegati anche da servizi di terze parti.
        </small>
      </div>

      <label class="cwx-switch">
        <input type="checkbox" data-cwx-pref="marketing">
        <span class="cwx-slider"></span>
      </label>
    </div>

    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button data-cwx-pref-action="cancel">Annulla</button>
      <button data-cwx-pref-action="save">Salva preferenze</button>
    </div>
  </div>
</div>
`;
(function injectPreferencesStyle() {
  if (document.getElementById("cwx-preferences-style")) return;

  var style = document.createElement("style");
  style.id = "cwx-preferences-style";
  style.textContent = `
    /* ===============================
       CookieWX – Toggle & Interazioni
       =============================== */

    .cwx-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .cwx-switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0; /* 🔑 FIX DEFINITIVO */
    }

    .cwx-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .cwx-slider {
      position: absolute;
      inset: 0;
      background-color: #d0d0d0;
      border-radius: 24px;
      transition: background-color .25s ease, box-shadow .25s ease;
      cursor: pointer;
    }

    .cwx-slider:before {
      content: "";
      position: absolute;
      height: 18px;
      width: 18px;
      left: 3px;
      top: 3px;
      background-color: #ffffff;
      border-radius: 50%;
      transition: transform .25s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,.3);
    }

    .cwx-switch input:checked + .cwx-slider {
      background-color: #2ecc71;
    }

    .cwx-switch input:checked + .cwx-slider:before {
      transform: translateX(20px);
    }

    /* Hover state */
    .cwx-switch:hover .cwx-slider {
      box-shadow: 0 0 0 6px rgba(46,204,113,.15);
    }

    /* Stato ESSENZIALI (disabilitato) */
    .cwx-disabled {
      opacity: .55;
      pointer-events: none;
    }

    .cwx-disabled .cwx-slider {
      background-color: #e5e5e5;
    }

    .cwx-disabled .cwx-slider:before {
      background-color: #f8f8f8;
      box-shadow: none;
    }

    /* Bottoni */
    #cookiewx-preferences button {
      transition: transform .15s ease, box-shadow .15s ease;
    }

    #cookiewx-preferences button:active {
      transform: scale(.96);
    }
    /* ===============================
   TESTI – dimensioni leggibili
   =============================== */

#cookiewx-preferences h2 {
  font-size: 22px;
  line-height: 1.3;
}

#cookiewx-preferences p {
  font-size: 15px;
  line-height: 1.6;
}

#cookiewx-preferences strong {
  font-size: 15px;
}

#cookiewx-preferences small {
  font-size: 13px;
  line-height: 1.5;
}

/* ===============================
   BOTTONI – visibili e coerenti
   =============================== */

#cookiewx-preferences button {
  font-size: 14px;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

/* Annulla */
#cookiewx-preferences button[data-cwx-pref-action="cancel"] {
  background: transparent;
  color: #555;
}

/* Salva preferenze */
#cookiewx-preferences button[data-cwx-pref-action="save"] {
  background: #000;
  color: #fff;
  box-shadow: 0 6px 16px rgba(0,0,0,.2);
}
  `;

  document.head.appendChild(style);
})();

// ---------- SHOW ----------
function showPreferences() {
  if (document.getElementById("cookiewx-preferences")) return;

  var wrap = document.createElement("div");
  wrap.innerHTML = CWX_PREFERENCES_HTML;
  document.body.appendChild(wrap.firstElementChild);

  // inizializza da consenso esistente (se presente)
  var existing = readConsentFromStorage();
  if (existing) {
    CWX_TEMP_PREFS = {
      funzionali: existing.funzionali,
      statistici: existing.statistici,
      marketing: existing.marketing
    };
  }

  // applica stato agli switch
  document.querySelectorAll("[data-cwx-pref]").forEach(function (el) {
    var k = el.getAttribute("data-cwx-pref");
    el.checked = !!CWX_TEMP_PREFS[k];
  });

  bindPreferencesEvents();
}

// ---------- HIDE ----------
function hidePreferences() {
  var el = document.getElementById("cookiewx-preferences");
  if (el) el.remove();
}

// ---------- EVENTS ----------
function bindPreferencesEvents() {
  var root = document.getElementById("cookiewx-preferences");
  if (!root) return;

  // toggle
  root.querySelectorAll("[data-cwx-pref]").forEach(function (el) {
    el.onchange = function () {
      var k = el.getAttribute("data-cwx-pref");
      CWX_TEMP_PREFS[k] = el.checked;
    };
  });

  // annulla
  root.querySelector('[data-cwx-pref-action="cancel"]').onclick = function () {
    hidePreferences();
    showBanner();
  };

  // salva
  root.querySelector('[data-cwx-pref-action="save"]').onclick = function () {
    saveConsent(
      {
        essenziali: true,
        funzionali: CWX_TEMP_PREFS.funzionali,
        statistici: CWX_TEMP_PREFS.statistici,
        marketing: CWX_TEMP_PREFS.marketing
      },
      "custom"
    );

    hidePreferences();
    hideBanner();
    kickReload();
  };
}

  // =========================================================
// CAP. 7 — UI: FLOATING BADGE (CookieWX)
// =========================================================

var CWX_BADGE_ID = "cookiewx-badge";

// ---------- HTML ----------
var CWX_BADGE_HTML =
  '<div id="' + CWX_BADGE_ID + '" class="cwx-badge">🍪</div>';

  (function injectBadgeStyle() {
  if (document.getElementById("cwx-badge-style")) return;

  var style = document.createElement("style");
  style.id = "cwx-badge-style";
  style.textContent = `
.cwx-badge {
  position: fixed;
  bottom: 20px;
  left: 20px;

  font-size: 22px;              /* 🔽 più piccolo */
  cursor: pointer;
  z-index: 2147483647;

  background: none;
  box-shadow: none;

  opacity: .45;                 /* 🔽 più trasparente */
  transform: scale(.85) translateY(10px);

  transition:
    opacity .25s ease,
    transform .25s ease;
}

.cwx-badge.cwx-show {
  opacity: .6;
  transform: scale(.9) translateY(0);
}
/* Hover desktop / focus */
.cwx-badge:hover,
.cwx-badge:focus-visible {
  opacity: 1;
  transform: scale(1);
}

.cwx-badge.cwx-pulse {
  animation: cwx-pulse 2s infinite;
}

@keyframes cwx-pulse {
  0%   { transform: scale(.9); }
  50%  { transform: scale(1); }
  100% { transform: scale(.9); }
}
@media (max-width: 768px) {
  /* contenitore modale */
  #cookiewx-preferences > div {
    max-height: 85vh;              /* ⬅️ evita tagli */
    overflow-y: auto;              /* ⬅️ scroll interno */
    padding-bottom: 96px;          /* ⬅️ spazio per i bottoni */
  }

  /* footer bottoni sempre visibile */
  #cookiewx-preferences > div > div:last-child {
    position: sticky;
    bottom: 0;
    background: #fff;
    padding-top: 12px;
    padding-bottom: 12px;
    margin-top: 16px;
    z-index: 2;
  }
}
`;
  document.head.appendChild(style);
})();

// ---------- SHOW ----------
function showBadge() {
  if (!document.body) {
    requestAnimationFrame(showBadge); // ⛑️ attende Wix
    return;
  }

  var el = document.getElementById(CWX_BADGE_ID);

  if (!el) {
    var wrap = document.createElement("div");
    wrap.innerHTML = CWX_BADGE_HTML;
    document.body.appendChild(wrap.firstElementChild);
    bindBadgeEvents();
    el = document.getElementById(CWX_BADGE_ID);
  }

  requestAnimationFrame(function () {
    if (!el) return;
    el.classList.add("cwx-show");
    updateBadgeState();
  });
}

// ---------- HIDE ----------
function hideBadge() {
  if (!document.body) return;

  var el = document.getElementById(CWX_BADGE_ID);
  if (!el) return;

  el.classList.remove("cwx-show");

  setTimeout(function () {
    if (el && el.parentNode) el.remove();
  }, 350);
}

// ---------- EVENTS ----------
function bindBadgeEvents() {
  var el = document.getElementById(CWX_BADGE_ID);
  if (!el) return;

  el.onclick = function () {
    hideBanner();
    showPreferences();
  };
}

// ---------- STATE UPDATE ----------
function updateBadgeState() {
  var el = document.getElementById(CWX_BADGE_ID);
  if (!el) return;

  var c = readConsentFromStorage();

  el.classList.remove("cwx-pulse");

  if (!c) {
    // nessun consenso → anima
    el.title = "Gestisci preferenze cookie";
    el.classList.add("cwx-pulse");
  } else {
    // consenso presente → fermo
    el.title = "Preferenze cookie";
  }
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
    version: "2.2.0",
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

  // ---------- COOKIE WRITE GUARD ----------
(function guardDocumentCookie() {
  try {
    var originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

    if (!originalCookie || !originalCookie.set) return;

    Object.defineProperty(document, "cookie", {
      configurable: true,
      enumerable: true,
      get: function () {
        return originalCookie.get.call(document);
      },
      set: function (value) {
        // prova a capire categoria dal nome cookie
        var name = String(value).split("=")[0].trim().toLowerCase();

        // cookie essenziali sempre ammessi
        if (
          name.indexOf("session") !== -1 ||
          name.indexOf("csrf") !== -1 ||
          name.indexOf("wix") !== -1
        ) {
          originalCookie.set.call(document, value);
          return;
        }

        // se non ho consenso marketing/statistici → blocco
        var c = window.CookieWX && window.CookieWX.consent;
        if (!c || (!c.statistici && !c.marketing)) {
          log("🧱 CookieWX blocca COOKIE write:", value);
          return;
        }

        originalCookie.set.call(document, value);
      }
    });
  } catch (e) {
    log("⚠️ CookieWX cookie guard error", e);
  }
})();
  
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
  function getPolicyUrl() {
  try {
    return (
      window.CookieWX &&
      window.CookieWX.regole &&
      window.CookieWX.regole.policyUrl
    ) || null;
  } catch (_) {
    return null;
  }
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

  // 🔹 1) regole
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

  showBadge();

  // ✅ NON toccare favicon se c’è consenso
} else {
  window.CookieWX.consent = { funzionali: false, statistici: false, marketing: false };
  log("ℹ️ CookieWX: nessun consenso, mostro banner.");

  showBanner();
  showBadge();

  injectCookieWXFavicon();
  setTimeout(injectCookieWXFavicon, 300);
  setTimeout(injectCookieWXFavicon, 1000);

  enforceIframeTeardown();
}

  // 🔹 3) rianalizza DOM
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
