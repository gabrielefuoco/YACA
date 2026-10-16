Status: ready-for-agent
Type: bug

# Le righe del grafo perdono le serie fra il pool e la risposta

**Senza soluzione, per scelta: qui c'e' solo il problema, con le prove raccolte.** La causa non e' stata
trovata, e le ipotesi fatte finora sono state tutte smentite dai fatti (elencate sotto, per non rifarle).

## Il sintomo, dal prodotto

Le due righe `yaca_mondi_series` e `yaca_passo_fuori_series` mostrano **3 titoli e 1 titolo** nel client.
Le righe dei film, con lo stesso codice e lo stesso percorso, ne mostrano **20** (e 60+ oltre la prima
pagina). L'utente lo riporta come «il tuo mondo serie ha 3 elementi, un passo fuori serie ha un elemento».

## Cosa e' stato VERIFICATO (eseguendo, non leggendo)

Il codice deployato sul mate, eseguito **dentro il container**:

    docker exec yaca-app node -e "…righePerStremio(storia, {mediaType:'series'})…"
    -> yaca_mondi_series   60 titoli · forma: tmdb:655
    -> yaca_passo_fuori_series 14 titoli · forma: tmdb:1972

Quindi **il motore consegna 60 titoli, con id ben formati**. E la risposta della stessa istanza:

    curl .../catalog/series/yaca_mondi_series.json   -> 3 titoli
    i tre sopravvissuti sono serie VERE e risolte, con `type: "series"` in uscita
    (Scrubs, Scrubs - Medici ai primi ferri, The Boy Next World)

**La perdita e' 60 -> 3, e avviene fra il pool e la risposta finale.**

## Cosa e' stato ESCLUSO, coi fatti

1. **la cache**: la chiave e' `v10`, il gruppo si ricostruisce a ogni bump, e l'esecuzione in-container
   dimostra che il pool e' pieno;
2. **il formato degli id**: `yaca_true_blend_series` — che FUNZIONA — usa la stessa forma (`tmdb:69478`,
   `tmdb:224372`, `tmdb:80752`);
3. **la risoluzione del meta**: `/meta/series/tmdb:655.json` risponde **200 · "Star Trek: The Next
   Generation"** (col token di configurazione);
4. **il filtro per tipo** in `catalogHandler.js` (~riga 673, `expectedType === 'tv'` che scartava
   `media_type === 'series'`): e' stato corretto il 17/10 e **la risposta non e' cambiata**. La correzione
   resta giusta — era una vera incoerenza — ma non e' questa la perdita;
5. **una deduplica fra i cataloghi dello stesso profilo**: cercata in `resultMerger.js` e nel percorso dei
   cataloghi, **non trovata**.

## L'unica differenza MISURATA che resta

Gli hero che funzionano consegnano item come **oggetti**:

    ids: animeItems.map(item => ({ ...item, traktAvailable, traktSourceCount, …, isDegradedFallback }))

Le righe del grafo consegnano **stringhe**: `'tmdb:655'`. Il passo che assegna i pool le accetta entrambe
(`getRecommendationId` gestisce oggetto e scalare), ma **non e' verificato** che il passo che le trasforma
in card accetti la forma scalare. Questa e' un'OSSERVAZIONE, non una diagnosi: la sonda tentata per
confermarla e' fallita per argomenti sbagliati di chi scrive.

## Come riprodurre

    ssh mate
    docker exec yaca-app node -e "…l'adattatore, come sopra…"          # 60 titoli
    curl -s http://127.0.0.1:7860/<config-id>/catalog/series/yaca_mondi_series.json | head -c 400
    curl -s http://127.0.0.1:7860/<config-id>/catalog/series/yaca_true_blend_series.json | head -c 400

`<config-id>` si legge dai log: `docker logs yaca-app | grep -o "userId=[A-Za-z0-9]*" | head -1`.

## Il metodo che ha funzionato, per chi riprende

**Eseguire il codice deployato dentro il container**, non leggere e ipotizzare: e' cosi' che sono state
trovate le uniche prove utili di questa giornata. Nove modifiche sono state fatte a naso su questo
percorso, e **nessuna** ha spostato il numero: il pool era corretto fin dall'inizio.

E il promemoria che vale sempre: **la CHIAVE di cache va alzata** ogni volta che cambia cosa entra in una
struttura memorizzata (dieci volte il 17/10, dieci volte era la differenza fra un fix che funziona e uno
che non produce effetto).
