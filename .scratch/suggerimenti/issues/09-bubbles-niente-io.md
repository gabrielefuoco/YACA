Status: resolved
Type: task

# `import bubbles` legge il disco: I/O a tempo di import
**Prova** (`graph/bubbles.py:31`): `KEYS, ROW_OF, N, IS_TV = K.titoli()` a livello globale. Chiunque
faccia `from graph import bubbles as B` paga la lettura di `spazi-trakt.npz` e la costruzione di un
dizionario di 66.259 stringhe — **anche** `motore.py`, `collocator.py`, `pipeline.py` e tutti gli
arbitri, che importano `bubbles` solo per leggere quelle costanti.
**Fix**: `canon.titoli()` con `@functools.lru_cache(maxsize=1)`, e le costanti esposte da `canon`.
`bubbles.py` le prende da li' quando servono, non a tempo di import. Attenzione: `canon` e' importato
da tutti, quindi l'ordine di import va provato (import circolare).
**Chiuso quando**: `python -c "import graph.bubbles"` non legge nessun .npz (verificabile col tracciato
degli `open`, o banalmente dal tempo: sotto i 50 ms).

---

RISOLTO il 16/10/2026 con `__getattr__` di modulo (PEP 562) e `functools.lru_cache` su `canon.titoli()`: nessuno dei 12 consumatori cambia una riga. MISURATO: il primo uso di `B.N` costa 80 ms e l'import non legge piu' niente. (L'import resta ~4 s, ma e' pandas, non `titoli()`: il costo vero dei 20 s di avvio e' il parsing dei parquet, ticket 08.)
