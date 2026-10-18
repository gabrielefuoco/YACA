Status: needs-triage
Type: research

# 43 — Il metro: quale riga è **meglio**, non solo diversa

## Perché

La fetta 1 ha misurato che la riga nuova di `hidden_gems` è **diversa** da quella del vecchio motore: Jaccard
**6,3%** (film) e **9,0%** (serie) — cioè due righe quasi disgiunte. Ma «diversa» **non è** «meglio», e oggi non
esiste **alcun metro** per dirlo.

Senza metro, migrare le altre tre strategie (`trakt_filtered`, `seed_network`, `true_blend`) significa
sostituirle **sulla fiducia** — e il guadagno (3.169 righe in meno) sarebbe pagato con un peggioramento che
nessuno vedrebbe, perché nessuno lo misura.

## Il metro esiste già in casa: la ricetta

`services/graph/measure/ricetta.py` misura la qualità di una riga **sui dati reali di un utente**:

```
semi = il 70% più VECCHIO della cronologia dell'utente
oro  = il 30% più RECENTE (quello che l'utente ha guardato DOPO)
metrica = quanti titoli dell'ORO finiscono nella riga raccomandata  ("oro_preso")
```

Con **60 utenti Trakt reali** come nella ricetta, il numero acquista peso. È la stessa metodologia che ha
permesso di calibrare `DELTA_FASCIA` (ticket 39 di `suggerimenti`) e di dire che gli assi **modulano** invece
di filtrare.

## Cosa deve uscire

1. **Una misura per le righe di gusto** (non per il grafo): dato un utente, tagliare la storia, costruire la
   riga con **OFF** e con **ON**, e contare l'`oro_preso` di ciascuna — più il **riempimento** (quanti titoli
   escono) e la **diversità** (per genere/regista).
2. **Il confronto su N utenti** (non su uno): la media e la distribuzione, non un aneddoto. La sonda attuale usa
   un solo utente (`REOZrGNRr3`).
3. **Un criterio di decisione dichiarato prima di misurare**: cosa fa dire «la nuova va bene» — es. *oro_preso
   non inferiore di più di X punti*, *riempimento ≥ 20*, *nessuna riga vuota*. Deciderlo **dopo** aver visto i
   numeri è il modo di mentirsi.
4. **La risposta scritta**: quale delle due ordina meglio il futuro dell'utente, con i numeri. Se **il vecchio
   vince**, si dice — e allora il piano cambia (si migra solo dove la nuova non peggiora, o si migliora il
   fornitore prima di proseguire).

## Il segnale che rende questa misura urgente

La riga nuova restituisce **75** candidati (film) e **58** (serie) contro **160/160** del vecchio: **metà del
materiale**. Può voler dire *selettività* (bene) o *fame di candidati* (male, se il pool deve riempire più righe
o se i cap di diversità tagliano troppo). Il `oro_preso` distingue i due casi: se i titoli dell'oro ci sono
ancora, la lista è più corta ma più giusta; se spariscono, la lista è solo più povera.

## Perché **prima** delle altre tre strategie

Il costo di una nuova strategia è basso (qualche ora); il costo di scoprire **dopo** quattro migrazioni che le
righe sono peggiori è un ritorno indietro su tutto. Questo ticket rende la decisione **una misura** invece di
una scommessa — ed è la stessa lezione del giorno: *un numero giusto con una spiegazione sbagliata è peggio di un
numero sbagliato*, e qui senza metro non avremmo nemmeno il numero.
