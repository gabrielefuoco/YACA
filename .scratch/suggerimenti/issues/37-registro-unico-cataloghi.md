Status: resolved
Type: task

# Gli hero sono definiti in OTTO posti, e la duplicazione ha gia' prodotto una divergenza

**Domanda del proprietario**: «in 8 posti? non ha senso, perché? non dovrebbero stare in un punto solo?»
Ha ragione, e la prova che non e' un fastidio teorico e' che la cosa si e' gia' rotta da sola:

    nel manifest (quello che l'utente vede in Stremio):   name:  '⭐ Scelti per Te'
    nella UI (dove l'utente lo seleziona):                label: 'True Blend', emoji: '🎯'

Lo stesso hero ha **due nomi**, in due registri diversi: si seleziona «True Blend» e si vede «⭐ Scelti per
Te». E la fingerprint (`src/utils/manifestFingerprint.js`) copia il nome del manifest **alla lettera**:
una terza copia, che deve restare allineata a mano.

## Gli otto posti, e cosa sono davvero

| posto | cosa ci sta | e' la stessa cosa? |
|---|---|---|
| `src/api/stremio.js` | id, type, name, emoji (il manifest) | **si'** — e' la definizione |
| `src/utils/manifestFingerprint.js` | id, type, name — copia verbatim | **si'**: dovrebbe **derivare** dal manifest |
| `src/catalog/catalogKind.js` | id -> {mediaSet, anime, alwaysVisible} | **si'**: e' un attributo della riga |
| `frontend/src/lib/catalogKind.ts` | la stessa, riscritta in TypeScript | **si'**: duplicata perche' il frontend non importa da `src/` |
| `frontend/src/components/dashboard/DnaAndAiPanel.tsx` | idBase, label, emoji, desc | **si'**: e' la definizione, con un ALTRO nome |
| `src/catalog/catalogSorting.js` | il prefisso degli id hero | no: e' l'ordinamento |
| `src/api/profiles.js` (`CATALOG_MODES`) | id -> strategia dell'engine | no: e' il cablaggio al motore |
| `frontend/src/app/page.tsx` (`HERO_PRESET_IDS`) | quali righe ha un profilo NUOVO | no: e' una scelta di prodotto |
| **`src/catalog/providers/HybridProvider.js`** (righe 5-8) | **`HERO_IDS`: decide quali id sono serviti come riga hero** | **si'**: e' la stessa lista, ed e' il CONSUMATORE |

Quindi: **sei posti sono la stessa cosa ripetuta** (il nono l'ho trovato dopo, ed e' il piu' importante che mancava), tre sono concetti diversi che per caso usano lo
stesso id. E il costo l'abbiamo pagato il 16/10/2026: ho aggiunto le righe del grafo in tre posti su otto,
e il risultato e' stato **una funzione invisibile** — il codice deployato, le righe nel manifest, e nulla
da selezionare nella UI. Il proprietario ha testato e ha visto gli stessi suggerimenti di prima.

## La forma che dovrebbe avere

**Un registro solo**, `src/catalog/registry.js`:

    { id: 'yaca_mondi_movies', mediaSet: ['film'], anime: 'agnostic', alwaysVisible: false,
      name: '🌍 Il tuo mondo', emoji: '🌍', desc: '...', strategy: null, kind: 'hero' }

e da li' **derivano**: il manifest (`stremio.js`), la fingerprint (che smette di essere una copia e
diventa un hash del registro), `catalogKind`, l'ordinamento, e `CATALOG_MODES`.

**Il frontend non puo' importare da `src/`** (build diversi), quindi la sua parte (`catalogKind.ts` +
`DnaAndAiPanel`) va presa da un **endpoint**: le righe selezionabili devono essere **dati**, non codice —
e l'API di configurazione esiste gia', quindi e' il posto naturale. Cosi' il nome della riga e' **uno**:
quello che l'utente seleziona e quello che vede dopo sono la stessa stringa.

## Perche' non l'ho fatto adesso

Tocca gli otto posti piu' i tredici file di test degli hero (`heroDiversity` 471 righe,
`heroPolicyAndTrakt` 611, `hybridRecommendations` 293, e altri dieci), e va fatto con i test aperti —
come per il ticket 36. E' mezza giornata, e il momento giusto e' **dopo** che il proprietario ha testato
le righe del grafo: se le righe non piacciono, cambia anche il registro.

