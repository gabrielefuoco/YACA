Status: ready-for-agent
Type: task

# 51 — `src/db` torna infrastruttura: i nomi appresi vanno alla ricerca

## Perché

`docs/INDEX.md:19` scrive la regola: *«`src/db/` resta riservato all'infrastruttura del database (connessione,
migrazioni)»*. Oggi `src/db/` ha quattro file, e **uno solo** rispetta la regola:

| file | righe | cos'è | dove deve stare |
|---|---|---|---|
| `connection.js` | 15 | la connessione Mongoose | **resta** |
| `learnedNames.js` | **362** | i **nomi appresi** dalla ricerca (apprendimento dei titoli) | `src/ricerca/` |
| `tier1Promotion.js` | 308 | promozione Tier 2 → Tier 1 | → `src/indice/` (**ticket 48**) |
| `tier1LazyPromotion.js` | 147 | la stessa, pigra | → `src/indice/` (**ticket 48**) |

Questo ticket chiude **`learnedNames`** (i due `tier1*` sono del ticket 48, che possiede già `src/db/tier1*.js`:
non toccarli). I nomi appresi sono **ricerca**: per il §16 la ricerca possiede «da una richiesta a una lista
ordinata», e `learnedNames` è la memoria dei nomi che la ricerca ha imparato — è consumato da
`src/ricerca/tier2Search.js` e da `src/ricerca/tier2Enrich.js`, entrambi già nel modulo ricerca.

## Cosa deve uscire

1. **`src/db/learnedNames.js` → `src/ricerca/learnedNames.js`**, con i consumatori ripuntati:
   `src/ricerca/tier2Search.js:43`, `src/ricerca/tier2Enrich.js:72` (require pigri), `scripts/seed_learned_names.js`,
   `src/db/tier1LazyPromotion.js` **se** lo nomina (verifica prima di toccarlo — quel file è del ticket 48).
2. **La porta della ricerca** (`src/ricerca/index.js` o il registro) espone ciò che serve a `scripts/` e al
   prodotto, così chi sta fuori non nomina un file interno.
3. Alla fine, `src/db/` contiene **solo infrastruttura**: `connection.js` (e i `tier1*` **se e quando** il ticket 48
   non è ancora atterrato — verifica lo stato di `main` prima di dichiarare il ticket chiuso).

## La prova

- `ls src/db` → **solo** `connection.js` (e, se il ticket 48 non è atterrato, `tier1*.js` — dillo nell'Esito).
- `git grep -n "db/learnedNames"` in `src/`, `scripts/`, `tests/` → nessun `require` vivo.
- `node -e "require('./src/ricerca/learnedNames'); require('./src/ricerca'); console.log('ok'); process.exit(0)"`.
- `npx jest tests/learnedNames.test.js tests/searchLearnedNames.test.js tests/tier2LearnedNamesEnrich.test.js tests/tier2SearchEnrich.test.js --forceExit`.
- La suite intera con la baseline misurata (5 suite / 8 test / 1868 passati; incolla lista `FAIL` e totali) e i due
  hash del manifest invariati.

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/db/learnedNames.js`, `src/ricerca/learnedNames.js` (nuovo),
`src/ricerca/tier2Search.js`, `src/ricerca/tier2Enrich.js`, `src/ricerca/index.js`, `scripts/seed_learned_names.js`,
e i test che nominano `learnedNames`.
**Non tocca**: `src/db/tier1*.js` (ticket 48), `src/utils/**`, `services/tmdb-daemon/**`, `src/dna/**`,
`src/profile/**`, `src/meta/**`, `src/middleware/**`, `src/id_mapping/**`, `index.js`.
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito**.

## Regole

Valgono i Vincoli del ticket 48 (baseline misurata, mock di Jest, path relativi dopo uno spostamento, getter pigro,
niente `frontend/**`, niente push, un commit per passo). Aggiungi un `## Esito` in italiano e lascia
`Status: ready-for-agent`.
