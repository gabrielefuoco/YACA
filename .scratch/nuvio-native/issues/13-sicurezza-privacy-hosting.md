Status: resolved
Type: research
Punto: P27, P29
Blocked by: —

# 13 — Sicurezza, privacy, termini e hosting

## Domanda

Quali sono i requisiti di sicurezza, privacy, termini e hosting per un’integrazione account-level con
Nuvio e per un poster endpoint globale? Servono risposte concrete su credenziali, consenso, token,
2FA, rate limit, dati watch, CDN e self-hosted vs cloud. Non è un tema legale astratto: è ciò che decide
se il push account e il poster URL sono fattibili.

## Cosa deve uscire

Una nota in `ricerche/13-sicurezza-privacy-hosting.md` con:

- **threat model**: password Nuvio, access/refresh token, publishable key, endpoint poster, dati di
  library/storia, log.
- **credenziali**: dove vivono, per quanto, chi le legge; meglio client-side o server-side? Cosa fa
  Kaptain (browser diretto) e cosa dovrebbe fare YACA (self-hosted, server-side).
- **2FA/PIN**: cosa è supportato dall’API pubblica e cosa no; cosa fare se l’utente ha 2FA.
- **consenso**: cosa chiedere prima di leggere library/storia, cosa scrivere nel push, opt-out,
  cancellazione.
- **rate limit/abuse**: 100 req/s dichiarati, 429, backoff, batching, quote per utente.
- **termini/notice**: licenza docs, trademark, hosted service, endpoint interni; cosa si può chiamare
  “Nuvio-native” e cosa no.
- **hosting**: self-hosted vs YACA Cloud; costo CDN per poster; storage artwork; uptime; privacy.
- **requisiti minimi**: checklist security prima di qualsiasi push reale.

## Fonti primarie

- Nuvio docs v1.3: notice, auth, rate limits, error handling.
- Kaptain: `nuvio-push.js` (auth client-side, token refresh, retry 429, no backend).
- YACA: `.env.example`, `src/configurazione/*`, auth/session, secrets handling, Docker deployment.
- Nuvio privacy/terms page, se esiste; altrimenti la notice della docs.
- Pictorium: gestione API key/PIN/multi-user, per un confronto.

## Come si chiude

La nota è pronta quando:

1. il threat model è scritto e ha mitigazioni;
2. la scelta client-side vs server-side è motivata;
3. consenso/retention/cancellazione sono espliciti;
4. rate limit e 429 hanno un piano;
5. hosting e costi sono dimensionati;
6. c’è una checklist “prima di pushare davvero”.

---

## Esito

**Risolto il 20/10/2026** — nota completa in
[`ricerche/13-sicurezza-privacy-hosting.md`](../ricerche/13-sicurezza-privacy-hosting.md).

- **Account-level = delega di credenziali, non OAuth**: Nuvio non offre scope, token per-app o
  per-profilo; un token vede e scrive tutti i 6 profili.
- **Password Nuvio mai ai server YACA**: modello browser-direct (Kaptain) per il push one-shot;
  server-side solo opt-in, con refresh token cifrato e dopo i fix.
- **Falle YACA da chiudere prima**: `/api/user/:userId` senza sessione, `apiKeys` in `/api/auth/me` e
  `/api/configure`, backup non cifrati, nessuna cancellazione account né revoca sessione.
- **Poster globale = endpoint pubblico senza token**: il rischio è abuso/costo/log, non auth; servono
  R2 + CDN, badge allowlist, rate limit e fail-open.
- **Termini/brand**: solo endpoint pubblici v1.3, niente PIN/provider/guarded RPC; “Nuvio-native” resta
  interno, pubblicamente “compatibile con Nuvio” senza logo.
- **Hosting**: self-hosted per l’account sync, YACA Cloud solo poster/catalog; Tailscale Funnel non
  basta per immagini di massa.
- **Costi indicativi**: ~$15/mese a 100k poster views/day, ~$45–55 a 1M, ~$320–450 a 10M.
- **Ordine giusto**: poster URL → collections → lettura library/history → push account. Il push è
  l’ultimo passo, non il primo.