## Un'osservazione per il proprietario

## IL NONO POSTO, TROVATO DOPO — e senza quello le righe sarebbero VUOTE

`src/catalog/providers/HybridProvider.js:5-8` ha una lista `HERO_IDS` cablata, ed e' **il consumatore**:
decide se un id in arrivo e' una riga hero da servire (chiama `getHybridCatalog`). Le mie greps non l'avevano
trovato perche' cercavano id+nome, e li' c'e' una lista di soli id.

Conseguenza se non si tocca: le righe del grafo sarebbero **selezionabili nella UI e vuote in Stremio** —
la stessa classe di fallimento silenzioso che questo ticket chiude, un livello piu' sotto. E' anche la
prova che il registro unico serve: nove liste che devono restare allineate a mano, e ne bastava una
dimenticata per rendere inutile tutto il resto.

Questo e' il tipo di cosa su cui il revisore esterno ha reso due volte: non un bug, ma una **forma** che
invita all'errore. Vale la pena chiedergli se il registro unico e' la strada, o se ne vede una migliore.

---

## DECIMO POSTO, e non era nelle nove: `HERO_PRIORITY` dentro il motore (17/10/2026)

Lo slave ha derivato nove posti e il registro funziona. Ma quando il proprietario ha testato, le due righe
mostravano il **catalogo generico** — ordine di popolarita', film e serie mescolati — invece dei mondi.
I log dell'app hanno detto perche':

    [Hybrid Debug] cacheKey=<utente>_<profilo>_yaca_mondi_movies     <- la chiave PER CATALOGO

mentre i quattro hero usano la chiave **condivisa del gruppo**. La chiave la sceglie `getHeroCatalogInfo()`
in `src/engines/hybridRecommendations.js`, che legge `HERO_CATALOG_IDS`: una Map **costruita da
`HERO_PRIORITY`** — quattro slug cablati nel motore, diversi dalle nove liste del resto del sistema.
Nessuna delle nove diceva *quale percorso prendere*: tutte dicevano cosa mostrare.

**E il decimo posto serviva a DUE cose**, il che ha richiesto due modifiche: oltre al percorso, alimenta
`isSharedHeroCacheEntry`, il controllo di validita' della cache che pretende la **disgiunzione** fra hero.
Le righe del grafo sono additive per scelta (possono ripetere un titolo): senza un'eccezione (`SLUG_ADDITIVI`)
il gruppo sarebbe stato **scartato e ricostruito a ogni richiesta, per sempre**.

**Per il registro**: `HERO_PRIORITY` e' un concetto diverso (l'ORDINE di priorita' degli hero, non la loro
definizione), ma nasce dagli stessi id — quindi appartiene al registro, come gli altri nove. E' la stessa
lezione di tutte le altre volte: la conoscenza chiave-per-id deve stare in UN posto, e dieci prove che
qualcuno la stia duplicando sono dieci prove di troppo.

---

RISOLTO il 17/10/2026: `src/catalog/registry.js` (295 righe) e' la fonte sola per 12 righe, e da li'
derivano manifest, fingerprint, catalogKind, ordinamento, mappatura strategie, il CONSUMATORE
(`HybridProvider`, il nono posto) e la UI (tre endpoint esistenti, nessuna rotta nuova). Lavoro dello slave
agy, integrato con un merge a mano (un conflitto su `DnaAndAiPanel.tsx`, risolto tenendo la versione
dinamica). 13 file di test verdi, zero test modificati. Il nome "True Blend" non esiste piu' in nessuna
definizione.

RESTA UN DECIMO POSTO, per chi riprende: `HERO_PRIORITY` in `hybridRecommendations.js` e' l'ORDINE di
priorita' degli hero — un concetto diverso dalla definizione delle righe, ma nasce dagli stessi id, quindi
appartiene al registro come gli altri nove. E' l'unico che decide QUALE PERCORSO prende un catalogo.
