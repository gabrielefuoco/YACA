# Obiettivo: Implementazione del Kids Filter (NSFW Blacklist)

Questo task definisce il piano per estendere il sistema di blocco NSFW (attualmente applicato al Matchmaker) e creare un solido filtro famigliare ("Kids Mode") per l'intera app YACA, preparandolo anche per futuri dump massivi di dati (1 Milione+ di film su TMDB).

## 1. Completamento Blacklist (Coda Lunga delle Keyword)
Prima di attivare il filtro in produzione, dobbiamo catturare le keyword iper-rare che il grafo vettoriale ha ignorato (frequenza < 15):
- [ ] Scrivere uno script in Node.js per interrogare direttamente `movies.parquet` (DuckDB).
- [ ] Trovare tutte le keyword che compaiono 1-14 volte.
- [ ] Calcolare il "Toxicity Score": se la keyword rara compare quasi esclusivamente (es. >80% dei casi) associata a un film che contiene una delle nostre `BAD_KEYWORDS` (le seed originali e le 209 estratte dal grafo), aggiungerla alla `extracted_nsfw_keywords.json`.
- [ ] Consolidare un unico file JSON (`nsfw_blacklist.json`) che conterrà il vocabolario proibito definitivo.

## 2. Applicazione del Filtro in Fase di Ingestion (Futuro DB)
Quando aggiorneremo il database con un dump TMDB totale:
- [ ] Aggiungere un middleware nel builder del DB che scansiona i film in entrata.
- [ ] Se le keyword del film intersecano la `nsfw_blacklist.json`, flaggare il record sul parquet con un booleano (es. `is_nsfw: true` o `kids_safe: false`).
- [ ] Questo permette di preservare la topologia del Grafo per il Matchmaker standard, isolando brutalmente i film.

## 3. Implementazione UI (Kids Mode)
- [ ] Aggiungere un toggle "Kids Mode / Family Friendly" nel Profilo Utente o nell'interfaccia principale.
- [ ] Quando il toggle è attivo:
  - Il Matchmaker Handler salta in automatico tutti i nodi flaggati con `nsfw: true` nel Grafo.
  - Le query a DuckDB per le ricerche libere includono la clausola `WHERE kids_safe = true`.
- [ ] (Opzionale) Aggiungere una logica "Dark Mode" segreta: disabilitando il Kids Mode e attivando la modalità Oscura, l'app suggerisce *intenzionalmente* i cluster estremi.
