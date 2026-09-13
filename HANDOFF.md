# HANDOFF — cookiewx-cdn (loader CookieWX + demo)

> File di coordinamento tra conversazioni Kimi Work. **Leggilo prima di
> modificare il loader.** Aggiornalo quando finisci un blocco di lavoro,
> poi committa e pusha.

Ultimo aggiornamento: 2026-09-14 ~01:00 (conversazione "frontend/scanner")

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

- 2026-09-14: HANDOFF.md aggiunto (conversazione frontend/scanner).
