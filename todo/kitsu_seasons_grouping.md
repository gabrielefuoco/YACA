# Accorpamento Stagioni Anime (Kitsu)

Questo documento riassume il problema degli elementi duplicati nei cataloghi Anime e le possibili strategie di risoluzione analizzate.

## Il Problema
Quando si utilizzano i cataloghi forniti da Kitsu (es. *Battle Shōnen*, *Dark & Psicologico*), le diverse stagioni di uno stesso anime vengono restituite come entità separate con ID differenti (es. *Haikyu!!*, *Haikyu!! Second Season*). 

Poiché la funzione `enrichWithTmdb` arricchisce queste entità traducendo il titolo e recuperando i poster da TMDB (che invece unifica tutte le stagioni sotto lo stesso ID serie), tutti i titoli delle varie stagioni venivano sovrascritti con il titolo principale italiano (es. *Haikyu!! L'asso del volley*), creando molteplici schede visivamente identiche e confondendo l'utente.

> [!NOTE]
> Temporaneamente, abbiamo tamponato il problema appendendo il suffisso `- Stagione X` a tutti i titoli arricchiti con `inferredSeason > 1` per rendere le schede distinguibili, ed applicato una de-duplicazione per ID esatti in `catalogHandler.js`.

---

## Limitazioni delle API di Kitsu
Non è possibile richiedere a Kitsu di restituire solo la prima stagione direttamente tramite parametri di query dell'API. 
* Kitsu tratta ogni stagione come un oggetto `Anime` indipendente.
* Non esistono filtri nativi come `parent_id` o `is_first_season`. Le relazioni di sequel/prequel sono esposte solo come link relazionali (`mediaRelationships`) e non come filtri di ricerca principali.

---

## Strategie di Risoluzione Future

### Strategia A: Conversione in ID TMDB (Nativa)
Consiste nel convertire gli elementi del catalogo Kitsu in ID TMDB prima di inviarli a Stremio.
* **Pro:** Risoluzione pulita. Stremio mostra un'unica scheda con il selettore nativo delle stagioni (Stagione 1, 2, 3...).
* **Contro:** Si perde la numerazione assoluta degli episodi per gli anime lunghi non stagionali (es. *One Piece* o *Naruto*), che verrebbero forzatamente divisi nelle stagioni ufficiali di TMDB.

### Strategia B: Accorpamento logico su ID Kitsu Primario (Server-Side)
Consiste nel mantenere gli ID Kitsu ma nascondere le stagioni successive dal catalogo, unendo i relativi episodi sotto la scheda della prima stagione.
* **Pro:** Preserva la numerazione assoluta per gli anime non stagionali (es. *One Piece* rimane una sola stagione da 1000+ episodi) e raggruppa correttamente quelli stagionali.
* **Contro (Offset Drift):** Filtrando le stagioni successive post-fetch, la pagina del catalogo si accorcia (es. da 20 elementi a 15). Per mantenere sempre 20 elementi, il server deve effettuare *over-fetching* e gestire una tabella di mappatura dinamica degli offset per evitare salti o duplicazioni durante lo scorrimento (paginazione).
