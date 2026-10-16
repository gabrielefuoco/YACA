Status: ready-for-agent
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

Quindi: **cinque posti sono la stessa cosa ripetuta**, tre sono concetti diversi che per caso usano lo
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

Questo e' il tipo di cosa su cui il revisore esterno ha reso due volte: non un bug, ma una **forma** che
invita all'errore. Vale la pena chiedergli se il registro unico e' la strada, o se ne vede una migliore.
