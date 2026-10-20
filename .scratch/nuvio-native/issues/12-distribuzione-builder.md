Status: resolved
Type: research
Punto: P11, P26, P29
Blocked by: —

# 12 — Distribuzione: community collections, builder, marketplace

## Domanda

Dove si distribuisce un pack YACA e a quali condizioni? Servono: regole delle community collections
Nuvio, requisiti di submission, differenza tra pack 0-addon e pack con addon, possibilità di essere
“provider” dentro Kaptain/Xperience/Ultra MAX, e cosa si può fare senza violare regole o aspettative.

## Cosa deve uscire

Una nota in `ricerche/12-distribuzione-builder.md` con:

- **canali**:
  1. Nuvio community collections (ufficiale);
  2. r/Nuvio e r/nuvioaddons (community, regole diverse);
  3. Kaptain addon marketplace / setup wizard;
  4. Xperience “import catalogs”;
  5. Ultra MAX;
  6. AIOMetadata config export;
  7. sito YACA / GitHub / QR.
  Per ognuno: requisiti, approval, sforzo, ritorno, rischio.
- **pack types**: “YACA Lite” 0-addon vs “YACA Smart” con addon; cosa mostrare, come descrivere,
  quale cover, quale call to action.
- **regole**: titolo/descrizione/cover, no duplicati, no loghi streaming, no self-promo, no contenuti
  illeciti; cosa dice la community.
- **essere provider**: cosa serve perché Kaptain/Xperience possano includere una row YACA (manifest
  URL stabile, catalog ID, nome, tipo, extra, artwork, addon id); rischi di dipendere da loro.
- **misurazione**: install, attivazione, click, retention; quali metriche sono ottenibili e quali no.
- **go/no-go** per canale, con motivazione.

## Fonti primarie

- Nuvio community collections + regole Reddit (`Community Collection Sharing: Rules & Best Practices`).
- Kaptain: sito, addon marketplace, `addon-core.js` (install/validate), collection pubblica.
- Xperience: “import catalogs from other add-ons”, “merged rows”, update notes.
- Ultra MAX: setup, poster provider, account tools.
- AIOMetadata: config import/export.
- Nuvio wiki: collections/addons.

## Come si chiude

La nota è pronta quando:

1. la matrice canali è completa con requisiti e rischi;
2. i due pack (Lite/Smart) hanno una proposta chiara;
3. le regole di community sono citate, non parafrasate a memoria;
4. il contratto “provider per builder” è definito;
5. c’è un go/no-go per partire.

---

## Esito

**Risolto il 20/10/2026** — nota completa in
[`ricerche/12-distribuzione-builder.md`](../ricerche/12-distribuzione-builder.md).

- **Unico canale first-party**: Nuvio community collections. Partire con **YACA Lite** (0 addon,
  one-click, nessun manifest pubblico) e cover 16:7 originale, senza loghi di servizi.
- **YACA Smart è condizionale**: senza un manifest pubblico a catalogs fisse il pack rischia
  `catalog_missing` su gran parte dei profili. Va dopo Lite e dopo il manifest pubblico stabile.
- **Kaptain marketplace non è una submission**: è il feed Stremio; si può documentare l’install da URL,
  non aspettarsi visibilità. **Xperience** è import privato, **Ultra MAX** è chiuso, **AIOMetadata** è un
  artefatto di supporto.
- **Reddit**: un post in r/Nuvio è GO (niente loghi, scraper, duplicati); r/nuvioaddons è NO-GO per il
  lancio.
- **Sito/GitHub/QR** è l’unico canale posseduto e misurabile; la pagina community è `noindex`, senza API
  e con solo install/like.
- **Regola d’oro**: nessun pack senza test su un profilo Nuvio pulito, con il manifest installato e le
  catalogs richieste presenti.

