Status: ready-for-agent
Type: grilling

# 21 — Il modulo profilo: chi possiede il contesto

## Perché

«Quale profilo è attivo» è risolto **in quattro posti diversi** — e ognuno se lo ricostruisce:

```js
api/catalog.js:58-63      const activeProfileId = reqProfileId || fullUserConfig.activeProfileId || 'global';
                          … fullUserConfig.activeProfileId = activeProfileId   // «così il handler lo usa»
api/configurazione.js:56  const activeProfileId = req.body.profileId || user.activeProfileId || 'global';
api/configure/index.js:30 const { activeProfileId, profiles: bodyProfiles, customCatalogs } = req.body;
api/auth/index.js:152,199 activeProfileId: addonConfig?.config?.activeProfileId || 'global',
```

E le **impostazioni del profilo** (selettori di tipo, `kidsMode`, policy anime) sono risolte da
`resolveTypeSelectors`, che vive in `src/engines/hybrid/catalogStrategies.js` — cioè **dentro il pezzo che
questa mappa ha deciso di ritirare**. Intanto il profilo ha già due pezzi estratti bene, uno per volta:
`src/library/context.js` (il resolver a tre chiavi) e `src/engines/profileStaleness.js` (col commento
*«era calcolata dentro `getHybridCatalog`… qui è isolata in una funzione pura»*).

## Deciso in grilling (17/10/2026)

**Cosa possiede il modulo** — il profilo è il **contesto** con cui tutto è indicizzato (`WatchHistory` e
`TasteProfile` per `{owner, context}`, le chiavi di cache, la porta della libreria):

- l'**anagrafica**: creare, rinominare, duplicare, eliminare, e **quale è attivo** (una funzione sola);
- la **lista** dei profili di un utente **e** il singolo profilo — sono lo stesso aggregato: separarli
  creerebbe due proprietari dello stesso `profiles[]`;
- le **impostazioni del profilo**: i selettori di tipo (`solo film / solo serie / solo anime / no anime`),
  `kidsMode`, la policy anime, e **gli slider Ocean** (le preferenze del motore: chiude il fog della mappa
  `suggerimenti`, *«gli slider nel profilo: dove si salva il valore, chi decide il default»*);
- la **definizione dei suoi cataloghi** (v. ticket 22/23: il profilo li *tiene*, il modulo cataloghi ne
  possiede il *tipo*);
- le **deduzioni**: `TasteProfile` e la staleness — decisione 11: *la libreria fornisce fatti, il profilo
  deduce*.

**Cosa NON possiede**: le **chiavi API**, l'account, l'`addonUuid` e la ui state — vanno in un **modulo
configurazione utente** a parte (oggi non ci sono chiavi per-utente; domani, con un BYOK Mistral, è lì che
stanno). Regola di proprietà, se il documento Mongo resta uno: **il modulo profilo è l'unico che tocca
`profiles[]`; il modulo configurazione non lo tocca mai** — e si difende con un test-guardia.

**La porta e i selettori** (deciso lo stesso giorno): `profiloDi({userId, profileId})` torna il profilo
**grezzo** (anagrafica, impostazioni, catalogs), e i **selettori effettivi** li risolve una **funzione pura del
modulo**: `selettoriEffettivi(profilo, richiesta)`. Il motivo per cui non possono stare *dentro* la porta: la
risoluzione **dipende dalla richiesta** (Stremio può chiedere un tipo diverso da quello del profilo), quindi un
profilo «già risolto» sarebbe il profilo *per quella richiesta* — un'altra cosa. Il modulo possiede **la regola**,
i consumatori la applicano con la loro richiesta. **Il precedente è nella repo**: `profileStaleness.js`, che porta
scritto *«era calcolata dentro `getHybridCatalog`… qui è isolata in una funzione pura»*. E la regola oggi vive in
`resolveTypeSelectors`, dentro `catalogStrategies.js` — cioè nel pezzo che questa mappa ritira.

**Chi li risolve, e dove si applica la regola** (deciso lo stesso giorno): i selettori si risolvono **una volta
sola, al bordo della richiesta**, e viaggiano nel **contesto** che scende — il pool, il `catalogHandler` e la
**chiave di cache** ricevono lo stesso valore. Il motivo è un guasto misurato: oggi la chiave si risolve per conto
suo (`pool/index.js:64`, `animeSuffix`) e il contenuto pure, quindi **possono divergere in silenzio** — è la
classe del `_a_neutral` che stanotte ha fatto sparire le serie. Risolvendo al bordo, la divergenza è impossibile
**per costruzione**. E il codice di oggi *prova* già a farlo, nella versione sporca: `api/catalog.js:63` muta
`fullUserConfig.activeProfileId` — *«così il handler lo usa»*. La versione pulita è un oggetto di contesto che
scende, non un documento mutato.

