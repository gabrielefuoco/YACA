Status: resolved
Type: bug

# `parita` non normalizza, e l'artefatto arrotonda senza rinormalizzare: e' il 4,2e-5
**Era il residuo «di causa non isolata» del §4.3 dell'handoff 7. La causa c'e', ed e' questa.**
**Prova, misurata**: in `pipeline.py:esporta` i pesi di `P` sono `round(float(x), 4)`; su una riga con
~15 archi lo scostamento da 1 sale a **7,0e-4** (mediano 1,0e-4), e ci sono **24 pesi a zero** che
restano nel JSON. Poi `pipeline.py:parita` salva `pura = [(int(b), float(x)) ...]` **senza dividere per
`r.sum()`**, mentre `Bolle.js` (`attiva`) divide per `somma`. Le due parti divergono di quel tanto.
E c'e' una cosa da dire: **il mio test lo sapeva**. `test_le_righe_di_transizione_sono_normalizzate` ha
una tolleranza di `5e-3` scelta *apposta* per far passare lo scostamento da arrotondamento. Ho visto il
sintomo e ho allargato la tolleranza invece di chiudere la causa.
**Fix**: in `esporta`, scartare i pesi nulli e arrotondare a 6 decimali **rinormalizzando la riga** dopo
l'arrotondamento (somma esattamente 1 in floating point, a meno di 1e-16); in `parita`, dividere per
`r.sum()` come fa `Bolle.js`. Poi **stringere le tolleranze**: il test dell'artefatto da 5e-3 a 1e-9, e
il test di parita' da 1e-3 a 1e-9 (oggi l'errore e' 4,2e-5: deve scendere sotto 1e-9).

---

RISOLTO E VERIFICATO il 16/10/2026. Due meta': in `esporta` i pesi nulli si scartano e la riga viene RINORMALIZZATA (9 decimali); in `pipeline.parita` si divide per `r.sum()` come fa `Bolle.js`. MISURATO: l'errore normalizzato del test di parita' e' sceso da **4,2e-5 a 1,1e-8** — quattro ordini di grandezza — e la tolleranza dei due test e' stata stretta di conseguenza (1e-3 -> 1e-6, e 5e-3 -> 1e-9 sul contratto delle righe). Artefatto: 2,54 -> 3,12 MB (i pesi non sono piu' arrotondati a 4 decimali). **E LA LEZIONE**: il mio test dell'artefatto aveva una tolleranza di 5e-3 scelta APPOSTA per accogliere lo scostamento da arrotondamento. Avevo visto il sintomo e ho allargato la tolleranza invece di cercare la causa: una tolleranza larga e' il posto dove un bug si nasconde.
