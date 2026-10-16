Status: ready-for-agent
Type: task
Blocked by: 10

# 11 — Il client nomina solo il dominio

## Perché

È la metà visibile della decisione 4: il client è un **orchestratore** (`frontend/src/components/dashboard/*`,
50 file, 13 chiamate a `/api/profiles/*` più dieci rotte di infrastruttura). Il server ora ha la lingua nuova
(ticket 10): qui il client la impara e smette di nominare l'interno.

## Cosa deve uscire

- **Le chiamate cambiate**, componente per componente, secondo la tabella del ticket 03. Nessun
  `/api/tmdb/*`, `/api/sync/*`, `/api/validate-*`, `/api/clear-cache` nel client.
- **La sequenza assorbita**: dove il client faceva tre chiamate per disegnare un pannello, ne fa una. La
  verifica è il conteggio delle chiamate, non l'impressione che il codice sia più bello.
- **Lo stato di UI resta al client**: cosa è aperto, cosa è in modifica, cosa è in attesa. Nessun pezzo di
  *presentazione* si sposta nel server.
- **La regola, scritta dove serve**: un commento in testa al client (o in `frontend/README.md`) che dice che il
  client non nomina l'infrastruttura, con la ragione — perché fra sei mesi qualcuno aggiungerà
  `/api/tmdb/search/keyword` ed è esattamente così che è nato il problema. Se esiste un lint possibile senza
  costruire un'infrastruttura, meglio: un test che fallisce se compare `'/api/tmdb'` in `frontend/src` è
  dieci righe e non costa una build.
- **Le rotte vecchie**: si smontano solo quelle che nessuno chiama più — con il `grep` che lo dimostra, non
  con la fiducia.
- **La CI**: il frontend lo verifica la CI (esbuild/next build). In anello si usa il test jest, non `npm run
  build` (`tests/` è la suite veloce).

## Come si verifica

Prima e dopo: il conteggio delle chiamate del client per rotta (`grep -rhoE "'/api/[a-z0-9/_-]+" frontend/src |
sort | uniq -c | sort -rn`), e la dashboard che funziona sul deploy vero — accedere, configurare un profilo,
salvare, e vedere l'anteprima. Il numero è la prova; la dashboard che si apre è la conferma.

## Attenzione

Un test end-to-end del client non esiste oggi, e questo ticket non lo inventa: la prova è l'uso reale sul
deploy. Se l'uso reale non è possibile (sessione, ambiente), **dirlo nel ticket** invece di chiuderlo con la
CI verde — la CI verde su un client rotto è la storia già vista in questa repo.

---

## Emendamento — revisione esterna del 17/10/2026 (verificato)

### Il `grep` proposto non conta le chiamate vere

**Verificato**: `frontend/src/lib/api.ts` costruisce **tutte** le rotte dei profili con stringhe template
(`/api/profiles/${encodeURIComponent(profileId)}/raw-data?userId=…`), e le rotte di `src/api/stremio.js`
**non hanno il prefisso `/api`** (`/check-user`, `/stremio-auth`, `/trakt/device/code`). Quindi il comando
proposto nel ticket 03 (`grep -rhoE "'/api/[a-z0-9/_-]+" frontend/src`) conta le rotte letterali e **manca
proprio quelle che stiamo cercando**.

Il conteggio si fa così:

```bash
# le rotte chiamate, template string comprese, senza doppioni
grep -rhoE "/(api/)?[a-z0-9-]+(/[a-zA-Z0-9_$-]+)*(\?|\`|'|\")" frontend/src/lib/api.ts \
  | sed "s/[\`'\"?].*//" | sort | uniq -c | sort -rn
```

E il **prima/dopo** si misura su quello, più i chiamanti per singola funzione (es. `syncVectors` → 0 chiamanti:
la sua rotta muore, non si riporta).