I fatti che hanno reso la domanda necessaria: la risoluzione è **in quattro copie** dentro
`catalogStrategies.js` (righe 783, 938, 1021, 1388), il pool ha una **catena di ripiego a quattro livelli** con
**tre percorsi diversi** per la stessa cosa (`activeProfileSettings.typeSelectors`, `userConfig.typeSelectors`,
`user.settings.typeSelectors`), e la chiave di cache se li risolve per conto suo.

**Il contesto è del modulo profilo** (deciso lo stesso giorno): l'oggetto che scende a tutti —
`{userId, profileId, addonUuid, selettoriEffettivi, kidsMode, slider}` — lo produce il modulo profilo con
`contestoDi({userId, profileId?, richiesta?})`. È la conseguenza diretta della decisione precedente: se i selettori
si risolvono al bordo, **il bordo ha un proprietario**. E `src/library/context.js` (nato col ticket 16, che risolve
`{userId, profileId, addonUuid}`) diventa la sua porta — o si sposta dentro il modulo profilo.

**Il documento condiviso si separa in due** (deciso lo stesso giorno): `UserAccount` (chiavi API, `addonUuid`) →
modulo configurazione utente; `AddonConfig` (i profili e le loro cose) → modulo profilo. E **`libraryOrder` esce dal
profilo**: è un fatto della *libreria* (l'ordine che l'utente ha dato ai suoi titoli), non una preferenza di
visualizzazione — oggi vive in `AddonConfig.profiles.$.raw_ui_state`, che è il posto sbagliato. Migrazione: uno
script una tantum che sposta il campo, e per una release il campo vecchio letto in **fallback** (è dato
dell'utente: non si butta).

## Tutte le domande decise (17/10/2026)

Le cinque domande di questo ticket hanno una risposta, e il modulo ha una forma:

| domanda | decisione |
|---|---|
| cosa possiede | anagrafica, **lista e singolo profilo**, impostazioni (selettori, `kidsMode`, policy anime, **slider Ocean**), i suoi cataloghi, le deduzioni (`TasteProfile`, staleness). **Non** le chiavi API, l'account, `addonUuid`, la ui state |
| la porta | `profiloDi({userId, profileId})` torna il profilo **grezzo**; i selettori li risolve una **funzione pura** |
| chi risolve i selettori | **al bordo**, una volta, e viaggiano nel **contesto** (pool, handler e chiave di cache ricevono lo stesso valore) |
| il contesto | è **del modulo profilo**: `contestoDi({userId, profileId?, richiesta?})`; `library/context.js` diventa la sua porta |
| il documento | **due**: `UserAccount` (chiavi, `addonUuid`) → configurazione utente; `AddonConfig` (i profili) → profilo. E **`libraryOrder` esce dal profilo** e va alla libreria (script una tantum + fallback per una release) |
| il profilo mancante | `global` è un **profilo vero**, e l'invariante è **«almeno uno»**: i consumatori non vedono mai l'assenza, e i quattro `|| 'global'` spariscono |

**Cosa resta**: l'**applicazione** — che è di questo ticket (il grilling ha deciso, l'esecuzione no). E nasce da qui il **modulo configurazione utente** (chiavi, account, ui state), che non ha ancora un ticket: si crea quando si applica la separazione dei due documenti.

---

## Le domande che restano (per il prossimo grilling)

1. **La forma della porta**: `profiliDi(userId)` + `profiloDi({userId, profileId})` + i comandi
   (crea/duplica/rinomina/elimina/attiva) — e **cosa torna** `profiloDi`: il profilo *grezzo* o il profilo
   **risolto** (con i selettori effettivi calcolati, il `kidsMode` ereditato, gli slider applicati)?
2. ~~**Chi calcola i selettori effettivi**~~ → **DECISO**: profilo grezzo dalla porta, e una **funzione pura**
   del modulo (`selettoriEffettivi(profilo, richiesta)`) che li risolve — perché la risoluzione dipende dalla
   richiesta. V. sopra. *Resta da decidere*: dove vive quella funzione (nel modulo, come `profileStaleness`) e
   chi la chiama oggi nei tre consumatori (il pool, il `catalogHandler`, le chiavi di cache).
3. **Il confine col modulo configurazione utente**: cosa succede se condividono il documento; chi migra i
   dati esistenti (`AddonConfig.profiles[]` oggi contiene anche `raw_ui_state.libraryOrder`, che è della
   libreria: v. ticket 16).
4. **`library/context.js`**: diventa la porta del modulo profilo (il suo `{userId, profileId, addonUuid}` è
   già la firma giusta) o resta dov'è?
5. **Cosa fa il modulo quando il profilo non c'è**: profilo inesistente, profilo eliminato, utente senza
   profili (il `global` è un profilo vero o un'assenza?).

## Come si verifica (da completare in grilling)

Il criterio minimo: **i quattro posti diventano uno** (con il `grep` che lo dimostra), i consumatori non
deducono più i selettori per conto proprio, e la suite resta verde — più il test-guardia sulla proprietà di
`profiles[]`.
