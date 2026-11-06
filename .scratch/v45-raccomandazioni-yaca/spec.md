# Spec: raccomandazioni YACA oltre le bolle

## Intent

Sostituire l'intero percorso di raccomandazione basato sulle bolle con V45 e retrieval sparse, per tutte le superfici YACA (pool/cataloghi Stremio e API web). Le bolle globali non fanno parte dell'architettura finale.

La proposta deve raggruppare i segnali positivi di ogni profilo in cluster d'interesse personali e produrre suggerimenti per ciascun cluster; deve calcolare anche una vista separata della cronologia recente, più pesante della storia vecchia. Le liste aggiunte sono un segnale ausiliario: top 5 per lista e peso basso in cold start, contributo epsilon quando esistono segnali personali reali.

## Vincoli già stabiliti

- V45 è la base congelata: `services/graph/recipes/V45.lock.json` e `services/graph/V45.md`.
- Like, love e watchlist/library hanno priorità; i segnali restano distinguibili per provenienza. La cronologia watched partecipa ai cluster, con peso relativo da decidere.
- Il grafo mantiene i ponti film-serie; il filtro di formato è applicato al retrieval finale.
- Build offline dai dati cached; niente download di corpora o training dello studente dentro il servizio.
- Le raccomandazioni devono avere ragioni varie e tracciabili: temi/tono, genere, co-visione, gusto, liste e metadati, non solo autore.

## Ambito

Decisioni su modello dei cluster personali, segnali e cold start, scaffali e spiegazioni, ownership dei moduli, runtime sparse e transizione dal servizio bubble. Il dettaglio delle decisioni vive nei ticket collegati dalla mappa.

## Fuori dalla prima fase

Ritarare o sostituire la ricetta V45, aggiungere nuovi tipi di arco, riaddestrare lo studente o rifare i downloader. La ricetta resta congelata salvo una decisione esplicita che dimostri un blocco.
