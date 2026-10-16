Status: resolved
Type: bug

# `da_trakt` non riporta la data: lo split "temporale" e' film-semi / serie-oro
**Prova** (`graph/motore.py:294-310`): `da_trakt` cicla `for tipo in ("movie","show")` e non legge mai
`last_watched_at`. L'array e' quindi **tutti i film e poi tutte le serie**. Chi taglia `storia[:70%]` /
`storia[70%:]` credendo di separare passato e futuro sta separando **medium**: i film seminano, le serie
sono l'oro. Lo fanno `intero.py` e `pesi.py`.
**Fix** (e' anche il refactor 2 del senior, la radice di questa classe di bug): **una sola** funzione
`storia_trakt(u, ordine="cronologico")` in `graph/canon.py` — legge `last_watched_at` (ISO, confronto
diretto di stringhe), restituisce `[(chiave, plays, eta_giorni, tipo)]`, con `ordine` che decide il
verso. La chiamano `motore.da_trakt`, e i 10 arbitri che oggi rileggono i JSON ognuno a modo suo.
Elimina ~10 copie e il calcolo di `now - last_watched_at` dentro il ciclo per riga.
**Chiuso quando**: `grep -rn "last_watched_at" graph/measure/` non trova piu' parsing locali (solo la
chiamata a `K.storia_trakt`), e `intero.py` ristampato da' un numero nuovo e credibile.

---

RISOLTO il 16/10/2026: `canon.storia_trakt` e' l'unica funzione che legge i JSON di Trakt; `motore.da_trakt` e `intero.py` la usano. Verificato su un utente vero: 174 cambi di medium lungo la storia (prima ce n'era 1: tutti i film, poi tutte le serie).
