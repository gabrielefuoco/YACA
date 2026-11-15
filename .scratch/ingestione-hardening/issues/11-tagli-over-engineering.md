Status: ready-for-agent
Type: task
Priorità: P5 (ultima onda: solo dopo che i fix funzionali sono in produzione)
Blocked by: 07 (il taglio 6 è lo stesso lavoro del ticket 07)

# 11 — Tagli di over-engineering con evidenza

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q10** (tabella dei tagli e poi i sei punti con le prove riga per riga). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Regola generale

**Un taglio per commit**, test verdi prima e dopo, nessun cambio di comportamento esterno. Se un taglio
richiede di cambiare una firma usata da altri moduli, si aggiornano **tutti** i chiamanti nello stesso
commit (il grep è parte del lavoro). Se un taglio non è ovvio, si salta: questa lista non è un obiettivo
in sé.

## I sei tagli

### 1. `scripts/push-diff-in-coda.js` — verificatore in coda (~45 righe)
- **Evidenza**: `coda.push()` ritorna `false` **sia** quando l'evento è già in coda (`HSETNX` trova la
  chiave) **sia** quando Redis è giù. Per distinguere, lo script scarica 2.000 eventi con
  `coda.take(2000)` e li scandisce linearmente.
- **Fare**: `codaEventi.push` ritorna `'added' | 'duplicate' | 'error'` (o un `pushWithStatus` affiancato,
  per non rompere i chiamanti esistenti). Rimuovere `verificatoreInCoda` e la costante del lotto di verifica.
- **Test**: push su lista vuota → `added`; push doppio → `duplicate`; Redis giù → `error` (e nessuna
  eccezione, come oggi).

### 2. `src/posters/drenaCodaPoster.js` — Redis e `take` duplicati (~55 righe)
- **Evidenza**: `aspettaRedis` è copiato riga per riga in `scripts/push-diff-in-coda.js` e qui; inoltre il
  primo `coda.take(batch)` serve solo a capire se il lotto contiene un id non-Kitsu, e subito dopo
  `drenaImpl` fa un **secondo** `take`.
- **Fare**: un solo `aspettaRedis` in `codaEventi.js`, esportato; un solo `take`, passato a `drena`
  (oppure caricamento pigro della mappa dentro `cercaKitsu`).
- **Test**: il drenatore esegue **una** `take` per giro (spy/mock sul modulo coda); comportamento identico
  sugli eventi.

### 3. `src/posters/drenaPoster.js` — giro a vuoto sull'id evento (~20 righe)
- **Evidenza**: `erdbIdsDaEvento` restituisce già l'id in forma ERDB (`tmdb:movie:265`), poi `drena` chiama
  `eventoDaErdbId` per spacchettarlo, e `nomeFileDaEvento`/`urlDaEvento` lo ricompongono per chiamare
  `posterFileName`/`posterUrl`.
- **Fare**: `posterFileName({erdbId: id, badge: evento.badge})` e `posterUrl(base, {erdbId: id, badge})`
  diretti. Eliminare `eventoDaErdbId`, `nomeFileDaEvento`, `urlDaEvento`.
- **Verificato**: `posterFileName(entry)` accetta `{erdbId, badge}` e sanifica l'id ✓.
- **Test**: golden sul nome file prodotto per un evento `{tipo:'movie', id:265, badge:'ITA'}` e per un
  evento anime (che genera **due** id: TMDB + Kitsu).

### 4. `src/posters/volumeContract.js` — sync + observer (~45 righe)
- **Evidenza**: `scriviVersioniVolume` e `scriviVersioniVolumeSync` hanno lo stesso corpo per 120 byte di
  JSON; `volumeObserver` esiste solo per i mock.
- **Fare**: tenere l'async, eliminare la sync e l'observer; nei test usare `t.mock.method` di `node:test`.
- **Attenzione**: se qualcuno chiama la sync da un contesto che non può await (drenatore?), verificare con
  `grep -rn "scriviVersioniVolumeSync"` prima di cancellarla.

### 5. `services/doppiaggi-source/src/resolver.js` — path cablato e cache legacy (~25 righe)
- **Evidenza**: `getTmdbApiKey` ha fra i candidati il path assoluto `C:/Users/gabri/APP/YACA/.env` (su
  Linux è rumore, altrove è una falla di portabilità) e parsa il `.env` con una regex;
  `findExistingCacheFile` cerca ancora file di cache legacy con `api_key=` **nel nome**.
- **Fare**: togliere il path assoluto dai candidati (restano `process.env.TMDB_API_KEY` → `.env` in cwd →
  `.env` risalendo). **Non** aggiungere `dotenv`: il servizio non ce l'ha fra le dipendenze e il wrapper
  `ops/yaca-doppiaggi.sh` sorgente già `/srv/yaca/.env`, quindi la variabile c'è. Rimuovere il ramo
  `legacyWithKey`.
- **Test**: senza env var e senza `.env` raggiungibile → errore esplicito ("TMDB_API_KEY mancante"),
  nessun riferimento a percorsi Windows.

### 6. `src/anime/mapping.js` — parser duplicato (~130 righe)
- È **il ticket 07**: non farlo due volte. Questo punto si chiude con quello.

## Fatto quando

1. `npm test` verde e `node --test services/*/tests/` verde dopo **ogni** commit.
2. `git diff --stat` complessivo: ~320 righe nette in meno (45+55+20+45+25+130).
3. Nessuna regressione nei log del drenatore/poster per 24 h dopo il rilascio.

## Rischi e rollback

- Ogni punto è un revert indipendente.
- Il rischio maggiore è il punto 2 (doppio `take`): se il primo `take` viene rimosso male, un evento può
  essere processato due volte. Mitigazione: `done`/`fail` sono idempotenti sulla coda, ma il test deve
  coprire "un solo `take` per giro".
