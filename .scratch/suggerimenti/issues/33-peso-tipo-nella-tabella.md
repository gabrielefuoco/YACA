Status: resolved
Type: task

# `PESO_TIPO_FATTORI` non e' nella tabella: cambiarlo NON cambia l'impronta della ricetta
**Prova, verificata**: in `parametri.py` c'e' `PESO_TIPO = "loved 3 · liked 2 · library 1,5 · watched 1"`
— **una stringa descrittiva** — mentre il dizionario vero, `PESO_TIPO_FATTORI = {"loved": 3.0, ...}`, vive
cablato in `camminata.py:39`. Verificato: `PESO_TIPO_FATTORI` **non compare** tra i nomi di `SCHEDA`,
quindi `P.impronta()` non lo copre.
E' la stessa classe del ticket 13 (`PESI_TOKEN` scritto in due posti) e del 21: **due fonti per un
valore**, con la seconda fuori dall'impronta. Conseguenza concreta: se qualcuno cambia i fattori di tipo,
la chiave della cache del prodotto **non cambia**, e le liste vecchie continuano a essere servite.
**Fix**: mettere il **dizionario** come valore di `PESO_TIPO` in `SCHEDA` (come fatto per `PESI_TOKEN`),
e in `camminata.py` usare `P.PESO_TIPO`. L'impronta cambia: artefatto del prodotto da riesportare
(`esporta`, 5 s) e fixture di parita' da rigenerare.

---

RISOLTO il 16/10/2026: `PESO_TIPO` in `parametri.py` e' ora il DIZIONARIO (era una stringa descrittiva), e `camminata` lo legge da li' tenendo il nome `PESO_TIPO_FATTORI` come alias perche' `pipeline.py` lo importa da quel modulo. **L'impronta della ricetta e' cambiata** (`b6607839...` -> `8b2d7932...`, e prima ancora `7884ee3e...`): l'artefatto del prodotto e' stato riesportato e il fixture di parita' rigenerato. E' esattamente l'effetto che si voleva — prima, cambiare un fattore di tipo NON invalidava la cache del prodotto.
