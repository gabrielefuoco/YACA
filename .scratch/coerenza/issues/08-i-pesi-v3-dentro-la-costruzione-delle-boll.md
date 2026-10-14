Status: ready-for-agent
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
