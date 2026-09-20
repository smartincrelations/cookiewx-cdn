# HANDOFF — cookiewx-cdn (loader CookieWX + demo)

> 🧠 **Esiste una memoria centrale di progetto: `../STATO-PROGETTO.md`
> (cartella herowx-cloud). Leggila all'inizio e aggiornala alla fine.**
> Questo HANDOFF resta il riferimento specifico di cookiewx-cdn.

> File di coordinamento tra conversazioni Kimi Work. **Leggilo prima di
> modificare il loader.** Aggiornalo quando finisci un blocco di lavoro,
> poi committa e pusha.

Ultimo aggiornamento: 2026-09-20 22:40 (conversazione "SCOUT" — B24 loader v4.6.0 beacon Analytics)

## Repo

- GitHub **PUBBLICO**: `smartincrelations/cookiewx-cdn` (branch `main`)
  → mai committare segreti, chiavi, token o dati personali.
- Deploy: Cloudflare Pages `cookiewx-cdn.pages.dev` con auto-deploy da Git
  (ogni push su main va live in ~1 min). Demo: /demo.html
- I siti clienti caricano `loader.js` da questo CDN: ogni modifica è
  potenzialmente in produzione sui siti dei clienti. Testare prima su
  demo.html / demo locale.

## Regole di convivenza (due conversazioni in parallelo)

1. `git pull --rebase origin main` PRIMA di modificare.
2. Cambiamenti che non riconosci = altra conversazione: integra, non
   sovrascrivere.
3. Il loader ha un fallback: senza config backend usa il comportamento di
   default; se `window.COOKIEWX_API` è impostato prova il nuovo backend.
   Non rompere questo contratto.
4. Commit piccoli, messaggi in italiano, push subito dopo.

## Stato

### Fatto
- Loader v4.3: dual-write consenso (Wix `_functions/cookiewxConsent` +
  api.cookiewx.com/consent), getRegole switchato su api.cookiewx.com
- Blocco config-banner dal backend (pullConfigFromBackend nel boot,
  commit 8193a76) + dominio via `bannerDominio()` per il consenso al
  backend custom se `COOKIEWX_API` è impostato
- Branch `feature/loader-v4.3-backend-config`: lavoro originale config banner

### Note
- Righe 62-81: blocco "NUOVO BACKEND v4.3" in parte dead code (path
  `/api/regole`): da pulire in futuro, non urgente.
- 🔴 Noto da SECURITY-REVIEW-2026-09-11.md (workspace root): loader accetta
  postMessage senza validazione origine — patch in sospeso.

## Ultime modifiche

