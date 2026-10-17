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

## Le domande che restano (per il prossimo grilling)

1. **La forma della porta**: `profiliDi(userId)` + `profiloDi({userId, profileId})` + i comandi
   (crea/duplica/rinomina/elimina/attiva) — e **cosa torna** `profiloDi`: il profilo *grezzo* o il profilo
   **risolto** (con i selettori effettivi calcolati, il `kidsMode` ereditato, gli slider applicati)?
2. **Chi calcola i selettori effettivi**: oggi `resolveTypeSelectors` (nel vecchio stack) li deduce da
   profilo + richiesta. Se li calcola il modulo profilo, i consumatori non li deducono più; se li calcolano
   i consumatori, il modulo profilo fornisce solo i dati grezzi. *(La raccomandazione da discutere: li
   calcola il modulo, e la porta li restituisce già risolti — è la stessa scelta della libreria coi semi.)*
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
