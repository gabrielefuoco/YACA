# 18 — L'adiacenza appresa: il peso si impara dal teacher

**Status**: `claimed` · **Type**: `prototype` · **Aperto**: 08/10/2026 · **Blocked by**: 17 (fatto)

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

---

## Cancello 1 SUPERATO (08/10/2026)

Report: [`ricerche/08-adiacenza-appresa.md`](../ricerche/08-adiacenza-appresa.md) · output `l1-adjacency-learned.json`

| | PPMI (oggi) | **appresa** |
|---|---|---|
| AUC esterna, a parita di taglia | 0,631 | **0,699** |
| Spearman col bersaglio, coppie mai viste | +0,192 | **+0,566** (82% del soffitto 0,692) |
| coppie in comune col grafo di oggi | | **60%** |

Il vantaggio e massimo sui cluster **piccoli** (Q1: 0,624 -> 0,719), minimo sui grandi: la firma di un
guadagno reale, non di un artefatto di taglia.

La feature dominante e **la distribuzione dei generi** (rho +0,498): la leva piu grossa non sono le
keyword, e il genere oggi non entra nel segnale dell adiacenza.

**Resta aperto il cancello 2**: ricostruire il grafo dei film sull adiacenza appresa e rimisurare
l imbuto (2 hop >= 5,9% @50 e >= 9,2% @200).
