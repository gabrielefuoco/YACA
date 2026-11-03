Status: ready-for-agent
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
