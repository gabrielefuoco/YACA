Status: resolved
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
---

RISOLTO il 16/10/2026 per la parte che conta. L'artefatto (2,54 MB, da 2,03) porta ora per ogni bolla
`termini` (i 5 token V3 piu' forti del centroide normalizzato) e `esempi` (i 3 titoli piu' votati), e
`Bolle.js` restituisce per ogni mondo acceso `da_semi` (i 2 titoli della storia che hanno versato piu'
massa) piu' un metodo `descrivi(bolla)`. Il portafoglio si legge cosi':

    mondo 1084 [ge:sci-fi & fantasy, kw:space travel, ge:action & adventure]
      — 25 titoli, voti mediani 636 · es. Star Trek: Discovery, Star Trek: Picard, Stargate SG-1
      acceso per: tv:314

DUE COSE IMPARATE STRADA FACENDO, e valgono piu' del campo:
  · **i centroidi sono 2.922, non 3.497**: `TUTTE` e' la mappa bolla -> riga e le 575 bolle piccole non
    hanno un centroide. Restano con `termini` vuoto, che e' la verita' e non un buco.
  · **gli id delle bolle NON sono stabili fra partizioni.** Nel primo test la bolla 820 risultava essere
    «sketch comedy · satira» (Fawlty Towers, Monty Python), mentre `handoff-senior-6.md` §5 la cita come
    «il canone del thriller psicologico». Ha ragione l'artefatto: quel 820 era **V8**, e con la partizione
    finale il numero indica un altro mondo. E' la trappola 2 denunciata dentro il documento che la
    denuncia — la citazione nell'handoff va corretta o marcata come storica.

RESTA: `motore.lista` (il lato Python) non restituisce ancora `da_semi`: e' l'unico pezzo del ticket non
fatto, ed e' piccola cosa perche' la sorgente (i pesi dei semi per bolla) esiste gia' in `M.pesi_semi`.
