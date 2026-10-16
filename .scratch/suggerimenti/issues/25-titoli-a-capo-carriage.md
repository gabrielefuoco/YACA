Status: resolved
Type: bug

# Un `\r` in un titolo sfalsa l'allineamento di `titoli-canone.txt`
**Prova, verificata**: oggi `len(TIT) == N` (66.259) ed e' tutto allineato — il bug e' **condizionale**.
Ma in `canon.metadati` si scrive `str(t).replace("\n", " ")` **senza togliere `\r`**: se un titolo TMDB
contiene un ritorno carrello, `pt.read_text(...)` (che usa le newline universali) lo converte in `\n`, e
`.split("\n")` produce un array **piu' lungo di N**: tutti i titoli successivi slittano di una riga, senza
un'eccezione.
**Fix**: `.replace("\r", " ").replace("\n", " ")` in scrittura, e `assert len(d["TIT"]) == N` in lettura
(vedi anche il ticket 34, contratto di lunghezza).

---

FATTO il 16/10/2026: `.replace("\r", " ")` in scrittura e `assert_lunghezza_canone(..., atteso=N)` in lettura. Verificato: il file si carica e il contratto non protesta (66.259 titoli).
