Status: wontfix
Type: task

# 08 — I pesi V3 dentro la costruzione delle bolle (V9)

Il §5.5: `KW`, `CAST`, `DIR` e `PROD` che costruiscono V8 usano ancora `matrice_idf` di `bolle.py`,
**senza `df ≥ 3` e senza tetto all'IDF** — quindi le stesse keyword rare che rovinavano *Verity*
(`baffled`, `dreary`) stanno ancora dentro la partizione. V3 è applicato solo a valle, nel
collocatore.

Si porta `df ≥ 3` e il tetto IDF dentro `bolle.py:matrice_idf`, si rigenera, e si confronta con V8
sulle metriche che contano: le sentinelle, N_eff per le ancore, l'indice di chimera, e il banco.

**Non si assume che sia meglio**: la maschera di genere riparata ha già una volta cambiato la
partizione di poco e in modo non ovvio.

Esito: V9 + il confronto + `ricerche/08-v9.md`.

## Esito

**NON FATTA, E NON CONVIENE FARLA.** Il §5.5 chiede di portare i pesi V3 (df>=3,
tetto idf, pesi per tipo) dentro `bolle.py:matrice_idf`, per allineare il modo in cui nascono le bolle
col modo in cui i titoli nuovi ci vengono collocati.

Ma il ticket 05 di questo stesso effort ha appena misurato che **V3 dimezza la precisione della
collocazione**: 35,3% contro il 63,0% di V1, con una metrica che per di piu' favorisce V3. Costruire
la partizione con un metro che ha appena perso 18 punti non allinea niente: propaga l'errore.

Il §5.5 va **ritirato**, non eseguito. E se un domani si volesse provare, va provato come esperimento
separato, misurando le sentinelle e N_eff prima e dopo — non come allineamento.
