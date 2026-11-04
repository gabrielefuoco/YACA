Status: resolved
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

---

## Esito: neutro, e per un motivo strutturale

`cov_res.py`: tiene solo gli archi di co-visione che scavalcano **genere** (nessun genere in comune) ed
**epoca** (≥ 10 anni di distanza), con soglia di forza al p50. **81.275 archi · 21,1% di copertura** ·
scarta 1,89M di archi per genere/epoca e 1,98M per debolezza.

Nel grafo (V25): `R@20 −0,0003 [−0,0015, +0,0006]`, **rumore**. Il numero di archi del grafo **non
cambia** (36.126.858 prima e dopo): ogni arco di COV_RES è già in COVISION, quindi il tipo non aggiunge
collegamenti — **ripesa** quelli che esistono. È esattamente la previsione: non alza il tetto, cambia
l'ordine dentro il tetto, e su un ordine già dominato da altro non si vede.

La riga di *Barbie* in COV_RES è **vuota**: i suoi co-spettatori sono tutti dello stesso genere e della
stessa epoca. Non c'è niente da ripesare.
