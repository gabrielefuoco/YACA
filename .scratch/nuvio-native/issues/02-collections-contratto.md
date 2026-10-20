Status: open
Type: research
Punto: P03, P05, P24
Blocked by: —

# 02 — Collections: schema, source native/addon, full-replace

## Domanda

Qual è il contratto **reale** di una collection Nuvio — non solo quello della docs — e come si aggiorna
senza distruggere le modifiche dell’utente? Servono: campi esatti di collection, folder e source; unione
tra source native (TMDB/Trakt) e source addon; supporto di source miste nella stessa folder; campi
artwork; `viewMode`/`tileShape`; cosa è obbligatorio e cosa ha default; come vengono risolti gli ID.

## Cosa deve uscire

Una nota in `ricerche/02-collections-contratto.md` con:

- **schema completo** in tabella: `Collection`, `CollectionFolder`, `TmdbCollectionSource`,
  `TraktCollectionSource`, `AddonCatalogCollectionSource`, con tipi, default e serializzazione JSON.
- **source union**: `sources` (nuovo) vs `catalogSources` (legacy); cosa fa il parser se ci sono entrambi;
  se una folder può mescolare native e addon; come viene risolto `addonId` (manifest id, non URL).
- **native TMDB/Trakt**: valori esatti di `tmdbSourceType` (`LIST`, `COLLECTION`, `COMPANY`, `NETWORK`,
  `DISCOVER`, `PERSON`, `DIRECTOR`), `mediaType` (`MOVIE`/`TV`), `sortBy`, `filters`.
- **artwork**: `coverImageUrl`, `focusGifUrl`, `focusGifEnabled`, `heroBackdropUrl`, `heroVideoUrl`,
  `titleLogoUrl`, `coverEmoji`, `hideTitle`, `tileShape`.
- **update semantics**: `sync_push_collections` è full replace; cosa succede a ID stabili, duplicati,
  folder dell’utente, collection di altri addon.
- **un esempio JSON ibrido** (una folder native + una folder addon) che il parser accetterebbe.
- **rischi**: schema non versionato, campi che il client ignora, collection duplicate, ID non stabili.

## Fonti primarie

- Nuvio docs v1.3, sezione Collections.
- NuvioTV: `domain/model/Collection.kt`, `data/local/CollectionsDataStore.kt`,
  `ui/screens/collection/FolderDetailViewModel.kt`.
- Kaptain: `collection-merge.js`, `nuvio-push.js` (`pullCollections`/`pushCollections`).
- Eventuale collection JSON pubblico di Kaptain/Xperience, per confrontare teoria e pratica.

## Come si chiude

La nota è pronta quando:

1. lo schema è ricostruito da docs + codice, con le divergenze annotate;
2. le source miste sono dichiarate supportate o no, con la prova nel parser;
3. la semantica di update è chiara e c’è una strategia di merge raccomandata;
4. l’esempio JSON è stato confrontato con il parser (anche solo mentalmente, riga per riga);
5. ci sono 3–5 conseguenze per il mapping YACA → Nuvio.
