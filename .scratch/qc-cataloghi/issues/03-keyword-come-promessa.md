# 03 — Promesse appoggiate a una singola keyword

**Stato**: `ready-for-agent` · **Causa**: C2 · **Fonte**: [report §3 C2](../ricerche/01-report-qc-cataloghi.md)

## Problema

Dieci cataloghi affidano la propria promessa a **una** keyword TMDB (o a un'intersezione rigida di generi). La
keyword non controlla né il significato né l'estensione: o è troppo stretta (pool che non riempie la pagina) o
troppo larga (titoli che c'entrano per caso). In entrambi i casi la promessa del nome non è mantenuta, e il
punteggio scende per pertinenza o per completezza.

## Casi, con il fatto che li condanna

| Catalogo | Score | Fatto verificato |
|---|---|---|
| `preset_cult_classics` | B 64 | keyword 6158, pool 64, mediana 6,3, prevalenza di B-horror |
| `preset_zombies_movies` | **N 59** | AND Horror∩Fantascienza: pool 32, esclusi i classici zombie, 56% sotto 6.0 |
| `preset_psych_thriller` | B 68 | Thriller∩Horror: pool 45, tagliati i capisaldi del thriller psicologico |
| `preset_mindfuck` | B 75 | keyword multiple e lasche: 3 film animati DC nei primi 50 |
| `preset_mindfuck_series` | B 71 | idem su serie |
| `preset_fantasy_magic` | B 72 | keyword `dragon`: cattura Dragonball Evolution, In the Name of the King |
| `preset_space_hard_scifi` | B 73 | le keyword attuali non distinguono l'hard sci-fi dallo space fantasy |
| `preset_italian_comedy` | B 68 | keyword restrittiva, pool 53, 8 righe di trash |
| `preset_action_blockbusters` | B 74 | «Motori & Esplosioni» ma la lista è action generico (Spider-Man, Aquaman) |
| `preset_anime_shonen` | B 76 | keyword 14643: pool 15, dentro Fate/Persona/Maken-Ki, fuori i pilastri shonen |
| `preset_heist` | B 77 | stessa forma, magnitudine minore |
| `preset_treasure_hunters` | B 77 | idem |

## Approccio

Per ciascun catalogo, in ordine di preferenza:

1. **Sostituire la keyword singola con una lista curata** (5-15 id) presa dai titoli che si vogliono davvero, verificata a mano — è la strada già usata altrove nel file dei preset.
2. **Aggiungere un secondo vincolo che discrimini** (genere + soglia voti + finestra temporale), non un AND che strozza.
3. **Cambiare il nome** al catalogo quando il filtro è corretto ma il nome promette un'altra cosa (vedi ticket 08).

## Criteri di accettazione

- Per ogni catalogo toccato: pool ≥ 60 e share di titoli fuori tema < 10% (misurati con `top50-dump.js`).
- `preset_zombies_movies` e `preset_anime_shonen` non più N/B: pool pieno e pilastri di genere presenti nei primi 20.
- Nessuna regressione di overlap: `preset_anime_action` × `preset_pop_anime` = 0,569 va ridotto o accettato esplicitamente (sono oggi lo stesso elenco con due nomi).

## Fuori ambito

Il comportamento di TMDB sulle keyword (non è sotto il nostro controllo): il punto è smettere di dipenderne.
