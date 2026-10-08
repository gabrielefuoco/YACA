# 03 — Cosa È questo grafo, misurato (08/10/2026)

**Mappa**: [../map.md](../map.md) · **Banco**: `measure-cluster-retrieval.py` · **Grafo**: `film-graph.npz` (87.848 titoli, 254 cluster, res 16)

---

## La domanda

Il grafo dei film non serve a *ordinare* (lì il DNA+gerarchia resta migliore): serve a **generare i candidati**.
La misura giusta non è il ranking, è: *se prendo k titoli che hai visto e i loro cluster, cosa ci trovo dentro?*

## 1. Come sorgente di candidati: densità 11× meglio, copertura 4× peggio

| fonte | quanti dei visti recupera | slot di candidati | **qualità per 1.000 slot** |
|---|---|---|---|
| caso | 1,9% | 1.701 | 1 per mille |
| **generi (il pool di oggi)** | **75,8%** | **71.729** | **1 per mille** |
| keyword | 67,4% | 14.095 | 5 per mille |
| **CLUSTER** | 16,9% | **1.534** | **11 per mille** |
| cluster + generi | 16,9% | 1.407 | 12 per mille |

Come si legge:

- **A parità di posti** il cluster è **11 volte più denso** di buoni candidati del pool attuale e ~2 volte delle
  keyword. Il pool di oggi raccoglie il 76% dei titoli giusti ma con **71.729 candidati**, cioè 1 per mille:
  uno stadio di retrieval che deve scegliere in fretta butta via quasi tutto.
- **In copertura** il cluster prende il 16,9% contro il 75,8%: i micro-generi sono troppo stretti per
  contenere *tutta* la cronologia di una persona (il cui gusto attraversa più micro-generi).
- Conclusione: il cluster è una sorgente di **precisione**, non di copertura. Da usare **insieme** alle altre
  (o allargata: 2 hop, oppure i top-N cluster dei semi), non da sola.

## 2. Trasferimento film → serie dentro il grafo: **0%**

Nessuna delle serie viste cade nei cluster dei film visti — in **tutti e cinque** i profili, contro un'attesa
casuale del 2,1%. Nel grafo denso film e serie **non si toccano**, mentre la gerarchia delle keyword li
faceva comunicare (18,2% @50 sul pool di sole serie).

**Causa identificata, ed è mia**: lo student riceve una feature `è_serie` (0/1) fra le sei numeriche, e il
teacher è addestrato **solo su film**. Il modello impara quindi che le serie sono "un posto diverso" e le
proietta altrove. Tolta quella feature, film e serie riceverebbero la stessa funzione dai metadati — ed è
l'unico modo in cui il grafo denso può fare il ponte che la gerarchia già fa.

## 3. Cosa sappiamo dire di questo grafo, in una riga ciascuno

| proprietà | misura | lettura |
|---|---|---|
| copertura | 87.848 titoli, **1 sola componente connessa** | navigabile: 1 hop = vicini, 2 hop = micro-genere |
| coerenza dei cluster | coseno 0,895 dentro · 0,246 a caso | i cluster sono insiemi omogenei |
| granularità | 254 cluster (mediana 333) a res 16; 446 (191) a res 32; 827 (101) a res 64 | la manopola c'è, si sceglie |
| indipendenza dalla gerarchia | ARI 0,055 · NMI 0,280 | struttura **nuova**, non una ricopiatura di L1-L5 |
| generalizzazione dello student | coseno 0,431 su film tenuti fuori (controllo 0,224) | le feature dei metadati portano il segnale collaborativo |
| densità come sorgente | **11 per mille** contro 1 del pool attuale | è uno stadio di retrieval, non un ordinatore |
| ponte film→serie | **0%** | rotto da una feature mia: da correggere e rimisurare |

## 4. I due passi che seguono, in ordine di rapporto valore/costo

1. **Togliere `è_serie` e rimisurare il ponte** (una riga + una ricostruzione del grafo): se film e serie si
   avvicinano, il grafo fa quello che la gerarchia fa, con in più il segnale collaborativo.
2. **Allargare il candidato** con una variante misurabile: 2-hop dal cluster, oppure i top-N cluster dei semi,
   e rimisurare copertura **e** densità (il trade-off è tutto lì). Solo dopo ha senso il test di retrieval
   completo col ranking.
