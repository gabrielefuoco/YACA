# Il grafo di YACA — il modulo, e come si usa

Questo è il sistema di raccomandazione, estratto da `.scratch/` il **15/10/2026** quando è arrivato al
punto di dover essere usabile da qualcuno che non l'ha scritto. Gli originali in `.scratch/` sono
diventati **shim di 9 righe** che rimandano qui: i **117 script di misura** continuano a funzionare, e
la verità è una sola.

```
graph/
  canon.py       709 righe   il cuore: i titoli, le matrici, i banchi, i ranghi, i CONTRATTI
  bubbles.py     631 righe   il costruttore delle bolle: la miscela, Leiden, la potatura
  collocator.py  267 righe   la collocazione: V1 per la bolla, V3 per i vicini, la regola dei voti
  pipeline.py                IL COMANDO UNICO
  motore.py / servizio.py    il motore delle liste e il servizio HTTP che lo espone
  uscite.py                  la porta d'ingresso delle uscite recenti: `python -m graph.uscite`
                             costruisce `data/uscite-collocate.npz` (Parquet TMDB + collocatore).
                             Va lanciato DOVE ci sono i Parquet (il mate), e il file va depositato
                             in `data/` — il container la monta read-only e non puo' generarla.
  steps/                     gli script che COSTRUISCONO: embedding, componente, partizione,
                             divisione voti, centroidi. Si lanciano da qui, non da `.scratch/`.
  data/                      55 file, 422 MB — GLI ARTEFATTI: le partizioni, il triangolo, i centroidi,
                             gli embedding, i componenti. Sono il risultato del lavoro, non una cache.
  fetch/                     chi scarica cosa: i 7 fetcher Trakt + il README degli input
  upstream/                  i 5 script che PRODUCONO gli input della fase 1:
                             spazi-trakt.py · componenti-nuovi.py · cf-edges.py ·
                             boot-comp.py · contaminazione.py
  measure/                   i 10 ARBITRI: misurano la qualita' del sistema. Sono il modo in cui
                             si sa se funziona — e il 15/10 hanno corretto le metriche SEI volte.
```

## Gli arbitri (`graph/measure/`)

| script | cosa misura |
|---|---|
| `coerenza.py` | l'indice di chimera (la coerenza dentro una bolla) e `N_eff` per tropo |
| `sim_trama.py` | la **Sim_trama**: l'unico arbitro che non usa le feature del collocatore |
| `saghe.py` | le 1.994 collezioni TMDB: sono intere, adiacenti o spezzate sulla mappa |
| `verifica_voti.py` | lo spread dei voti, le saghe, la coerenza dopo la divisione per voti |
| `banco.py` | il banco caldo/freddo: 600 titoli tolti e ricollocati dai soli metadati |
| `loo_esatto.py` | il leave-one-out esatto sul banco |
| `voto_diretto.py` | il voto sui centroidi, con l'accordo fra le strade |
| `contratti.py` | il retro-test dei tre contratti sugli artefatti storici del progetto |
| `geometria.py` | il top-M sui centroidi e lo scoring ibrido |
| `sonda.py` | le 20 sentinelle: leggono un mondo nominabile? |

**Il README diceva «il modulo esegue, non ri-misura», e era una scusa**: senza gli arbitri non c'e'
modo di sapere se una modifica migliora o peggiora, ed e' esattamente quello che e' successo sei volte
il 15/10 — una metrica che diceva una cosa e l'occhio un'altra.

**La regola, ed è quella che rende possibile la manutenzione**: `graph/data/` è il risultato del
nostro lavoro, `.cache/` è ciò che si può riscaricare. Il modulo distingue i due con `canon.A(nome)`:
cerca in `graph/data/`, e solo se manca ripiega su `.cache/movielens/`. **Il ripiego serve alla
migrazione e va tolto quando è finita**, altrimenti si torna ad avere due posti dove guardare.

---

## 1. Come si usa

```bash
python -m graph.pipeline stato       # cosa c'è, cosa manca, gli hash, l'inventario
python -m graph.pipeline ricetta     # i parametri di tutto
python -m graph.pipeline colloca nuovi.json    # colloca titoli nuovi
python -m graph.pipeline pesanti     # la sequenza per rigenerare tutto, coi tempi
```

`stato` è il comando da lanciare **per primo**: dice quali artefatti esistono, quali sono vivi e quali
sono esperimenti, e **verifica gli hash** degli spazi (idf e vocabolario). È il controllo che il
15/10/2026 ha fermato un errore vero — *Deadpool & Wolverine* collocato tra i telefilm americani.

