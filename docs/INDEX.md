# YACA Documentation Index

Benvenuto nella documentazione ufficiale di **YACA (Yet Another Catalog Addon)**. Questo repository documenta l'architettura, la logica e le specifiche tecniche dell'addon.

## Indice della Documentazione

1.  **[Architettura di Sistema](SYSTEM_ARCHITECTURE.md)**
    *   Panoramica di alto livello, flusso dei dati e concetti core (Taste Profile, DNA).
2.  **[Backend](BACKEND.md)**: Logica del server, gestione handler e motori.
3.  **[Algoritmi](ALGORITHMS.md)**: Dettagli matematici su scoring, decay e Bayesian rating.
4.  **[Logica Cataloghi](CATALOG_LOGIC.md)**: Lifecycle delle richieste, Merging e Interleaving.
5.  **[Integrazioni](INTEGRATIONS.md)**: Sync Stremio/Trakt, ImageKit, MDBList e Failover.
6.  **[Frontend & UI](FRONTEND.md)**: Architettura Next.js e logica della Dashboard.
    *   Struttura dell'interfaccia di configurazione (Next.js/Vite).
7.  **[Riferimento API](API_REFERENCE.md)**
    *   Endpoint REST, manifest Stremio e interazioni con API esterne (TMDB, Trakt, Kitsu).
8.  **[Dati & Modelle](DATA_RECORDS.md)**
    *   Schemi MongoDB e gestione della cache Redis.
8.  **[Motore AI](AI_ENGINE.md)**
    *   Integrazione con Mistral AI per la generazione dinamica di cataloghi.
9.  **[Deployment & Ops](DEPLOYMENT_OPS.md)**
    *   Configurazione Docker (multi-stage), Render (ottimizzazioni) e CI/CD.

## Risorse Correlate
*   [ARCHITECTURE.md](ARCHITECTURE.md) - Documento originale (sintetico).
*   [IMAGEKIT_BADGES.md](IMAGEKIT_BADGES.md) - Specifica tecnica per la gestione dei badge sulle immagini.

---

*YACA è un progetto progettato per offrire un'esperienza di scoperta contenuti ultra-personalizzata su Stremio.*
