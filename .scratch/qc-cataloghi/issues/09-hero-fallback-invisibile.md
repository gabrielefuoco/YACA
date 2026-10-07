# 09 — Hero: il fallback non deve travestirsi da raccomandazione

**Stato**: `ready-for-agent` · **Causa**: dai giudizi hero (profilo freddo, `seed_network`, `true_blend` anime) · **Fonte**: [report §6](../ricerche/01-report-qc-cataloghi.md)

## Problema

Due difetti distinti che si vedono solo leggendo le liste, entrambi nei costruttori dei hero.

### A. Il profilo freddo riceve il fallback come se fosse personale — **misurato**

Il `yaca_true_blend_movies` di un profilo senza DNA è **esattamente** il fallback «popolari ultimi 36 mesi,
voti ≥ 100, media ≥ 6.8»: **50 titoli su 50 identici, stesso ordine** (verificato con una query diretta).
Il giudice cieco ha dato allo stesso hero **B 68**: «fallback di popolarità senza DNA servito come Scelto per Te».
`seed_network` nella stessa condizione è **«una falsa rete dei preferiti»** (B 66/B 68: corti, backstage, reality
show, `match 0` su tutta la lista).

Questo è il degrado già documentato in `ALGORITHMS.md` §6.5: il fallback finisce nella stessa cache della
raccomandazione, con TTL 7 giorni, e l'utente non può distinguerlo. Il ticket lo chiude con una scelta di prodotto,
non con un algoritmo nuovo: **o il fallback si dichiara** (etichetta/nome diverso, o catalogo nascosto se non c'è
segnale), **o non si serve**.

### B. Il cap di diversità refluisce live-action in un profilo anime — **misurato**

`yaca_true_blend_movies` per il profilo Otaku: **B 73** con 19 film live-action a basso `match`. Causa: il cap
`HERO_DIVERSITY_CAPS.genre = 3` satura sull'Animazione (che per quel profilo è il genere dominante) e il refill
riempie con i non-anime. Il cap esiste per la diversità, ma qui produce l'opposto della promessa: un profilo
anime-dipendente riceve una lista per metà live-action.

## Approccio

**A**: dare al fallback una **chiave di cache separata** (o un TTL breve) e un flag che impedisca di sostituire il
ranking vero; marcare il catalogo servito da fallback (nome/emoji) o nasconderlo quando il profilo non ha segnale.
`hidden_gems` nel profilo freddo **passa** (P 88/P 97) proprio perché non promette personalizzazione: è il modello
da seguire per gli altri tre.

**B**: esentare il genere dominante del profilo dal cap (o contare il cap per *strand* e non per genere, come già
avviene per gli anime col `animeStrand`), e verificare che il reflusso non superi una quota dichiarata
(es. live-action ≤ 20% in un profilo con DNA anime ≥ 80%).

## Criteri di accettazione

- Profilo freddo: nessun hero servito come «Scelti per Te» se il contenuto è il fallback, oppure `metas: []`.
- Profilo anime: `true_blend_movies` con quota anime coerente col DNA (≥ 80%), misurata con `hero-enrich.js`.
- Il fallback non resta in cache sotto la chiave della raccomandazione.

## Fuori ambito

Il riscaldamento del profilo (chiedere all'utente di votare qualcosa): è onboarding, non questo ticket.