```python
# come libreria: la collocazione di un titolo nuovo
from graph import collocator as C
S3, S1 = C.carica(v3=True), C.carica(v3=False)
bolla, confidenza, termini, fuori_vocabolario = C.colloca(metadati_tmdb, "movie", S3, S_macro=S1)
```

## 2. La ricetta

| passo | parametri |
|---|---|
| **1. gli embedding** | `qwen3-embedding:0.6b` via Ollama, payload **«titolo. trama»**, 35.829 trame × 1024 |
| **2. i componenti** | `CF 1 · CFst 1 · B 1 · KW 1 · TV 1 · CAST 1 · DIR 1 · COLL 3 · LIST 1 · TRAMA 1` — KW e CAST con shrinkage e `min_sim` 0,12 / 0,02 |
| **3. la partizione** | Leiden **RB 200**, 6 passate, chiusura `alpha0=0.1`, consenso multi-vista, potatura al nucleo di 4 |
| **4. la divisione per voti** | le bolle con `p90/p10` dei voti > 10 e almeno 15 titoli si ripartiscono |
| **5. il collocatore** | **V1** per la bolla (63,0% contro 35,3% di V3) · **V3** per i dieci titoli · filtro voti ×10 |

I valori sono in `RICETTA` dentro `pipeline.py`, leggibili e commentati. Prima vivevano solo nel
codice sparso.

## 3. Le due trappole — la parte che vale più di tutto il resto

Le ho scoperte sbagliando, e sono scritte qui perché non si ripetano:

**a. Il triangolo non dipende dalla risoluzione.** È il grafo *prima* di Leiden. Il file salvato come
`...-r100-triangolo.npz` è **lo stesso** da cui viene la partizione `r200`: la risoluzione cambia solo
Leiden. Se ne manca uno, l'altro vale.

**b. I centroidi del collocatore sono costruiti su UNA partizione precisa** (oggi **V8**). Le bolle
**non hanno id stabili** fra partizioni: leggere i membri su un'altra fa finire *Deadpool & Wolverine*
tra *Bayside School* e *Kenan & Kel*, **senza nessun errore**. La partizione e i centroidi sono **un
artefatto solo** e si rigenerano insieme.

## 4. I numeri, con la loro data

| | valore | come misurato |
|---|---|---|
| coerenza intra-bolla (PMI mediana) | **+0,942** | indice di chimera, 15/10 |
| saghe spezzate | **0 su 1.994 collezioni TMDB** | adiacenza sulla mappa, 15/10 |
| collocazione film | 27,7% (banco) · **~90/100 (occhio)** | 100 inserimenti letti a mano, 15/10 |
| collocazione serie | **63,0%** (V1, banco) · 87,3% contando le promozioni | banco 600 serie, LOO esatto |
| bolle | 3.497 · mediana 11 | |

**Il banco misura il comportamento, non il significato.** Dice «il titolo atterra nella bolla che la
**co-visione** gli aveva assegnato?» — domanda che per un'uscita 2024-2026 fuori dal grafo **non ha
risposta**. Sui titoli nuovi l'unico arbitro è l'occhio, e l'occhio il 15/10 ha corretto le metriche
**sei volte**.

## 5. Cosa questo modulo NON è

- **Non è in `src/`.** La scelta presa è **job notturno offline**: la pipeline scrive artefatti, un
  umano li guarda, il servizio non si tocca.
- **Non copre la raccomandazione in linea.** La camminata sul grafo e il ranking per l'utente sono del
  prodotto; qui ci sono gli *archi*, le *bolle* e la *collocazione*.
- **Non è mai stato misurato sulla raccomandazione.** I numeri di recall e NDCG di `grafo-servibile`
  sono sulla partizione **vecchia** (V7/V8). Su V10 non esistono ancora.
- **Il 46% del canone non ha una trama**, quindi il componente TRAMA copre il 54%: gli altri nove
  componenti coprono l'88-93% anche di quelli, ed è per questo che il sistema funziona lo stesso.

## 6. Dove sta il resto

- **I report**: `.scratch/*/ricerche/` — ~120 file, ogni passo col suo perché e i suoi numeri
- **Le mappe**: `.scratch/*/map.md` — destinazione e decisioni di ogni effort
- **Gli handoff**: 4 documenti, per un revisore esterno
- **I 117 script di misura**: `.scratch/*/` — funzionano ancora, via gli shim

E il **digest** (`digest.txt`, ~914k token) con tutto il codice e i documenti, per chi vuole leggere
senza clonare.
