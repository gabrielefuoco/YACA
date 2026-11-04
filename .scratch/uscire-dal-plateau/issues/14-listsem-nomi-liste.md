Status: resolved
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

---

## Esito: costruito, misurato, e la premessa non regge sui nostri dati

`listsem.py`: 1.117 liste utili (autori holdout esclusi, nome non generico), embedding Qwen3 di
nome+descrizione, centroide per film pesato `1/log(1+n)`. **3.478.300 archi · 45,5% del canone ha un
vettore di liste.**

Segnale di fallimento dichiarato nel ticket — *«se la sovrapposizione di genere dei nuovi vicini sale, sta
re-imparando il genere»* — non è quello che è successo. È successo dell'altro:

| natura delle 1.117 liste | quota |
|---|---:|
| premi, festival, classifiche, "top rated" | 13% |
| **nome di tono** («Best Mindfucks», «Tearjerkers», «Euro-Nordic Noir») | **2%** |
| altro | 84% |

La riga di *Barbie* in LISTSEM grezzo: *Maestro · American Fiction · La società della neve · May December
· Rustin · La zona d'interesse* — **i candidati agli Oscar 2023-24**. Il corpus di liste che abbiamo è un
corpus di premi, non di tono.

Nel grafo (V24, peso 0,7): `R@20 0,038` contro `0,043` (−0,0043, **sotto l'MDE**), R@5 e MRR migliori,
quota >5k peggiore (70,2% contro 66,5%). **Netto: neutro, con deriva verso il prestigio.**

Cosa servirebbe perché l'idea funzioni: **scaricare liste con nomi non generici** — non le "popular",
che sono classifiche. Il fetch esiste (`complete-trakt-lists.js`) ma è una fonte nuova, e va deciso.
