# 10 — I canali tipizzati e la tassonomia dei ponti

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 09

## What to build

Quando si costruiscono le bolle, i componenti si **sommano** in un'unica matrice: è giusto, ed è così che
la partizione trova i mondi. Ma una volta trovate le bolle, **non si usa la matrice sommata per
collegarle**. Si calcolano due assi separati:

- **Asse comportamentale**: comportamento, co-visione dalle cronologie, co-occorrenza nelle liste curate.
- **Asse strutturale**: regia, cast, keyword, firma produttiva.

Su ciascun asse si calcola l'informazione mutua puntuale positiva. Incrociando i due assi i ponti fra
bolle si classificano in tre tipi, e i tre tipi **significano cose diverse**:

| Tipo | comportamentale | strutturale | cosa vuol dire | uso |
|---|---|---|---|---|
| **Canonico** | alto | alto | stessa scuola o tema **e** stesso pubblico | navigazione primaria |
| **Vibe** | alto | basso o nullo | metadati, paese o medium diversi, **stesso pubblico** | **il sorprendente azzeccato** |
| **Collisione lessicale** | nullo | alto | condividono una keyword generica o un attore secondario, e nient'altro | **il rumore da potare** |

## Acceptance criteria

- [ ] ogni arco forte di ogni bolla porta la sua **etichetta di tipo**
- [ ] i ponti *vibe* sono elencati e **letti**: numero dichiarato di quelli plausibili
- [ ] le collisioni lessicali sono elencate e **lette**: devono essere riconoscibili come incidenti
- [ ] la distribuzione dei tre tipi per bolla è stampata
- [ ] **controllo di confondimento**: la fascia di popolarità è appaiata, così che il conteggio dei *vibe* non sia un artefatto
- [ ] il caso già noto è riprodotto: *Noir anni '70* ↔ *Anime cyberpunk* (o un equivalente trovato dai dati) compare come ponte *vibe*

## Da dove nasce

È la riga 2 della tabella il pezzo di prodotto più importante di questa specifica. Il *sorprendente* non è
una temperatura sui punteggi finali — alzare la temperatura produce scelte sub-ottimali, non sorprendenti.
Il sorprendente vero è **deterministico**: alta affinità comportamentale a fronte di alta distanza nei
metadati. Questo ticket lo rende una proprietà misurabile del grafo.
