Status: resolved
Type: bug

# L'artefatto perde i 2 ponti cross-medium, i pesi degli archi e la ritenzione interna
**Prova** (`graph/pipeline.py:331-332`): `M = np.load(D/"mappa-finale-6-2.npz")` e poi **solo**
`INTRA = M["intra"]`. Ma quel file contiene anche `cross` (3497x2), `cross_lun`, `quota_tv` e —
regalo — **il grafo sparso pesato** (`grafo_data` 45.194 float64, `grafo_indices`, `grafo_indptr`).
Quindi: in `Bolle.js` la diffusione non attraversa mai i ponti fra film e serie, e tratta ogni vicino
allo stesso modo **senza pesi** (`Bolle.js` divide `r[b]/vic.length`). In Python invece il 47,8% della
massa resta nella bolla a ogni passo, e il resto esce in proporzione ai pesi.
**Fix**: in `esporta`, scrivere per ogni bolla la **riga di transizione normalizzata** presa dal grafo
sparso `P = D^-1 @ W` (i 6+2 vicini coi loro pesi **piu' la quota di auto-anello**), e in `Bolle.js`
usare quella riga al posto della divisione uniforme. Costo in RAM: zero (i pesi sono 45.194 numeri).
L'auto-anello e' il pezzo che manca oggi: senza, il 100% di `(1-alpha)*r[b]` esce dalla bolla.
**Chiuso quando**: una storia di prova da' in JS le stesse bolle in cima che da' in Python, e il
confronto numerico (ticket 16) sta entro l'1%.

---

RISOLTO il 16/10/2026. L'artefatto ora porta per ogni bolla `P` = [[bolla, peso], ...] col grafo sparso pesato (45.194 archi, auto-anello incluso) e `Bolle.js` usa quella riga. MISURATO col banco `prova-pesi.js`: il salto uniforme cambiava 3 dei primi 10 mondi (Jaccard 0,54), il primo mondo si accendeva al 29,6% invece che al 30,0%, e la versione pesata e' anche piu' VELOCE (73 ms contro 179: quella vecchia allocava un array per bolla per iterazione). Artefatto 2,03 MB. I ponti cross-medium ora ci sono.
