# Riconciliazione Automatica Manifest Stremio all'Avvio

## File Toccati / Creati
- `src/utils/manifestFingerprint.js`: esporta `buildManifestDefinitionsSignature()`, `DEFAULT_HERO_CATALOGS`, `setHeroCatalogs` e include la firma delle definizioni di build (cataloghi hero e definizioni preset da `presets.js`) in `FINGERPRINT_SCHEMA_VERSION`.
- `src/db/models/AddonConfig.js`: aggiunto `pendingStremioResync: { type: Boolean, default: false }` al subdocument `config`.
- `src/utils/manifestReconciler.js`: nuovo modulo che esporta `reconcileManifests()`, elabora in sequenza gli `AddonConfig`, aggiorna versioni/fingerprint e invoca `updateStremioAddonCollection`. Non fatale e mai bloccante.
- `index.js`: avvio della riconciliazione dopo lo start del server, disattivabile tramite `DISABLE_MANIFEST_RECONCILE=1`.
- `tests/manifestReconciler.test.js`: test suite dedicata per tutti i casi previsti (a, b, c, d, e).

## Forma dei Dati
- `AddonConfig.config`:
  - `configVersion`: String (nanoid a 8 caratteri)
  - `manifestFingerprint`: String (SHA-256 esadecimale a 64 caratteri basato su config utente + firma definizioni manifest)
  - `pendingStremioResync`: Boolean (indica se la versione installata su Stremio necessita di resync)
- Stremio Addon URL: `${HOST_URL}/${userId}/${configVersion}/manifest.json`

## Meccanismo del Flag `pendingStremioResync`
- Viene impostato a `true` ogni volta che l'impronta cambia o `configVersion` manca.
- Se `updateStremioAddonCollection` ha successo, il flag viene azzerato (`false`).
- Se la chiamata fallisce (o va in timeout/eccezione), il flag viene mantenuto a `true`: al riavvio successivo viene ritentato il resync verso Stremio anche se la configurazione locale non è cambiata.
