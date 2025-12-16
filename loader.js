/* ======================================================
   CookieWX Loader v1
   Deve essere caricato in <head>
====================================================== */

(function () {
  if (window.__COOKIEWX_LOADER__) return;
  window.__COOKIEWX_LOADER__ = true;

  console.log("🍪 CookieWX Loader avviato");

  // Namespace globale CookieWX
  window.CookieWX = {
    version: "1.0.0",
    consent: {
      funzionali: false,
      statistici: false,
      marketing: false
    }
  };

  /* ===========================
     UTILS
  =========================== */
  const isThirdParty = (url) => {
    try {
      const pageHost = location.hostname.replace(/^www\./, "");
      const u = new URL(url, location.origin);
      return !u.hostname.replace(/^www\./, "").includes(pageHost);
    } catch {
      return true;
    }
  };

  const getCategoryFromUrl = (url) => {
    const u = url.toLowerCase();

    if (u.includes("google-analytics") || u.includes("gtag") || u.includes("analytics"))
      return "statistici";

    if (
      u.includes("googletagmanager") ||
      u.includes("doubleclick") ||
      u.includes("facebook") ||
      u.includes("fbq") ||
      u.includes("pixel")
    )
      return "marketing";

    return "marketing"; // default conservativo
  };

  /* ===========================
     OVERRIDE SCRIPT
  =========================== */
  const originalCreateElement = document.createElement.bind(document);

  document.createElement = function (tagName, options) {
    const el = originalCreateElement(tagName, options);

    if (tagName.toLowerCase() === "script") {
      Object.defineProperty(el, "src", {
        set(src) {
          if (src && isThirdParty(src)) {
            const categoria = getCategoryFromUrl(src);
            queue.scripts.push({ src, categoria });
            console.log("⛔ Script intercettato:", src, categoria);
            return;
          }
          el.setAttribute("src", src);
        },
        get() {
          return el.getAttribute("src");
        }
      });
    }

    if (tagName.toLowerCase() === "iframe") {
      Object.defineProperty(el, "src", {
        set(src) {
          if (src && isThirdParty(src)) {
            const categoria = getCategoryFromUrl(src);
            queue.iframes.push({ src, categoria });
            console.log("⛔ Iframe intercettato:", src, categoria);
            return;
          }
          el.setAttribute("src", src);
        },
        get() {
          return el.getAttribute("src");
        }
      });
    }

    return el;
  };

  /* ===========================
     API PUBBLICA
  =========================== */
  window.CookieWX = {
    allow(categories = []) {
      categories.forEach(c => consent[c] = true);
      flush();
    },
    deny(categories = []) {
      categories.forEach(c => consent[c] = false);
    },
    setConsent(pref) {
      Object.assign(consent, pref);
      flush();
    },
    getState() {
      return { ...consent };
    }
  };

  /* ===========================
     RILASCIO CODA
  =========================== */
  function flush() {
    // SCRIPT
    queue.scripts = queue.scripts.filter(item => {
      if (consent[item.categoria]) {
        const s = originalCreateElement("script");
        s.src = item.src;
        s.async = true;
        document.head.appendChild(s);
        console.log("▶️ Script rilasciato:", item.src);
        return false;
      }
      return true;
    });

    // IFRAME
    queue.iframes = queue.iframes.filter(item => {
      if (consent[item.categoria]) {
        const i = originalCreateElement("iframe");
        i.src = item.src;
        i.loading = "lazy";
        document.body.appendChild(i);
        console.log("▶️ Iframe rilasciato:", item.src);
        return false;
      }
      return true;
    });
  }

})();
