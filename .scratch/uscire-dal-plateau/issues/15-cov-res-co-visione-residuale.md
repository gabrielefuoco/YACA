Status: ready-for-agent
Type: task
Blocked by: 13

# COV_RES: co-visione residualizzata contro genere, epoca e popolarità

## Perché

Due film con affinità comportamentale alta, generi disgiunti, epoche distanti, trama dissimile:
per costruzione «chi guarda X guarda anche Y e non c'entrano niente come genere» — la definizione
operativa di tono. Oggi la co-visione grezza è dominata da genere/età/popolarità, e il gate di
popolarità è una pezza che agisce dopo.

## Cosa fare

1. Modellare l'osservazione `c_ij` (co-visioni) con un termine atteso da genere, decennio, medium e
   popolarità (Poisson o log-lineare), e tenere come segnale il **residuo** — con un limite inferiore di
   confidenza (LCB) per non far emergere rumore da conteggi bassi.
2. Costruire `COV_RES` come tipo a sé, e confrontarlo con `COVISION` sul dev set.
3. Riportare anche la quota di horror/crime adulti nei top-10 dei semi familiari: è il sintomo di
   contaminazione da account condivisi (genitori/figli).

## Segnale di fallimento

Se oltre il 20% dei top-10 sui semi per famiglie è horror/crime adulti, o la coerenza su holdout Trakt
scende sotto il caso, il residuo è rumore: chiudere.

## Criteri di accettazione

- Sul dev set: copertura@500 +2 punti e R@20 sopra l'MDE; quota >5k non in aumento.
