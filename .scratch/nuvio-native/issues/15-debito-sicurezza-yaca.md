Status: open
Type: research
Punto: P31
Blocked by: —

# 15 — Debito di sicurezza YACA: verifica e contratto di remediation

## Domanda

Le falle trovate dalla ricerca 13 sono reali, riproducibili e sufficienti a bloccare YACA Sync? E quale
è il **contratto minimo di remediation** — cosa deve essere vero prima di accettare un token Nuvio —
senza scrivere codice in questa mappa?

La ricerca 13 ha già indicato i sospetti:

- `/api/user/:userId` restituisce l’intero oggetto risolto, `apiKeys` comprese, senza sessione;
- `/api/auth/me` e `/api/configure` restituiscono `stremio`/`tmdb`/`mistral`/`trakt` in chiaro;
- `stremio` authKey e token Trakt in chiaro; logout che cancella solo il cookie;
- backup `mongodump --gzip` non cifrati, 30 giorni su R2;
- `ADMIN_PASS` condivisa, senza 2FA/rate limit dedicato;
- `JWT_SECRET` globale senza rotazione;
- nessuna rotta di cancellazione account, nessuna revoca sessione, nessuna privacy policy.

## Cosa deve uscire

Una nota in `ricerche/15-debito-sicurezza-yaca.md` con:

- **verifica end-to-end** di ogni sospetto: route, middleware, payload, autenticazione, path/riga.
  Distinguere “provato nel codice” da “provato con una richiesta” e da “da testare”.
- **classificazione**: P0 (blocca qualsiasi token terzo), P1 (blocca YACA Cloud/multi-tenant), P2
  (hardening).
- **contratto di remediation**: per ogni P0, cosa deve cambiare e quale criterio di accettazione lo
  dimostra (es. “`GET /api/user/:userId` senza sessione → 401”, “`/api/auth/me` non contiene chiavi”,
  “backup cifrati e retention”, “delete account cancella anche i derivati”).
- **ordine minimo**: quali fix devono precedere il primo push Nuvio, quali possono aspettare.
- **test plan**: richieste concrete, account usa-e-getta, cosa misurare.
- **cosa resta fuori**: remediation implementativa (questa mappa è ricerca) e decisioni di prodotto su
  YACA Cloud.
- **rischio residuo**: cosa rimane anche dopo i fix (token account-wide, PIN non enforced, API Nuvio
  che può cambiare).

## Fonti primarie

- `ricerche/13-sicurezza-privacy-hosting.md` (sospetti e threat model).
- YACA: `index.js` (route), `src/api/auth/index.js`, `src/api/configure/index.js`,
  `src/models/UserConfig.js`, `src/models/UserAccount.js`, `src/configurazione/door.js`,
  `src/api/middleware/adminAuth.js`, `ops/yaca-backup.sh`, `.env.example`.
- Nuvio docs v1.3: auth, profiles, notice, Terms.
- Kaptain `nuvio-push.js`: modello browser-direct.
- Pictorium: PIN/multi-user/API key handling, per confronto.

## Come si chiude

La nota è pronta quando:

1. ogni sospetto P0 è verificato o marcato “da testare” con il motivo;
2. il contratto di remediation ha criteri di accettazione verificabili;
3. l’ordine “prima del primo push” è esplicito;
4. il test plan è eseguibile senza toccare il prodotto;
5. il rischio residuo è dichiarato, non nascosto.
