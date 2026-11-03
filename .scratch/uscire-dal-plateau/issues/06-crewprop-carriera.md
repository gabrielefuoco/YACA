Status: resolved
Type: task
Blocked by: 02

# CREWPROP: propagazione di carriera (regista + sceneggiatore + cast) con leave-one-out

## Perché

Oggi `tipi.py` costruisce CAST, DIR, PROD, COLL come **archi 0-hop di match esatto**: DIR collega
*Barbie* solo agli altri film di Greta Gerwig. Non può collegarla a *Povere creature!* (Lanthimos),
*The Substance* (Fargeat) o *I, Tonya* (Gillespie). E **gli sceneggiatori non hanno alcun tipo**:
Noah Baumbach, co-sceneggiatore di *Barbie*, non è rappresentato da niente.

## Cosa fare

1. Costruire, per ogni persona (registi, sceneggiatori, top-3 cast), un **centroide di carriera** nello
   spazio dei titoli: media dei vettori dei film a cui ha lavorato, **escluso il titolo stesso**
   (leave-one-out obbligatorio — senza LOO il centroide di Gerwig contiene *Barbie* e la ricerca
   restituisce *Barbie* più i blockbuster del 2023).
2. Peso di ogni film nel centroide: `log1p(VOT) × fattore_ruolo`, con `fattore_ruolo` da
   `parametri.PESI_TOKEN` (regia 1,0 · sceneggiatura 0,8 · cast 0,4). **Mai** `vote_count` lineare:
   renderebbe ogni attore con un film Marvel un satellite dell'MCU.
3. Nuovo tipo `CREWPROP`: similarità coseno fra il vettore del titolo e i centroidi delle sue persone,
   cioè `M[i,j] = max_p cos(v_i, centroide_{p, -i})` per le persone `p` del titolo `i`.
4. Misurare: banco (IC), quota >5k, top-10 di *Barbie*, *Drive*, *Parasite*.

## Criteri di accettazione

- Su *Barbie* entrano nei primi 20 almeno uno fra *Lady Bird*, *Piccole donne*, *Frances Ha*,
  *Storia di un matrimonio*, *I, Tonya*.
- Il tipo ha copertura ≥ 90% delle righe e grado mediano 50-150.
- Il banco guadagna o resta neutro (verdetto esplicito con IC).

## Costo

Nessun dato nuovo: `movies.parquet`/`tv.parquet` hanno `directors`, `writers`, `cast`; i vettori dei
titoli ci sono già. Una moltiplicazione sparsa film×persone.

---

## Esito

`services/graph_dense/crewprop.py`: incidenza film×persone da `directors`/`writers`/`cast` (top-3 per
ordine; per le serie `created_by`, perché il Parquet TV non ha registi né sceneggiatori), centroide di
carriera **leave-one-out** pesato `log1p(voti) × ruolo` (regia 1,0 · sceneggiatura 0,8 · cast 0,4),
coseno sui vettori dello studente. **3.161.764 archi · copertura 95,4% · 23 s.**

Il segnale è esattamente quello che DIR e CAST non potevano dare:

| titolo | vicini CREWPROP (primi 10) |
|---|---|
| *Barbie* | Mistress America · **Storia di un matrimonio** (#2) · **Lady Bird** (#3) · **Piccole donne** (#5) · The Meyerowitz Stories · Greenberg · **Frances Ha** (#9) |
| *Drive* | Come un tuono · The Nice Guys · Solo Dio perdona · The Neon Demon · Bronson |
| *Parasite* | The Host · Okja · Madre · Memorie di un assassino |

Nel grafo (peso 0,7, chiusura `log`): *Barbie* diventa **Piccole donne #1, Lady Bird #2**, con i
blockbuster che scalano di due posti.

**Il costo però è reale e va dichiarato**:

| peso CREWPROP | R@5 | R@20 | >5k | ΔR@5 (IC95) |
|---|---:|---:|---:|---|
| 0 | 0,146 | 0,264 | 72,3% | — |
| 0,35 | 0,141 | 0,261 | 71,7% | −0,0046 [−0,0077, −0,0019] **sopra MDE** |
| 0,7 | 0,138 | 0,260 | 71,0% | −0,0074 [−0,0120, −0,0031] **sopra MDE** |

R@20 e SNIPS non si muovono (sotto l'MDE), ma la **precisione in testa cala davvero**: il film di
famiglia autoriale sposta un link curato. Poiché il banco curato è sbilanciato verso il popolare
(§3.10 dell'handoff), questo può essere il costo *desiderato*.

**Decisione lasciata aperta**: 0,7 se conta di più il vicinato autoriale (Piccole donne/Lady Bird in
testa), 0 se conta di più la precisione sui primi 5. Non la prendo da solo: è la stessa scelta di
prodotto di §4 del ticket 04.
