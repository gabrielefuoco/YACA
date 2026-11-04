Status: resolved
Type: task

# Gate check: le liste Trakt cercate per parola tonale

## Perché

Le liste `popular-*.json` sono classifiche (solo il 2% ha un nome di tono). Ma l'API Trakt ha
`GET /search/list?query=` che cerca **nei nomi e nelle descrizioni**: cercando 50 parole tonali, ogni
lista trovata è tonale per costruzione.

## Cosa è stato fatto

`.scratch/banco-casi/gate-trakt.js`: 50 query × 2 pagine (~100 chiamate), filtro 8-120 item, fetch degli
items delle liste trovate, verifica sulle 8 ancore. Costo: **3 minuti**, come da progetto.

## Esito: **il gate fallisce**

| criterio | previsto | misurato |
|---|---:|---:|
| liste tonali trovate | 2.500-3.500 | **277** |
| dopo il filtro 8-120 | ~2.500 | **161** |
| ancore in ≥5 liste | ≥6 su 8 | **1 su 8** |

Dettaglio ancore: The Truman Show 6 · The Substance 4 · EEAAO 3 · Povere creature! 2 · Parasite 2 ·
Lady Bird 2 · Barbie **1** · Drive **0**.

*Barbie* compare in **una** lista tonale (il cui nome è «Queer»: nessun co-membro utile).

**Verdetto**: il corpus di liste tonali che servirebbe all'idea LISTSEM **non esiste** su Trakt in questa
forma. Il gate ha fatto il suo lavoro: 3 minuti invece di 20 per scoprirlo, e nessun download inutile.
