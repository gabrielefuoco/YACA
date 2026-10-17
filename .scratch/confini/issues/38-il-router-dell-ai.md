Status: ready-for-agent
Type: task

# 38 — Il router dell'AI è un caso d'uso, non un meccanismo

## Perché

Il ticket 27 ha fatto la cosa giusta: ha spostato i prompt della ricerca nel loro modulo
(`src/ricerca/prompts.js`) e ha estratto il **meccanismo** (`src/ai/client.js`: `createAiClient`), svuotando
`src/ai/prompts.js` (decisione 22: *l'AI fornisce il meccanismo, non i prompt*).

Ma è rimasto un residuo che si vede dalla direzione delle dipendenze: **`src/ai/router.js` importa
`../ricerca/prompts`**. Cioè il meccanismo dipende da una funzione — mentre dovrebbe essere il contrario.

`router.js` non è un meccanismo: è un **caso d'uso** (`generateTmdbFiltersFromPrompt`, `routeLiveStremioSearch` —
«da una frase dell'utente ai filtri TMDB»). I suoi consumatori lo confermano: `src/api/catalog.js`,
`src/api/configurazione.js` (le rotte di ricerca) e `src/catalog/providers/AiDiscoveryProvider.js` (i cataloghi
AI discovery). Tutti e tre **cercano**: è il modulo ricerca che possiede questa capacità, e il provider del
catalogo ne è un **cliente**.

## Cosa deve uscire

1. `router.js` va nel modulo che possiede i prompt e il caso d'uso: **`src/ricerca/`** (accanto a `aiAdapter.js`).
2. `src/ai/` resta il **meccanismo**: `client.js` (`createAiClient`) e nient'altro che sappia di prompt o di
   ricerca.
3. I tre consumatori ripuntati; `src/ai/index.js` non riesporta più il router.
4. **La prova è la direzione delle dipendenze**: nessun file in `src/ai/` importa da `src/ricerca/` (col `grep`
   che lo dimostra). È l'unica prova che conta: il resto è già verde.

## Come si verifica

- `grep -rn "ricerca" src/ai/` → zero.
- `grep -rn "ai/router" src/` → zero (i consumatori usano `ricerca/…`).
- Le suite toccate verdi una alla volta: `tests/aiSearch.test.js`, `tests/ricercaDoor.test.js`,
  `tests/stremioProtocolFixes.test.js`, e quelle dei cataloghi AI discovery.

## Nota

Non è urgente e non è un guasto: è **la direzione di una freccia**. Ma è esattamente il tipo di cosa che, non
scritta, al prossimo giro diventa «perché `ai/` conosce i prompt della ricerca?» — e la risposta sarà un
`git blame` invece di una decisione.
