# 18 — Normalizzazione, reti TV, debiasing: il ponte si apre

**Data**: 08/10/2026 · `build-film-graph.py` → `film-graph-v3.npz` · debiasing in forma chiusa

## Le tre modifiche (e il punto concettuale dell'utente)

L'utente: *«rappresentare un vettore (già latente) in un altro spazio latente non fa danno?»*. La
risposta è nei numeri di oggi: **sì, se la seconda trasformazione non ha un bersaglio esterno** — le tre
ri-embeddate non supervisionate (embedding del grafo keyword, grafo comportamentale, max-pooling) hanno
tutte dato **+0,001 o peggio**. Lo student è una **proiezione supervisionata** (il secondo spazio è
definito dal teacher), ed è l'unica forma che guadagna. **Regola: una trasformazione delle feature vale
solo se guidata da un bersaglio esterno.**

Modifiche a `build-film-graph.py`:
1. **IDF sui blocchi binari** (10.934 colonne; idf mediano 8,16): una persona rara pesa più di una
   onnipresente. È la normalizzazione *di frequenza*, quella che mancava.
2. **Standardizzazione delle 8 numeriche** (prima convivevano scale diverse sotto lo stesso alpha).
3. **`networks`** (colonna del parquet **mai usata**): 60 reti TV, copertura 19% — canale
   serie-specifico, come i paesi per i film (e i paesi, da bug a 98%, avevano dato il guadagno più grosso).

## Il confronto (quattro build, stesso protocollo)

| build | accuratezza film (held-out) | AUC tipo | vicini film di una serie | serie scoperte | **GoT ↔ Le crociate** |
|---|---|---|---|---|---|
| v2 (paesi + persone) | **0,448** | 0,966 | 4 | 13% | +0,255 · #28.890 |
| v2 + debiasing | — | 0,952 | 4 | 13% | +0,255 · #28.890 |
| v3 (IDF + std + reti) | 0,425 | 0,875 | **7** | **3%** | +0,305 · #19.965 |
| **v3 + debiasing** | — | **0,838** | **7** | **3%** | **+0,311 · #19.397** |

**Debiasing in forma chiusa** (nessun riaddestramento): si stima con una logistica la direzione che
predice film/serie nello spazio e si **proietta fuori** (`Q = P − (P·ŵ)ŵ`). È la versione in forma chiusa
del debiasing avversariale.

Controllo che il debiasing non distrugga il resto: **Il padrino ↔ Quei bravi ragazzi +0,436, rank #14**
(era #15) — la struttura film↔film è intatta. E la coppia anime resta alta (AoT ↔ Your Name 0,368).

## Il verdetto: un compromesso, non una vittoria

- **Il ponte si è aperto**: GoT ↔ Le crociate passa da **sotto il caso** (+0,145) a **+0,311**, con la
  posizione da **#42.248 a #19.397** (2,2× meglio). I vicini film di una serie passano da 2 a **7** e le
  serie senza alcun vicino film da 22% a **3%**.
- **Costa accuratezza sui film**: 0,448 → 0,425 (−5% relativo). L'IDF down-pesa le feature *frequenti*,
  che sono anche le più utili per il bersaglio collaborativo.
- **L'asse tipo non è sparito**: 0,838, non 0,5. Il ponte è aperto ma **debole**: #19.397 non è #200.

## Cosa resta

1. **Dosare l'IDF** (idf^0.5 invece di idf, o standardizzazione più blanda) per prendere il ponte
   **senza** perdere l'accuratezza sui film: un giro per variante, il compromesso è misurabile.
2. **La fonte cross-tipo mirata**: Trakt `/shows/{id}/related` (il client c'è, manca l'endpoint) su
   ~10 titoli chiave per vedere cosa suggerisce; poi MAL/AniList per gli anime (comportamentale vero).
3. **Jev** resta l'ultima spiaggia, con la validazione sui film (protocollo TMDB: AUC 0,768) — e la
   precisazione dell'utente è giusta: un modello di decisione addestrato su giudizi umani non è "solo
   linguistico", ma non è co-visione.
