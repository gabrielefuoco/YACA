# 📊 Struttura Dati e Record

YACA utilizza MongoDB come database principale per la persistenza a lungo termine e Redis per il caching ad alte prestazioni. 

## 1. Modello Utente (`User.js`)

Il documento `User` è l'ancora di tutte le configurazioni.

```javascript
{
  userId: String,           // ID corto univoco (nanoid)
  email: String,            // Email Stremio (per riconciliazione)
  apiKeys: {
    tmdb: String,
    trakt: String,          // Access Token
    traktRefreshToken: String,
    mistral: String,
    stremio: String         // Stremio AuthKey
  },
  config: {
    activeProfileId: String,
    lastStremioSync: Date,  // Ultimo sync riuscito (Likes/Loves)
    nextSyncInterval: Number // Intervallo dinamico (± 120min)
  },
  profiles: [{
    id: String,             // ID interno profilo
    name: String,           // Nome (es. "Anime", "Serata Cinema")
    settings: {
        minVoteAverage: Number,
        minVoteCount: Number,
        manualDNA: Array,    // Filtri forzati dall'utente
        suggestedDNA: Array  // Filtri inferiti dal motore
    },
    catalogs: Array         // Mix di preset e liste AI personalizzate
  }]
}
```

---

## 2. Taste Profile (`TasteProfile.js`)

Contiene la "memoria dei gusti" dell'utente, aggregata da tutte le fonti.

- **`owner`**: Riferimento al `userId`.
- **`context`**: Default `global`. Può essere specifico per un profilo.
- **`Scores` (Maps)**: Mappe di ID -> Rating per:
    - `genreScores`, `keywordScores`, `actorScores`, `directorScores`, `studioScores`.
- **`processedIds`**: Liste di ID Trakt/Stremio già analizzati per evitare ricalcoli inutili alla visione successiva.

---

## 3. Caching & Volatile Data

### Redis (L2 Cache)
- **`tmdb-addon|meta:*`**: Metadati TMDB arricchiti (TTL 24h).
- **`tmdb-addon|catalog:*`**: Risultati dei cataloghi generati (TTL variabile).
- **`tmdb-addon|release:*`**: Date di rilascio region-specific (TTL 6h).

### AI Cache (`AICache.js`)
Memorizza le traduzioni dei prompt in filtri TMDB. Se due utenti chiedono "Film cyberpunk anni 80", il secondo riceve la risposta istantaneamente senza invocare Mistral.

### Recommendation Cache
Memorizza i risultati pesati del `ProfileScorer` per accelerare il caricamento dei cataloghi personalizzati durante la navigazione veloce.
