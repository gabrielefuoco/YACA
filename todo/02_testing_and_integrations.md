# 02 - Testing e Integrazioni

La robustezza di YACA dipende fortemente da come comunica con ecosistemi esterni come Trakt e Stremio.

## 1. Integrazione Trakt
**Descrizione:** Trakt è fondamentale per il tracciamento degli episodi e la scoperta di nuovi contenuti.
**Azioni Dettagliate:**
- Verificare il flusso OAuth di login e il corretto rinnovo (refresh) dei token.
- Gestire proattivamente i limiti di rateo (Rate Limits) delle API di Trakt per evitare blocchi dell'account o dell'app.

## 2. Stremio Liked / Loved
**Descrizione:** Supportare nativamente i feedback degli utenti provenienti direttamente dai client di Stremio.
**Azioni Dettagliate:**
- Testare come YACA (in quanto addon) recepisce le azioni degli utenti sulle board.
- Verificare che le aggiunte/rimozioni alla libreria "Loved" vengano propagate correttamente al nostro database interno.

## 3. Sincronizzazione Liked/Loved <-> Trakt
**Descrizione:** Sincronizzazione bidirezionale tra il mondo Stremio e il profilo Trakt dell'utente.
**Azioni Dettagliate:**
- Se un utente mette un like su Stremio, questo deve finire nella Watchlist o nei preferiti di Trakt.
- Se aggiorna Trakt dal telefono, YACA deve recepirlo e aggiornare il catalogo fornito a Stremio.

## 4. Lettura e Scrittura sulla Libreria Utente
**Descrizione:** Interazione profonda con il Datastore di Stremio.
**Azioni Dettagliate:**
- **Lettura:** Fare il parsing corretto degli elementi salvati in libreria, mappando gli ID proprietari o generici (IMDB/TMDB) a quelli gestiti da YACA.
- **Scrittura (Critico):** Assicurarsi che ogni operazione di scrittura (sync) sulla libreria ufficiale dell'utente non provochi perdita di dati, sovrascritture accidentali o duplicati. È raccomandato testare questa feature in ambienti isolati (account di test).
