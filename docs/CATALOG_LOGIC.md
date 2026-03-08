# 🧬 Logica dei Cataloghi e Lifecycle

Questo documento dettaglia il "viaggio" di una richiesta di catalogo, dalla chiamata di Stremio alla generazione di una lista ultra-personalizzata. 

## 1. Lifecycle di una Richiesta (`catalogHandler.js`)

Quando l'utente scorre una riga in Stremio, l'addon esegue queste fasi:

1.  **Risoluzione Configurazione**: Identifica l'utente e il profilo attivo dal path dell'URL.
2.  **DNA Injection**: Se il profilo ha un "DNA" (es. `Solo Anime`), questo viene iniettato come filtro forzato in ogni query successiva.
3.  **Triple Search (Ricerca Combinata)**:
    - **Simple**: Ricerca testuale su TMDB.
    - **Preset**: Applica filtri predefiniti (es. "Trending").
    - **AI**: Se il catalogo è basato su un prompt, traduce il linguaggio naturale in filtri TMDB.
4.  **Enrichment Progressivo**: Per i primi elementi della lista, YACA scarica metadati profondi (es. certificazioni di rilascio) per filtri granulari.
5.  **Filtro "Visti"**: Se attivo, confronta i risultati con la history Trakt/Stremio e rimuove i titoli già completati.
6.  **Badge Engine**: Se il catalogo lo richiede (es. "Nuovi Episodi"), calcola l'ultimo episodio e genera l'URL ImageKit.

---

## 2. Il Sistema di Merging & Interleaving

YACA permette di unire più fonti di dati in una singola riga di Stremio, una funzione rara negli addon standard.

### Unione (Merge)
Combina i filtri di due o più cataloghi (es. "Azione" + "Anni 80").
- **AI Naming**: Quando crei un merge, YACA usa **Mistral** per suggerire un nome creativo. Se unisci "Cyberpunk" e "Noir", l'AI potrebbe suggerire *"Neon Shadow Tales"*.

### Intersezione (Interleave)
Invece di unire i filtri, YACA scarica i risultati da due liste diverse e li alterna (A1, B1, A2, B2...).
- **Bilanciamento**: Questo garantisce che una lista non "affoghi" l'altra, ideale per combinare "I tuoi preferiti" con "Suggerimenti AI".

---

## 3. Strategie di Ricerca Avanzate

YACA non fa solo `discover`. Supporta tre strategie core determinate dall'AI:

-   **`discovery`**: Ricerca basata su attributi (Generi, Anno, Keywords).
-   **`similar`**: Trova contenuti simili a uno o più titoli specifici usando l'algoritmo di raccomandazione di TMDB.
-   **`multi_search`**: Ricerca testuale pura arricchita dai filtri del profilo utente.

---

## 4. Ottimizzazione "Fast-Track"

Per i preset più popolari (es. "Popolari oggi"), YACA utilizza una **Fast-Track Cache**:
- Evita il ricalcolo del DNA e dei filtri profilo.
- Serve i risultati in < 50ms.
- Aggiorna i dati in background (SWR) per l'utente successivo.
