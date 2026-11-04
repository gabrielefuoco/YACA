Status: ready-for-agent
Type: task
Blocked by: 13

# LISTSEM: i nomi delle liste Trakt come segnale di tono (l'unica fonte nuova)

## Perché

Oggi usiamo *quali film stanno nella stessa lista*, mai *come si chiama la lista*. I nomi sono giudizi
tonali scritti da persone: «weird female rage», «existential artificial worlds», «neon noir»,
«comfort movies». È l'unica sorgente che **aggiunge informazione** invece di ri-pesare quella che
abbiamo — e l'unica che può alzare il tetto di copertura (oggi 26-30%).

## Cosa fare

1. De-aggregare le liste **per singola lista** (non per film): leggere `name` e `description` da
   `.cache/trakt/lists/`, escludere gli autori holdout del ticket 13.
2. Filtrare le liste generiche con una regex/criterio esplicito: `watchlist`, `seen`, `2023`, `film`,
   `movies`, `da vedere`, `ranked`, `top 10`, calendari, supporti fisici, franchise.
3. Embeddare i nomi (stesso Qwen3-Embedding delle trame) e dare a ogni film il **centroide dei nomi
   delle sue liste**, pesato per la specificità della lista (1/log del numero di film) e non per il
   numero di liste.
4. Fondere anche la **tagline** (9.884 film, 10% del canone, tono purissimo: «She's everything. He's just
   Ken.»), con peso dichiarato.
5. Costruire il tipo `LISTSEM` (top-100 per riga) e registrarlo nel manifest.

## Segnale di fallimento (dichiarato prima)

Sul dev set: se la sovrapposizione media di genere dei nuovi vicini supera 0,45, o l'entropia dei
decenni nei top-20 scende sotto 1,2 bit, **sta re-imparando genere ed epoca** — fermarsi e ripulire il
filtro delle liste.

## Criteri di accettazione

- Sul dev set: **copertura@500 +2,5 punti** e R@20 sopra l'MDE bootstrap;
- sui 200 semi popolari la quota >5k **non sale**;
- il tipo entra in V23 e si misura una volta sola sul banco tonale a fine giro.
