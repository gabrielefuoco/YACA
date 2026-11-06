Status: resolved
Type: grilling
Blocked by: 02

# Definizione della vista di interesse recente

## Question

Qual è la definizione operativa di «recente» per il secondo profilo: finestra temporale, ultimi N eventi o entrambe? Decidere anche come evitare che una raffica breve domini il segnale, mantenendo comunque la vista recente più influente della storia vecchia e separata dai suoi cluster.

## Resolution — la recenza è selezione, non peso (ereditato e misurato)

Non c'è una finestra temporale da inventare. Il vecchio modulo ha misurato tre volte che la recenza
come **peso** è inerte (`NIENTE_RECENZA`, `NIENTE_BOOST`, `NIENTE_RANGO` in `parametri.py`), mentre
come **selezione** è potentissima: i soli ultimi 15 titoli fanno 47,5× contro 18,2× della storia intera.

Quindi la vista recente è: **gli ultimi 15 eventi per data**, pesati con gli stessi pesi ereditati del
ticket 02, e passati come insieme di semi separato. Due richieste distinte al motore, non una
richiesta con pesi gonfiati: così il profilo di lungo periodo non viene contaminato e i due risultati
restano confrontabili.

Restano fuori dalla decisione, perché sono di prodotto: quante righe mostrare per la vista recente e
con quale priorità rispetto alle righe di lungo periodo (ticket 08). L'ordinamento temporale lo fa
YACA, che ha i timestamp; il motore riceve solo l'elenco ordinato e non interpreta date.