- 2026-09-20 22:40 (chat SCOUT): **B24 — loader v4.6.0** (commit `30b8c4d`).
  Beacon Analytics add-on (📮 contratto BASTION su STATO-PROGETTO): batch
  `sendBeacon` su `api.cookiewx.com/api/analytics/collect` ogni 10s e a
  pagehide/visibilitychange, max 50 eventi. Gating duro: si attiva SOLO se
  `getRegole` dichiara `analytics:true` (letto PRIMA del guard di versione
  di `applyPulledRegole`) **e** c'è la chiave sito. Modalità A (default):
  eventi solo con consenso statistici, ID anonimo in sessionStorage
  (`cookiewxAnVid`), mai cookie. Modalità B pronta: se getRegole esporrà
  `analyticsPre:true`, pre-consenso solo pageview `anon:true`. Eventi:
  pageview/heartbeat(30s, solo tab visibile)/exit_click/click
  (`data-cwx-track`)/scroll 25-50-75-100/perf + consent
  (mostrato/accettato/rifiutato/personalizzato, SEMPRE anonimi, buffer se
  getRegole non è ancora tornato). Privacy: mai querystring in p/r, UTM
  solo come campi s/m/c, exit_click solo host. Hook diagnostica:
  `CookieWX.analyticsControl(flag, pre)` (per test SENTINEL/PALCO; il
  server scarta comunque se l'add-on è spento). ⚠️ Nota rollout: siti con
  snippet SENZA `data-cookiewx-key` (grace legacy, es. latinaebusiness.it)
  non manderanno mai beacon — la chiave nello snippet è obbligatoria.
  E2E locale (`test-b24-server.py` + Chrome headless): scenario attivo →
  7/7 tipi evento + 4 soglie scroll ✅; scenario gating senza chiave →
  zero traffico ✅. Live: CDN serve v4.6.0 ✅.
- 2026-09-18 23:40 (chat BRIDGE): **BR8 — loader v4.5.1** (commit `14b3afc`).
  Bug segnalato da Ugo: banner con "…marketing. ." (punto orfano quando il
  link policy è nascosto). Fix: punto dentro `<span data-cwx-policy-wrap>`,
  `bindPolicyLink()` nasconde/mostra il wrapper intero. E2E: www.cookiewx.com
  (policy_url da B17) → link cliccabile ✅; demo.html (policyUrl vuota) →
  punto singolo, wrapper nascosto ✅. ⚠️ Nota: con B11 live, `demo.html` e
  `test-br7.html` (regole `repubblica.it`, dominio non censito) prendono 403
  `chiave_richiesta`/`chiave_sconosciuta` → demo scan-to-block senza regole:
  in 📮 su STATO-PROGETTO per decisione REGIA/BASTION.
- 2026-09-16 13:30 (chat BRIDGE): **BR7 — loader v4.5.0** (commit `bc20c70`).
  Chiave sito (task deciso da Ugo 12:17, backend = B11 BASTION): lettura da
  `data-cookiewx-key` sullo script tag (preferita) o `?k=` nell'URL del
  loader o override `window.COOKIEWX_SITE_KEY`; inviata come `k` nel payload
  `/consent` e come `&k=` su `getRegole` e `/api/config`. **Cache config** in
  localStorage (`cookiewxCfgCacheV1`, TTL 24h) con **fail-open** duro: cache
  fresca → zero chiamate; scaduta → banner subito con ultima config valida +
  ri-validazione in background (timeout 1s). Senza chiave: comportamento
  identico a prima (grace legacy, decide il server). E2E live su
  `test-br7.html`: attributo ✅, `?k=` ✅, payload consenso con k →
  `/consent` 200 (D1 id=424, loader 4.5.0), cache fresca → nessuna chiamata
  config + titolo banner da cache ✅, cache scaduta → fail-open +
  ri-validazione con k ✅. Nota per BASTION in 📮 (contratto campo `k`).
- 2026-09-16 02:45 (chat BRIDGE): **BR6 — loader v4.4.1** (commit `3f46cfa`).
  Task approvato da Ugo 2026-09-16 00:20 via REGIA: secondaria Wix SPENTA
  (`CONSENT_URL_WIX = null`) — dal cutover U4 la rotta
  `www.cookiewx.com/_functions/cookiewxConsent` rispondeva 405 a ogni
  consenso. Blocco di invio lasciato inattivo dietro guard (riattivabile).
  E2E live: demo.html → POST primario 200, zero chiamate Wix, D1 id=357;
  www.cookiewx.com → POST primario 200, zero chiamate Wix, D1 id=358
  (entrambe loader_version 4.4.1). I consensi vivono solo su D1.
- 2026-09-15 22:20 (chat BRIDGE): **BR4 — referral VERIFICATO, nessun fix
  necessario.** Il loader ha SEMPRE inviato `referrer` nel payload consenso
  (pre-A7: `document.referrer || null`; da A7 v4.3.1: origin+pathname
  sanitizzato). Diagnosi 0/3.084 su Wix: anche il backend Wix
  (`http-functions.js`, fin dal commit iniziale) legge e inserisce
  `referrer` → la causa è lato collection Wix (campo `referrer` quasi
  certamente assente dallo schema di `ConsensiCookieWX`: Wix Data scarta
  in silenzio i campi non in schema). E2E su demo.html con referrer simulato
  (`https://www.google.it/search?q=...`): payload in uscita con
  `referrer:"https://www.google.it/search"` (query strippata, corretto A7) →
  riga D1 id=333 popolata. Bonus: righe REALI id=330-332 da siti clienti
  con referrer Google/Instagram → catena già sana in produzione.
  **Loader NON modificato** (nessun commit su loader.js).
- 2026-09-15 15:35 (chat BRIDGE): **BR3 — loader v4.4.0** (commit `37ba01d`).
  Inversione scrittura consenso pre-cutover (task REGIA, bloccante per U4):
  PRIMARIO = `api.cookiewx.com/consent` (keepalive); Wix
  (`www.cookiewx.com/_functions/cookiewxConsent`) degradato a secondaria
  BEST-EFFORT con timeout duro 4s via AbortController (`WIX_TIMEOUT_MS`) —
  mai bloccante; dopo il cutover la rotta Wix 404irà in silenzio.
  `CONSENT_URL_2` rinominato `CONSENT_URL_WIX`. Test live su demo.html:
  POST primario 200 ✅, POST Wix 200 ✅, consenso v4.4.0 in localStorage,
  banner chiuso + badge ✅, `node --check` ✅. (Righe di consenso di test
  con dominio repubblica.it su entrambi i backend — come da prassi demo.)
- 2026-09-15 12:18 (chat BRIDGE): preparato in `embed-design/scanner-home/`
  (workspace root, NON-repo) il componente scanner per la homepage del nuovo
  sito — esecuzione risposta REGIA 📮 (STATO-PROGETTO.md): BRIDGE prepara,
  PALCO integra in cookiewx-web. `ScannerHomeSection.tsx` (Quick Scan vera su
  api.cookiewx.com, 4 KPI, CTA → /scanner; temi chiaro/scuro) +
  `README-INTEGRAZIONE.md`. Type-check tsc --strict: 0 errori.
  **Questa repo NON è stata toccata** (loader, embed JS e pagine guida
  invariati): aggiornato solo questo HANDOFF per tracciabilità.
  In attesa di Ugo: ① approvazione e ③ posizione widget in homepage.
- 2026-09-15 10:50 (chat BRIDGE): `embed-guida.html` riallineato alla
  decisione prodotto di Ugo — scanner = strumento marketing CookieWX/partner
  (NON proposto ai clienti finali); sigillo = feature clienti, con nota sul
  flusso semplice da dashboard (scansione automatica + snippet precompilato).
- 2026-09-15 10:10 (chat BRIDGE): `embed-guida.html` NUOVO — pagina guida
  embed per clienti (BR1 piano REGIA): demo live dei 2 widget, snippet
  copiabili con bottone "Copia", istruzioni Wix/WordPress/HTML, tabella
  attributi, FAQ. Loader non toccato. Copia tecnica in
  `embed-design/GUIDA-CLIENTI.md` (workspace root, non-repo).
- 2026-09-15 00:30 (chat BRIDGE): `herowx-embed.js` + `embed-demo.html`
  (widget HeroWX: scanner + sigillo, widget token pubblico).
- 2026-09-15 00:04 (chat SENTINEL): patch A7 — loader v4.3.1:
  `sendConsentToBackend` ora invia `url` = `location.origin + location.pathname`
  e `referrer` = origin+pathname (mai più query/hash con token/PII).
  Fallback di contratto intatto (shape payload invariata, solo valori sanificati).
  Test live su demo.html: consenso OK (200 su api.cookiewx.com + dual-write Wix),
  payload verificato senza query (`?resetToken=...` strippato).
- 2026-09-14: HANDOFF.md aggiunto (conversazione frontend/scanner).
