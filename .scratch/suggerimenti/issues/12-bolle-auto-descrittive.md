Status: ready-for-agent
Type: task

# Le bolle sono numeri opachi: `termini`, `esempi`, e `da_semi`
**Prova**: in `bolle.json` e in `motore.py` una bolla e' `mondo 1084 · acceso 4,3% · 25 titoli · voti
mediani 636`. Per sapere **che cos'e'** e **perche'** si e' accesa bisogna incrociare i parquet o
leggere i titoli uno a uno. In `.scratch/mappa-pesata/bolle-esempi.md` la riga coi top token V3
(`ge:thriller · kw:psychological thriller · di:david fincher`) e i 3 titoli piu' votati rendeva tutto
leggibile a colpo d'occhio.
**Fix**, due campi leggeri (~180 KB su 3.497 bolle) nell'artefatto:
  · `"termini"`: i 5 token V3 piu' forti del centroide
  · `"esempi"`: i 3 titoli piu' votati della bolla
E in uscita, per ogni mondo acceso, `"da_semi"`: i 2 titoli della storia che hanno versato **piu'
massa** in quella bolla (si calcola durante la diffusione, e' la matrice dei semi per mondo).
**Chiuso quando**: `python -m graph.pipeline lista --utente NOME` stampa, per ogni mondo,
«Mondo 820 [thriller psicologico, David Fincher] acceso per Se7en e Gone Girl».
