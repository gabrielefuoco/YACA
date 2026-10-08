# Come si costruisce il grafo dei film — il flusso, passo per passo

**Effort**: [ml-collaborativo](map.md) · **Codice**: [`build-film-graph.py`](build-film-graph.py) · **Artefatto**: `.cache/movielens/film-graph.npz`
**Tempo**: ~10 minuti su questa macchina · **Modifiche a `src/`**: nessuna

---

## Il disegno in una figura

```
MovieLens ml-32m                TMDB (97.613 film + 19.585 serie)     gerarchia keyword
(200.949 utenti, 32M voti)      keyword, generi, voti, anno,          L1→L2→L3 (6.125 catene)
        │                        durata, popolarità                          │
        │                                │                                   │
        ▼                                │                                   │
  1. MAPPING (links.csv)                 │                                   │
     movieId ↔ tmdbId                    │                                   │
     SOLO righe type=movie               │                                   │
     (TMDB riusa gli id!)                │                                   │
        │                                │                                   │
        ▼                                │                                   │
  2. TEACHER                             │                                   │
     matrice utenti×film (51.061 film)   │                                   │
     peso 1/log(1+voti) = anti-popolare  │                                   │
     SVD → 64 componenti                 │                                   │
     → ogni film: un vettore di 64 numeri│                                   │
        │                                │                                   │
        └───────────────┬────────────────┴───────────────────────────────────┘
                        ▼
  3. STUDENT — un regressore Ridge (nessun LLM, nessun Transformer)
     X = sottografo keyword (1.982 nodi L1/L2/L3) + 27 generi + 5 numeriche
         (anno, log voti, punteggio bayesiano, durata, popolarità)
     y = il vettore di 64 numeri del teacher
     verifica su 9.941 film TENUTI FUORI: coseno(predetto, vero) = 0,431
                                          (vettore medio del catalogo = 0,224)
                        │
                        ▼
  4. PROIEZIONE: la STESSA funzione su TUTTI gli 87.848 titoli con keyword
     → anche serie, uscite nuove e film fuori MovieLens ricevono 64 numeri
                        │
                        ▼
  5. GRAFO: k-NN k=12 con soglia coseno ≥ 0,45
     → 913.056 archi · 1 sola componente connessa · 0 nodi isolati
                        │
                        ▼
  6. CLUSTER: Leiden (RBConfiguration, res 16)
     → 246-254 micro-generi (mediana 333 titoli)
     coerenza 0,895 (contro 0,246 del caso)
     ARI con la gerarchia L1-L5 = 0,055 → struttura NUOVA
                        │
                        ▼
     film-graph.npz
     embedding 87.848×64 · assegnazione cluster · archi k-NN
```

---

## Chi porta cosa

| pezzo | provenienza | cosa aggiunge |
|---|---|---|
| **teacher** | **dato reale**: la co-visione di 200.949 persone (MovieLens) | informazione che le keyword **non hanno** — misurata ortogonale (Spearman 0,04; top-10 in comune 0,3/10) |
| **student** | **costruzione mia**: un Ridge sui metadati | la possibilità di proiettare **chi nel dataset non c'è**: serie, uscite 2024-2026, film non coperti |
| **grafo + cluster** | costruzione mia sui vettori dello student | navigabilità (1 hop = vicini, 2 hop = micro-genere) e cluster che i topoi L1-L5 non producono |

---

## Le quattro scelte che decidono il risultato

| scelta | perché |
|---|---|
| **peso `1/log(1+voti)`** sui film del teacher | senza, la co-visione è dominata dai blockbuster e i «vicini» di qualunque film diventano Matrix e Fight Club (misurato) |
| **nessuna feature `è_serie`** | con quella, il modello impara a separare film e serie; il ponte fra i due media va lasciato alla funzione dei metadati, non vietato |
| **soglia 0,45** sul k-NN | col solo k-NN *mutuale* il grafo si spezzava in **26.532 componenti** e Leiden dava 26.645 cluster da 1 titolo: separava i pezzi, non trovava struttura |
| **risoluzione di Leiden** | è la manopola della granularità: res 16 → 254 cluster (mediana 333); res 32 → 446 (191); res 64 → 827 (101) |

---

## Cosa NON c'è dentro

- **Il 25% del catalogo senza keyword** — 117.198 titoli totali, 87.848 nel grafo. Sono anche i titoli con meno metadati: il fallback serve, ma i titoli delle cronologie reali sono tutti nel grafo (100%).
- **Nessun dato collaborativo dopo il 2023** — MovieLens è un fermo immagine: i titoli 2020-2026 sono coperti al 36,5%, e lì il segnale viene **tutto** dallo student.
- **Nessun segnale utente** — il grafo è popolazione, non persona: la personalizzazione resta nel DNA e nello scorer.

---

## Come si rifà

```bash
# il grafo (10 minuti, scrive .cache/movielens/film-graph.npz)
offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/build-film-graph.py

# cosa vale come sorgente di candidati (confronto a parità di posti)
offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/export-graph-candidates.py
node .scratch/ml-collaborativo/bench-graph-funnel.js

# il ponte film↔serie e la densità dei cluster
offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/measure-cluster-retrieval.py
```

**Da ricostruire periodicamente** (nuovi titoli, nuovo MovieLens): è un artefatto offline, non un calcolo in tempo reale. Il risultato misurato — come sorgente di candidati davanti allo scorer — sta in [ricerche/04](ricerche/04-imbuto-nel-serving.md).
