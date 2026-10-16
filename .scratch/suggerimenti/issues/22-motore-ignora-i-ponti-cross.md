Status: resolved
Type: bug

# Il motore Python ignora i 2 ponti cross-medium; quello JavaScript no
**Prova** (`motore.py:73`): `self.INTRA = M["intra"]` — e basta. `M["cross"]` (2 ponti per bolla) non
viene mai letto, quindi `vicini` (riga 228 e 258) e `un_passo_fuori` **non attraversano mai il confine
fra film e serie** in Python. In `Bolle.js` invece la diffusione usa `P`, che l'esportazione costruisce
dall'intera matrice pesata **compresi i cross**: oggi ho esportato i ponti al prodotto e li ho lasciati
fuori dal motore che li ha misurati.
**Fix**: leggere le righe di `W` (il grafo sparso in `mappa-finale-6-2.npz`) invece di `INTRA`, come fa
`esporta`; oppure unire `intra` e `cross` mantenendo l'ordine per peso. Attenzione: cambia `vicini` e
`un_passo_fuori`, quindi **va rimisurato** il ticket 20.

---

RISOLTO il 16/10/2026: `Motore` legge le righe del grafo sparso pesato (`M["grafo_data"]`) e costruisce `self.VICINI` ordinati per PESO, auto-anello escluso. `INTRA` resta come elenco 6+2 senza pesi per chi lo mostra. Effetto: `un_passo_fuori` ora parte dal ponte piu' forte, non dal primo per indice.
