# Logica e Generazione dei Badge Episodi

In Stremio, i cataloghi generati da YACA offrono all'utente un'informazione visiva immediata sul progresso di una serie in corso attraverso i "Badge" posizionati agli angoli dei poster (Top-Right e Top-Left).

## Architettura dei Badge
La generazione dei badge avviene primariamente all'interno di `src/catalog/formatters/StremioFormatter.js`.

YACA applica due tipi principali di badge:
1. **Top-Left (Stagione / Lingua)**: Indica la stagione corrente della serie o la lingua del flusso audio (es. `S4`, `S2 - Pt2`, `ITA - S1`).
2. **Top-Right (Episodio corrente)**: Indica l'ultimo episodio andato in onda per la serie (es. `Ep 12`).

## Calcolo Dinamico dell'Ultimo Episodio Uscito

Il badge `Ep X` non si basa su dati statici o totali assoluti, ma viene calcolato in tempo reale sulla base degli episodi effettivamente rilasciati ("aired").

### Filtro Episodi "Aired"
La funzione esamina l'array `item.videos` e filtra gli episodi validi:
- Vengono **esclusi gli episodi "fantasma"** (ovvero episodi con titolo generico, senza descrizione e senza un vero thumbnail).
- Un episodio viene considerato "uscitò" se la sua `released` date è nel passato (`<= now`).
- Se `released` è `null` (ma l'episodio ha metadati reali validi), viene applicato un fallback che lo considera comunque uscito.

Una volta filtrati, l'algoritmo prende l'episodio con data di uscita più recente o con numero più alto. Da questo estrae `latest.season` e `latest.episode`.

## Differenze tra Serie TV Standard (TMDB) e Anime (Kitsu)

### Serie TV Standard
Per i contenuti TMDB, l'identificativo include la stagione (es. `S 2 Ep 12`). Questo è lineare perché TMDB categorizza univocamente le stagioni (Season 1, Season 2).

### Gestione Kitsu (Anime)
Kitsu presenta sfide particolari perché le stagioni successive sono spesso trattate come opere completamente separate (es. *Attack on Titan Season 2* ha un ID Kitsu separato rispetto alla Season 1). Inoltre, l'API Kitsu restituisce spesso una numerazione episodi che parte da `1` per ogni stagione o cour, ma senza specificare la data di uscita.

Le ottimizzazioni recenti per Kitsu includono:
- **Badge Indipendenti**: Se il contenuto è Kitsu, o la stagione è <= 1, il formato sarà sempre un contatore assoluto della singola opera `Ep X` invece di forzare `S X Ep Y`.
- **Prevenzione Fallback Fantasma**: Poiché gli episodi futuri su Kitsu non hanno spesso la data `airdate`, il mapper sincronizza le date esatte (`match.released`) da TMDB. In questo modo gli episodi che usciranno nel futuro verranno ignorati dal filtro `aired` del Formatter e il conteggio degli episodi mostrerà correttamente l'ultimo episodio effettivamente rilasciato ad oggi (es. "Ascendance of a Bookworm S4" mostrerà "Ep 12" al posto di tutti i 24 episodi futuri messi a catalogo).

## Offset Badge per flussi Doppiati (ITA)
Nel caso di simulcast in italiano o flussi doppiati, `catalogHandler.js` può clonare un elemento del catalogo per evidenziare la versione italiana. Durante questa fase, le proprietà `_forceSeason` e `_forceEpisode` vengono iniettate in base al badge Torrentio trovato. Se `StremioFormatter.js` trova questi flag, utilizzerà i valori forzati al posto del calcolo dinamico sui video.
