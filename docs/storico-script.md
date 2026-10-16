# Storico degli Script Rimossi

Questo documento traccia i 19 script rimossi dalla cartella `scripts/` durante la riorganizzazione dei confini di YACA (Ticket 06 — Assetto delle cartelle, 17/10/2026).
Ciascuno script è descritto con la data del suo ultimo commit, il suo scopo originario, il commit SHA da cui può essere recuperato (`git show <sha>:<path>`) e lo stato di prova dell'avvenuta esecuzione.

| Script | Ultimo Commit | SHA di recupero | Cosa faceva | Esecuzione provata? |
|---|---|---|---|---|
| `scripts/bench_learned_names.js` | 2026-10-03 | `a55df72843be2e8f426a775b51e670697514d7af` | Banco di misura della terza fonte di ricerca (`learned_names`); il numero è già misurato nell'header | Non provata (inferita da header) |
| `scripts/build_tier2_fts5.js` | 2026-10-02 | `bf36720b3d967c8160be7848feb165ac1049cc96` | Runner manuale per costruire l'indice FTS5 di Tier 2 (il daemon di prodotto `tmdbDumpDaemon.js` lo fa autonomamente) | Non necessaria (runner manuale superato) |
| `scripts/count-dead-posters.js` | 2026-10-05 | `5f39ba107690e41c42e15e428eab74a42adadf8b` | Metro del ticket 08 per contare poster mancanti o con host dismessi | Non provata |
| `scripts/count-library-docs.js` | 2026-10-05 | `3f23a24d747f68fc1c8dc1dfc5d9c037c011abf9` | Metro del sync per contare documenti in archivio prima e dopo il sync | Non provata |
| `scripts/drop-streambadges.js` | 2026-10-05 | `7860efe868acfad445d93e8b8d0f6837257fe5c8` | Bonifica una tantum della collection residua `streambadges` su MongoDB (24.830 documenti) | Non provata da checkout |
| `scripts/convert-library-once.js` | 2026-10-05 | `d1c2837e430e064ac7753dd0a9ace600f3aedf38` | Giro una tantum di conversione della libreria utente (`LibraryConverterService.convertAll`) | Non provata da checkout |
| `scripts/sync-library-once.js` | 2026-10-05 | `c70eb754d16ff2d4b83f1f0989a97439fe6c6e5f` | Giro una tantum di sincronizzazione della libreria utente con mappatura anime | Non provata da checkout |
| `scripts/repair-library-data.js` | 2026-10-05 | `7860efe868acfad445d93e8b8d0f6837257fe5c8` | Riparazione dati libreria: riscrittura copertine servite da host dismessi | Non provata da checkout |
| `scripts/repair-dna-names.js` | 2026-10-05 | `7860efe868acfad445d93e8b8d0f6837257fe5c8` | Riparazione batch del 05/10 per nomi nel DNA profilo | Non provata da checkout |
| `scripts/repair-dna-vectors.js` | 2026-10-05 | `7860efe868acfad445d93e8b8d0f6837257fe5c8` | Riparazione batch del 05/10 per vettori nel DNA profilo | Non provata da checkout |
| `scripts/requeue-damaged-titles.js` | 2026-10-05 | `9466dbe1b99d82c4b16116ce5ff8387c284df59d` | Ri-accodamento per gli 8 item danneggiati identificati nel ticket 14 | Non provata da checkout |
| `scripts/requeue-library-without-tmdb.js` | 2026-10-05 | `00b91c80ce759bdee47d83a0c972331e0b46a396` | Rimessa in coda una tantum della libreria senza ID TMDB (ticket 06) | Non provata da checkout |
| `scripts/verify-damaged-titles.js` | 2026-10-05 | `9466dbe1b99d82c4b16116ce5ff8387c284df59d` | Verifica di controllo sugli 8 item del ticket 14 | Non provata da checkout |
| `scripts/verify_real_fallbacks.js` | 2026-10-01 | `8fade2d5ba4501c8258b61cc9ed4bbe4567a4787` | Verifica una tantum degli 11 record non risolti del bridge TVDB→TMDB | Non provata da checkout |
| `scripts/qa/dedup-real-library.js` | 2026-10-05 | `7860efe868acfad445d93e8b8d0f6837257fe5c8` | Pulizia una tantum della libreria utente reale per deduplica record | Non provata da checkout |
| `scripts/qa/hero-enrich.js` | 2026-10-07 | `f5792f22e542c550166e3cfa1ba568fc775342a0` | Tool di misura arricchimento hero della campagna QC cataloghi | Non provata (tool campagna QC) |
| `scripts/qa/keyword-bench.js` | 2026-10-07 | `f5792f22e542c550166e3cfa1ba568fc775342a0` | Banco di test delle keyword della campagna QC cataloghi | Non provata (tool campagna QC) |
| `scripts/qa/qc-aggregate.js` | 2026-10-07 | `f5792f22e542c550166e3cfa1ba568fc775342a0` | Aggregatore di report della campagna QC cataloghi | Non provata (tool campagna QC) |
| `scripts/qa/verify-solo-anime.js` | 2026-10-07 | `f5792f22e542c550166e3cfa1ba568fc775342a0` | Verifica profilo di test solo-anime per campagna QC cataloghi | Non provata (tool campagna QC) |

Nota: `scripts/extracted_nsfw_keywords.json` (3.814 byte) non è stato eliminato ma spostato in `docs/todo/extracted_nsfw_keywords.json` accanto a `docs/todo/3_kids_filter_and_nsfw.md`, di cui costituisce l'input di lavoro.
