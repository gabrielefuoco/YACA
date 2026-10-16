Status: resolved
Type: bug

# Il DAG non vede le uscite mancanti, e non propaga se il file e' stato cancellato
**Prova** (`pipeline.py`, `piano()`):
 1. il ciclo sulle uscite legge `prima.get("uscite", {})` — cioe' **solo i file che c'erano quando si e'
    registrato**. Se un pattern di `p["scrive"]` non ha prodotto NIENTE, non se ne accorge: nessun
    controllo su `for pat in p["scrive"]: if not _file_di(pat)`;
 2. la propagazione calcola `suoi = {f.name for pat in q["scrive"] for f in _file_di(pat)}` — **file
    esistenti su disco**. Se un intermedio e' stato cancellato e `q` deve rigenerarlo, `suoi` e' vuoto,
    `suoi & letti` e' vuoto, e il passo a valle **non sa** che il suo input sta per cambiare.
Un piano che non vede un file mancante e' peggio di nessun piano: dice «tutto in ordine» mentre manca un
artefatto.
**Fix**: (1) `for pat in p["scrive"]: if not _file_di(pat): motivi.append(f"uscita mancante: {pat}")`;
(2) nella propagazione confrontare anche i **pattern** dichiarati, non solo i file trovati:
`(suoi | set(q["scrive"])) & (letti | set(p["legge"]))` — con l'avvertenza che i pattern sono glob e il
confronto va fatto sui nomi dei file che il pattern *descrive*, non sulla stringa del pattern.

---

RISOLTO il 16/10/2026, entrambe le parti: (1) `for pat in p["scrive"]: if not _file_di(pat): motivi.append("uscita mai prodotta: ...")`; (2) la propagazione ora unisce ai file su disco i nomi delle uscite **registrate nel manifest** — cosi' se un intermedio e' stato cancellato, `_file_di` restituisce [] ma i suoi nomi restano e il passo a valle lo sa. (Il primo tentativo era un confronto di stringhe fra pattern glob: l'ho buttato, era fragile e inutile.)
