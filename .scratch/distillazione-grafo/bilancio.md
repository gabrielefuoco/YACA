# Bilancio — cosa abbiamo provato e cosa è servito

## 1. Dati e feature

| scelta | verdetto |
|---|---|
| Trame in inglese (66k, ri-embeddate) | **dannosa**. Grafo 12,8→10,3%, curato 10,1/10,8→7,8/9,5. Geometria qwen3 più isotropa in EN. Revertito. |
| Trama mista IT/EN (payload «titolo. trama») | **utile**. È l'unico segnale di contenuto che funziona. |
| Titolo dentro `Bp` | **utile** (dà genere/anno/stile). Nel bag-of-tokens non c'è: il vocabolario è solo `ca:/kw:/co:/…`. |
| 17 campi metadati (cast, company, director, genre, …, collection) | **utile ma pericolosa**: da sola produce l'eco del brand (Barbie→cartoni, f3→filmografia del regista). |
| Keyword L1/L2/L3 (multi-vettore, PMA) | **neutra**. Nessun guadagno in A0-A7. |
| `Yc` MovieLens reale (47.710 titoli) | **utile**: l'unica co-visione vera. Ha sostituito `Pc` (che era una Ridge sui metadati, quindi contenuto mascherato: **dannosa**). |
| Penalità 120 giorni film-film ×0,2 | **utile**: toglie la bolla dello stesso weekend (Oppenheimer→Dumb Money). |
| `lc150` (studente del grafo come blocco) | **utile per b10** (19,2%), ma è un secondo studente del grafo: **contro lo spirito** del progetto. |
| Free table 512 (B-mf) | **diagnostica**: memorizza 63,5% train, 60% fedeltà top-20 → il collo di bottiglia è l'encoder. |

## 2. Target

| target | verdetto |
|---|---|
| Riga piena del grafo (A10/A12) | **il migliore singolo**: 21,9–22,1%. Ma è il grafo. |
| Mercury (decision model semantico, 66k) | **utile per il contenuto/cold** (m1 12,3%, pulito), **inutile per i franchise** (cont 43%, trama 24%, grafo 11%). |
| Fusione b10+m1 (rerank + confidenza) | **buon target, studente sbagliato**: il field non lo fitta (0,18), il block lo riproduce (fb≈b10). |
| Soft filter `mix×(0,2+p)` | **utile**: nessun buco nei target. |
| Boost/floor del comportamento | **neutro/dannoso** in aggregato (standard 27/33); vince solo su 6 casi letterali. |
| Margin listwise, unlikelihood, hinge, target «clean» | **tutti neutri**: il letterale è nel contenuto, non nella loss. |

## 3. Modelli

| modello | verdetto |
|---|---|
| Free table / memorizzazione (16,9%) | **diagnostica**: l'encoder è il limite. |
| Token transformer (t1, 16,3%) | **neutro**: non rompe il tetto. |
| Block student (b10, 19,2%, curato 9,2/9,2) | **il prodotto**. Buono su franchise/serie/nuovi; eco del brand e letterale. |
| Field student (m1, 12,3%, curato 7,2/9,0) | **il secondo membro**: più pulito su cold/oscuro/autoriale, debole sui franchise. |
| Multi-subspace (f3, 12,8%, curato 2,6/3,4) | **il modello «per autore»**: impara la filmografia del regista, non la similarità. Fit alto (0,65), curato basso. Il centroid è irrilevante: la firma d'autore sta nei campi `di:/co:/cl:`. |
| Ensemble onesto sul target grafo | **28,8%**: i modelli sono ortogonali. Ma l'utente non lo vuole. |
| Ensemble b10+m1+f3 | **peggio** di b10 (0,178 vs 0,192): il f3 tira giù. |
| Ensemble b10+m1 | **= b10 con qualche scambio**: aiuta su Barbie/Povere creature/Inside Out, non è un salto. |
| Reranker b10+r / m1+r | **il migliore a occhio** (13/33 contro 7 di b10), ma richiede il comportamento (grafo/co-visione) a inferenza. |

## 4. Valutazione

| strumento | verdetto |
|---|---|
| Recall@20 vs grafo | **circolare**: premia chi copia il grafo (m1 12% per costruzione). |
| Curato (oro) | **piccolo e distorto**, ma è l'unico proxy del prodotto. |
| Lettura a occhio (20 film + 20 serie) | **l'unico criterio vero**. Ha smascherato tutti i modelli. |
| Trap set anti-eco | **giusto ma incompleto** (5 bandiera su 50). |
| Yc held-out (Set A/B) | **la metrica indipendente**: Set A induttivo 0,057 per f3 → il cold start è debole. |

