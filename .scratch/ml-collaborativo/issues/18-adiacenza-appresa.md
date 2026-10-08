# 18 — L'adiacenza appresa: il peso si impara dal teacher

**Status**: `ready-for-agent` · **Type**: `prototype` · **Aperto**: 08/10/2026 · **Blocked by**: 17 (fatto)

## L'idea

Oggi il peso di ogni arco L1-L1 è la **somma dei PPMI** fra le keyword dei due cluster
(`build_graph.py:283-298`). L'audit dice che quel peso ordina la realtà per **ρ = +0,087**: quasi nulla.
Gli archi a peso 0 non sono sbagliati, sono **non misurati** — la coppia di keyword non co-occorre nel
nostro catalogo, ma le persone guardano i due cluster insieme.

**Il bersaglio diventa esterno**: `w(a,b) = vicinanza collaborativa fra i cluster a e b` (centroidi del
teacher). Un modello lineare su feature a costo zero la predice:

| feature | perché |
|---|---|
| PPMI (quello di oggi) | il segnale attuale, come *una* delle feature |
| generi condivisi / distanza fra `genre_distribution` | informazione che le keyword non hanno |
| dimensione dei due cluster | controllo di popolarità (obbligatorio) |
| similarità lessicale delle keyword (medoid) | il segnale "a parole" |
| epoca, lingua, paese | struttura che il PPMI ignora |

## Cancelli

1. **L'audit deve salire**: AUC > 0,629 e ρ > 0,087 (misurati sullo *stesso* protocollo, con train/test
   split sui cluster, non in-sample — altrimenti si misura la memoria del modello).
2. **L'imbuto non deve peggiorare**: grafo 2 hop ≥ 5,9% @50 e ≥ 9,2% @200 (i numeri con la diffusione accesa).
3. Il modello deve restare **lineare e leggero** (niente LLM, come da vincolo).

## Nota

Controllo di popolarità obbligatorio: il bersaglio (centroidi del teacher) è dominato dai titoli visti da
tutti. Senza normalizzare, si impara "popolare" e lo si serve travestito da gusto.
