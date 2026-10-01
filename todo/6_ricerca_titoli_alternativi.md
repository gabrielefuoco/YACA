# Obiettivo: la ricerca trova i titoli anche per nome alternativo

Idea dell'umano (01/10/2026), misurata nello stesso giorno. Da fare **in futuro**, non ora: dipende dalla
colonna `alternative_titles` — vedi [`7_colonna_titoli_alternativi.md`](7_colonna_titoli_alternativi.md).

## La cosa

L'utente cerca "Kwicky Koala" o "Oceania" e deve trovare il titolo **qualunque nome abbia in testa**: quello
italiano, quello originale, o uno dei titoli alternativi che TMDB conosce. Oggi la ricerca lavora sul titolo
del nostro DB; i titoli alternativi sono una miniera inutilizzata.

**Misurato il 01/10**: su 50 titoli di Antonio Genna che il nostro DB non riesce ad agganciare, **27 (54%)
compaiono fra i titoli alternativi** del record TMDB corrispondente. Cioè: metà dei nomi che un utente può
digitare non sono nel nostro indice.

## Perché vale

- **È il caso d'uso più naturale**: chi cerca un film vecchio o una serie TV spesso ha in testa il titolo con
  cui l'ha visto (TV, VHS, edizione estera), non quello che TMDB considera primario in `it-IT`.
- Non richiede scraping né fonti nuove: è un arricchimento del dump che ha già un ticket.
- Non tocca i cataloghi: la ricerca vive nell'indice (FTS5, mappa `ingestione-db`), non nella view lazy.

## Cosa serve

- [ ] La colonna/sidecar dei titoli alternativi — **prerequisito**, vedi `7_colonna_titoli_alternativi.md`.
- [ ] Estendere l'indice di ricerca a `title` + `original_title` + `alternative_titles`, con un peso
      (il titolo primario resta quello che decide l'ordinamento; gli alternativi allargano il richiamo).
- [ ] Decidere se mostrare all'utente *perché* un risultato è comparso ("trovato come *Titolo alternativo*"):
      senza questa riga l'utente può non riconoscere il risultato.
- [ ] Misurare il costo in spazio dell'indice (gli alternativi sono decine di stringhe per titolo, su 1,4M
      record col mirror completo) **prima** di costruirlo.
- [ ] Attenzione alla lingua: gli alternativi di TMDB sono multilingua (`20 000 Lieues dans l'espace`,
      `我爱美乐蒂`) — filtrare per `iso_3166_1`/`iso_639_1` o accettare tutto? Decidere, perché indicizzare
      tutto significa che una ricerca in cirillico trova un titolo italiano.
- [ ] Coordinamento con la mappa `ingestione-db` (ticket *Ricerca unificata*): non duplicare quel lavoro.

## Riferimenti

- Dati: `.scratch/doppiaggio-ita/ricerche/titoli-alternativi.json`.
- Il lavoro sul dato: [`7_colonna_titoli_alternativi.md`](7_colonna_titoli_alternativi.md) — fuori dalla mappa
  `doppiaggio-ita`.
