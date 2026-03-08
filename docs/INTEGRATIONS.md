# 🔌 Integrazioni e Specialità Tecniche

Questo documento descrive le implementazioni tecniche specifiche per la sincronizzazione dei dati e le trasformazioni visive "sul volo".

## 1. Two-Way Sync (Stremio ↔ Trakt)

YACA non si limita a leggere i dati, ma chiude il cerchio della sincronizzazione tra le piattaforme.

### Flusso di Sincronizzazione (Stremio → Trakt)
Quando un utente interagisce con l'ecosistema Stremio, YACA propaga l'azione su Trakt:
- **Loved (Cuore)**: Inviato a Trakt come Rating **10/10**.
- **Liked (Pollice su)**: Inviato a Trakt come Rating **8/10**.
- **Library (Libreria)**: Aggiunta alla history di Trakt se il progresso di visione è $> 90\%$.

### Algoritmo di Throttling e Randomizzazione
Per evitare di essere bannati dalle API di Trakt o TMDB per eccesso di traffico durante i sync di massa:
1.  **Random Offset**: L'intervallo di sync base (8 ore) viene variato di $\pm 120$ minuti ogni volta.
2.  **Batch Processing**: Le richieste vengono processate in piccoli batch (es. 5 alla volta) con delay tra i cicli.

---

## 2. ImageKit "Master Hack" (Badges Dinamici)

Il sistema di Badge (es. "Ep 12") non usa librerie locali di manipolazione immagine (che consumerebbero troppa RAM su Render). Utilizza invece le trasformazioni URL di **ImageKit**.

### La Trasformazione "Asimmetrica"
Per ottenere l'effetto "Arrotondato a sinistra, Squadrato a destra", YACA usa un trucco di clipping:

```js
const transformations = `tr:w-500,l-text,ie-${b64},fs-45,co-FFFFFF,bg-00000080,pa-15_350_15_35,r-50,lx-160,ly-0,l-end`;
```

1.  **`tr:w-500`**: Forza la larghezza a 500px.
2.  **`r-50`**: Crea una "pillola" (bordi arrotondati ovunque).
3.  **`pa-15_350_15_35`**: Aggiunge un padding enorme (350px) sul lato destro.
4.  **Effetto**: Il padding spinge la parte arrotondata destra "fuori dal canvas" da 500px, lasciando visibile solo la parte squadrata al margine dell'immagine.

---

## 3. Failover Mirror System (TMDB)

Dato che TMDB è il punto critico di fallimento (SPOF), il client `src/clients/tmdb.js` implementa un sistema di switch automatico tra specchi (mirrors):

- **Mirrors predefiniti**:
  - `api.themoviedb.org` (Principale)
  - `tmdb.org` (Secondario)
  - Proxy personalizzati (opzionali)

Se una richiesta fallisce con errore 5xx o timeout, l'intercettore Axios ruota l'indice del mirror e riprova immediatamente la stessa richiesta sulla nuova base URL senza che l'utente se ne accorga.

---

## 4. Multi-Layer Caching Strategy

La velocità di YACA deriva da tre livelli di cache coordinati:

1.  **L1: RAM (LRU)**: Per metadati istantanei (es. nomi di generi).
2.  **L2: Redis**: Per cataloghi calcolati che devono persistere tra i riavvii ma scadere velocemente (Tiered TTL).
3.  **L3: MongoDB (Persistent)**: Per l'AI Cache e i dati granulari dei singoli film/serie (permette il filtraggio offline).

### SWR (Stale-While-Revalidate)
Quando un catalogo viene richiesto ed è presente in cache ma "vecchio" (stale), YACA:
1.  Restituisce istantaneamente la versione in cache (Velocità ⚡).
2.  Lancia un task in background per aggiornare la cache da TMDB.
3.  L'utente successivo vedrà i dati aggiornati.
