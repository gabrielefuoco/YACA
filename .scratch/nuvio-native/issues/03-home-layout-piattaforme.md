Status: open
Type: research
Punto: P06, P12
Blocked by: —

# 03 — Home layout e matrice piattaforme

## Domanda

Come rappresenta Nuvio la home screen — row, ordine, visibilità, collection — e quanto cambia tra TV,
mobile e desktop? Il blob `home_catalog_settings` è documentato solo come “application-defined JSON”:
serve capire la forma reale, i campi unknown, i default, il fallback quando il blob non esiste e cosa
succede se una versione dell’app lo interpreta diversamente.

## Cosa deve uscire

Una nota in `ricerche/03-home-layout-piattaforme.md` con:

- **forma osservata** di `settings_json`: `rows`/`items`, `hidden_catalogs`, `hide_unreleased_content`,
  `key`, `addon_id`, `type`, `catalog_id`, `enabled`, `order`, `custom_title`, `is_collection`,
  `collection_id`.
- **piattaforme**: quali namespace usa Nuvio (`tv`, `mobile`, `desktop`, `home_catalog_shared`?), quali
  sono condivisi e quali separati; cosa fa il client se il blob manca.
- **collection vs catalog row**: come una collection compare nella home, come si nasconde una row
  “sciolta”, come si evita il duplicate.
- **merge**: cosa preservare di un blob esistente, come non perdere campi di versioni future, come
  gestire un rollback.
- **matrice TV/mobile/desktop**: import collections, poster URL, home settings, limiti noti.
- **rischi**: schema non documentato, version drift, full replace, differenze di build.

## Fonti primarie

- Nuvio docs v1.3, sezione Home catalog settings.
- NuvioTV: `HomeCatalogSettingsSyncService`, `HomeCatalogSyncSupport`, `HomeViewModelCatalogPipeline`,
  `CatalogOrderScreen`, `CatalogDescriptorExtensions`.
- Kaptain: `nuvio-push.js` (`pullHomeCatalogs`, `pushHomeCatalogs`, `syncHomeRowsForCollections`,
  `HOME_CATALOG_PLATFORM`).
- Nuvio wiki: UI/customization e collections, per il comportamento visibile.

## Come si chiude

La nota è pronta quando:

1. la forma del blob è documentata con esempi reali (anche ricostruiti da codice);
2. la matrice piattaforme dice cosa è condiviso e cosa no;
3. il fallback “blob assente” è chiaro;
4. c’è una strategia di merge che preserva i campi unknown;
5. ci sono 3–5 conseguenze per YACA (quali row mettere, quali nascondere, quali non toccare).
