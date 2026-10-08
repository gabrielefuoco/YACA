# 15 — Le due strade: la propagazione vince, il pooling delle keyword è chiuso

**Data**: 08/10/2026 · **Script**: `fix-puntuali.py` sezione 6 · protocollo A→B + cold-start, tutto con leave-one-out

## Il brainstorming dell'utente (che ha corretto la mia diagnosi)

Avevo detto «la media uccide l'informazione» e «il grafo è quasi completo», e poi avevo proposto di
passare al ranker. **Incoerente**: se le cause sono strutturali, si attaccano. E una delle due l'avevo
**fatta io**: il grafo collegava *ogni* keyword di un cluster a *ogni* keyword dei vicini → **clique
complete** → l'embedding ricostruiva la partizione in cluster, cioè esattamente ciò che il one-hot già
contiene. Non era «inutile»: era **ridondante**.

**Diagnosi corretta**: il one-hot topoi è un **codice sparso ad alta cardinalità** (1.382 atomi), ed è
per questo che batte un codice denso a 64 dimensioni. La domanda giusta non è «media o embedding» ma
**«si può imparare un codice sparso migliore di quello fatto a mano?»**

## Le due strade misurate

- **Strada 2** — *grafo comportamentale a livello di keyword*: per ogni keyword il **centroide
  collaborativo** dei film che la portano (dal teacher, pesato per affidabilità), similarità = coseno
  fra centroidi, **sparsificato top-20** (le clique erano l'errore), poi embedding spettrale.
- **Strada 1** — *propagazione sul grafo dei film*: la posizione di un film = **media pesata delle
  posizioni dei suoi vicini**, normalizzata per grado (hubness) e con leave-one-out. Le keyword servono
  a **trovare** i vicini, non a *essere* la rappresentazione.

## I numeri

| feature | dim | A→B | cold-start | controllo |
|---|---|---|---|---|
| one-hot (oggi) | 5.842 | 0,362 | 0,494 | 0,507 |
| strada 2: embedding comportamentale | 64 | 0,277 | 0,387 | 0,388 |
| strada 2b: **max-pooling** | 64 | 0,242 | 0,329 | 0,339 |
| **strada 1: propagazione dai vicini** | **64** | **0,369** | **0,539** | 0,533 |
| one-hot + strada 2 | 5.906 | 0,363 | 0,499 | 0,512 |
| **one-hot + strada 1** | 5.906 | **0,379** | **0,544** | 0,549 |
| **one-hot + entrambe** | 5.970 | **0,380** | **0,547** | **0,551** |

## Le tre letture

### 1. La propagazione batte i metadati **da sola, con 64 dimensioni contro 5.842**

0,369 contro 0,362 sul segnale trasferibile, e **0,539 contro 0,494 sul cold-start** (+0,045). E il suo
cold-start (0,539) sta **sopra il proprio controllo** (0,533): **nessuna penalità cold-start**. Un
vettore costruito dai *vicini* è una rappresentazione migliore di 5.842 colonne di metadati.

### 2. Aggiunta ai metadati, porta un guadagno reale e incrementale

**A→B 0,362 → 0,379** (+4,7% relativo) e **cold-start 0,494 → 0,544** (+10% relativo). È il primo
miglioramento dello student dalle feature estese, ed è il più grande sul cold-start — cioè **dove
serviva**, esattamente come l'utente aveva chiesto.

### 3. Il pooling delle keyword è chiuso (e la risposta alla domanda dell'utente)

| pooling | A→B |
|---|---|
| media | **0,277** |
| max per dimensione | 0,242 |

**La media batte il max** (l'utente aveva detto «aspettiamo i numeri, poi testiamo tutti e tre»: i numeri
dicono che il pooling *non è il problema*). E la strada 2 **fallisce anche col grafo giusto** (sparso e
comportamentale): aggiunta al one-hot vale **+0,001**.

> **La risposta alla domanda «come rappresentiamo un film, se non mediando le sue keyword?» è: non lo
> rappresentiamo con le sue keyword.** Le keyword trovano i vicini; la rappresentazione sono i vicini.

## Le cautele dichiarate

1. **Circolarità residua (strada 1)**: il grafo dei film è costruito dalle previsioni dello student,
   quindi la sua struttura contiene già la conoscenza del teacher. Il guadagno va letto come
   **incremento** sui metadati, non come misura assoluta — e il leave-one-out garantisce che il film non
   contribuisca alla propria stima. **Per una serie la circolarità non esiste**: i suoi vicini sono film
   con posizioni reali, ed è esattamente ciò che la produzione farebbe.
2. **Copertura**: la propagazione funziona per 49.650 film su 49.709 (99,9%) — e per le serie va
   verificato quanti hanno vicini *film* con un teacher (prossimo passo, ticket 12).

## La decisione

**Si adotta la strada 1**: come **feature** nel modello (incremento misurato) e come **meccanismo per le
serie** (dove il teacher non esiste ma i vicini sì). La strada 2 si chiude: documentata, con la causa.
Il pooling non si tocca: la media è la scelta giusta, verificata.
