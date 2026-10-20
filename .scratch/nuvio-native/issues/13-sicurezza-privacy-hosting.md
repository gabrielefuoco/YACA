Status: open
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