## 5. Le lezioni (in ordine di importanza)

1. **Il collo di bottiglia è l'encoder**, non lo spazio: la tabella libera memorizza, la rete no.
2. **Il grafo è il miglior teacher**, ma è anche ciò che vogliamo eliminare: ogni scorciatoia (lc150, Pc, fusion) lo reimporta.
3. **Il contenuto produce il letterale** (Titanic→film intitolati Titanic); **i metadati producono l'eco del brand** (Barbie→cartoni, f3→regista). Il bersaglio è in mezzo e nessuno dei due da solo lo centra.
4. **Un target buono non basta**: se lo studente non lo regge (field) o lo riproduce (block), il target non trasferisce.
5. **L'ortogonalità vale 8 punti** (ensemble 28,8 vs 20-22), ma va ottenuta in un modello solo, non sommando modelli.
6. **La lettura a occhio è l'unica metrica che non mente**; tutte le altre hanno un bias strutturale.

## 6. Gli ingredienti utili per il nuovo modello

- La **riga del grafo** come teacher (non come blocco): è il segnale che nessun altro ha.
- La **co-visione MovieLens `Yc`** + la penalità 120 giorni come target comportamentale pulito.
- Il **plot `Bp`** come ramo contenuto (non il solo target: il modello deve vederlo).
- I **metadati in un ramo separato**, con **dropout dei campi d'autore** (`di:/co:/cl:`) per non farlo dominare.
- Il **multi-subspace a loss isolate** (l'unica architettura che ha fittato) ma con **3 rami davvero ortogonali**: contenuto, metadati, comportamento.
- La **fusione per confidenza** (gap 1°-2°) come modo di combinare i rami, non come ensemble di modelli.
- L'**ensemble come upper bound** (28,8) e la **lettura a occhio + trap set** come valutazione.

## 7. Cosa manca e cosa non abbiamo provato

- **Hard negatives** veri (non i negativi del pool: i falsi negativi del grafo).
- **Distillazione graph-free** (LightGCN/UltraGCN/SimGCL e le loro distillazioni).
- **Multi-task con pesi adattivi** (l'incertezza di Kendall, GradNorm, PLE) invece delle 3 loss a peso 1.
- **Feature dropout / adversarial removal** dei campi d'autore (l'unico fix all'eco del brand che non abbiamo provato).
- **Un modello item-item** (non due-torri): il grafo è item-item, e il reranker lo dice.

---

# Appendice — le leve dei paper (f4a/f4b/f4c): tutte fallite

Dopo la ricerca (18 paper, 3 report), abbiamo testato le leve una per una su b11.

| variante | leva | grafo@20 | curato @10 |
|---|---|---:|---|
| **b11** | — (riferimento) | **0,210** | 0,084/0,087 |
| f4a | τ=0,20 + field dropout 0,7 | 0,083 | 0,014/0,017 |
| f4b | τ=0,20 da sola | 0,082 | 0,006/0,017 |
| f4c | decorrelazione 0,01 | 0,128 | 0,032/0,038 |
| f3 | multi-subspace (rif. architettura) | 0,128 | 0,023/0,034 |
| b10 | — | 0,192 | 0,092/0,092 |

**Perché falliscono.** b11 non è un modello che collassa: con 40 epoche su un target soft listwise è già vicino al massimo di capacità. Ogni perturbazione lo allontana dal target:
- **τ alta** appiattisce la softmax e perde l'ordine dei 50 candidati (i paper la usano nel contrastive con negativi campionati, non con un target soft).
- **field dropout** toglie l'unica ancora (regista/collection) e il field collassa su genere/rating → film per bambini.
- **decorrelazione** forza dimensione dove non c'è segnale e abbassa il fit del concat (0,603 vs 0,646).

**La lezione.** I paper descrivono regimi diversi dal nostro: il nostro target **è già** la distribuzione del grafo, la più ricca disponibile. Le leve che aiutano a *costruire* un target da zero non aiutano a *fittare* un target già denso.

**Cosa resta valido dai paper** (non ancora testato, ma non prioritario):
- filtro dei falsi negativi a 2-hop (costoso, da provare solo se si cambia target);
- item-item esplicito (UltraGCN) — l'unica leva strutturale non provata;
- multi-vector + RRF al posto del concat (MIND/Cormack) — l'unica che potrebbe cambiare il prodotto.
