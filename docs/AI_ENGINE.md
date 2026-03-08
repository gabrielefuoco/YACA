# Motore AI - YACA

YACA integra l'intelligenza artificiale per permettere agli utenti di creare cataloghi personalizzati usando il linguaggio naturale.

## Integrazione Mistral AI

Il sistema utilizza il modello di **Mistral AI** per interpretare i prompt degli utenti e convertirli in parametri strutturati interrogabili dal database di TMDB.

### Flusso di Generazione (`src/ai/router.js`)

1.  **Input Utente**: L'utente scrive un prompt (es. "Film di fantascienza anni '90 ambientati nello spazio con un finale triste").
2.  **Prompt Engineering**: Il backend invia a Mistral un prompt di sistema estremamente dettagliato che istruisce il modello a restituire esclusivamente un oggetto JSON.

### Strategia di Routing
Mistral agisce come un **Architect**, decidendo in autonomia se la query dell'utente richiede una ricerca per somiglianza (`similar`), una ricerca testuale (`multi_search`) o un'esplorazione complessa (`discovery`).

### Protezioni e Sanitizzazione
Il sistema valida ogni campo della risposta JSON di Mistral tramite una *Allow-List* rigorosa, prevenendo tentativi di prompt injection o risposte malformate che potrebbero mandare in crash l'addon.

3.  **Mapping Strategico**: Mistral non restituisce solo filtri, ma decide la **strategia** di ricerca:
    - `discovery`: Se deve usare i filtri standard.
    - `similar`: Se deve basarsi sulla somiglianza con film specifici citati nel prompt.
    - `multi_search`: Se deve cercare termini specifici.
4.  **Keyword Resolution**: Poiché le keyword di TMDB sono numeriche, il sistema effettua una ricerca inversa per mappare i termini suggeriti dall'AI agli ID corretti di TMDB.

---

## Casi d'uso dell'AI in YACA

### 1. Cataloghi Dinamici (AI Prompts)
Gli utenti possono salvare dei "Cataloghi AI" che vengono aggiornati dinamicamente. Ogni volta che il catalogo viene consultato, il sistema può decidere se rigenerare i risultati.

### 2. Suggerimenti di Titoli (Merged Name)
L'AI viene utilizzata anche per generare nomi creativi per i cataloghi uniti (Merge), analizzando il tema comune dei cataloghi sorgente.

---

## Ottimizzazione e Costi

- **AI Cache (`src/models/AICache.js`)**: Per evitare di interrogare Mistral per gli stessi prompt, i risultati della traduzione Prompt -> Filtri vengono salvati nel database.
- **Persistence**: Se un prompt è considerato "stabile", la sua interpretazione è resa permanente, riducendo drasticamente il consumo di token API.
