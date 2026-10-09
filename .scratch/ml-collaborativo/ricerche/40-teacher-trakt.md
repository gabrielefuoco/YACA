# 40 — Il teacher Trakt: il segnale nuovo funziona. E il gate lo porta a 41,0%.

**Data**: 08/10/2026 · set curato: **138 sorgenti, ~600 collegamenti** (33 serie nuove incluse)

## 1. Lo scraping: 5.200 titoli, ~100.000 legami

Il bulk Trakt e' finito: **2.600 film + 2.600 serie** scaricati (5.433 file in cache, solo 59 senza
related). Ogni titolo porta ~20 "related" -> **~100.000 legami comportamentali**, **serie comprese**.

## 2. A/B PULITO: stesso contenuto, cambia SOLO il teacher comportamentale

| | comportamento MovieLens | **comportamento Trakt** |
|---|---|---|
| **verifica (solo pari)** | 27,4% (34/124) | **32,3%** (40/124) · **+4,9** |
| punteggio | 44,4 | **50,8** · **+6,4** |
| **auteur** | 28,1% | **35,9%** · +7,8 |
| **mainstream** | 21,2% | **27,5%** · +6,3 |
| **era** | 23,5% | **29,4%** · +5,9 |
| niche | 17,8% | 15,1% · -2,7 |
| medium (serie) | 9,1% | 4,5% · -4,6 |
| franchise | 91,7% | 91,7% |

**+6 collegamenti su 124: sopra il rumore.** Il teacher Trakt e' un miglioramento reale, e i tipi che
guadagnano di piu' (auteur, mainstream, era) sono quelli dove il segnale *curatorio* di Trakt
dovrebbe contare.

## 3. La previsione sulle serie: NON confermata (e non smentita)

Avevo dichiarato che il teacher Trakt avrebbe alzato il "medium" (le serie hanno comportamento per la
prima volta). **E' sceso** (9,1% -> 4,5%) — ma la differenza e' **un solo collegamento su 22**: il tipo
"medium" (i legami film<->serie) e' troppo sottile per dire qualcosa. **Non confermata e non smentita:
non testabile.** Riportata come tale.

## 4. Il gate col teacher Trakt: il numero migliore del filone

| config | tutti | **nicchia** | resto |
|---|---|---|---|
| pesi FISSI | 33,3% (39/117) | **22,9%** (11/48) | 40,6% (28/69) |
| **GATE FORTE (nicchia: contenuto 0,2 · comportamento 1,0)** | **41,0%** (48/117) | **41,7%** (20/48) | 40,6% (28/69) |
| controllo UNIFORME | 36,8% (43/117) | 41,7% (20/48) | **33,3%** (23/69) |

- **+7,7 punti complessivi**, **+18,8 sulla nicchia** (22,9% -> 41,7%), **il resto intatto**
- il controllo uniforme e' peggiore (36,8%) perche' **danneggia il resto**: e' la prova che e' la
  *scelta per query* a fare il lavoro, non la riponderazione

**Il percorso della nicchia**: 17,1% (teacher ML, pesi fissi) -> 22,9% (teacher Trakt) -> **41,7%**
(teacher Trakt + gate). **Due segnali nuovi e un gate: da 17% a 42%.**

## 5. I temi: ridondanti col teacher Trakt

Con il teacher Trakt la calibrazione sceglie `temi_bag 0,0 · temi_cen 0,2` e il punteggio resta 50,8 —
**identico a "senza temi"**. I temi davano +3 punti col teacher MovieLens e **zero** con Trakt: sono
ridondanti. Non li tolgo (non fanno danno) ma va detto che non aggiungono.

## 6. Confronto con la produzione

| | p3@10 | punteggio |
|---|---|---|
| **il nostro spazio (Trakt + gate)** | **41,0%** | ~51 |
| **scorer di produzione** | **9,1%** (17/187) | 7,4 |

**4,5 volte sui legami forti, ~7 volte sul punteggio.**

## 7. Due errori miei, riportati

1. **Sesto errore di namespace della giornata** (`row_ppmi` per tmdb, il target per movieId). Sempre
   lo stesso errore in forme diverse: tmdbId, movieId, posizione, riga. Non da' mai un crash
   immediato: da' un KeyError a meta' run o un crollo di prestazioni. Le uniche difese che hanno
   funzionato sono gli **assert con un numero atteso** e i **KeyError**.
2. **Ho sovrascritto `spazi2.npz`** (le feature estese) perche' il patch del nome d'uscita non aveva
   agganciato. Perdita minore (l'esito delle feature estese era misto), ma il pattern e' lo stesso di
   tutti i bug di oggi: **patch che non aggancia = patch che non fa niente, in silenzio**.
