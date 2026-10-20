Status: resolved
Type: task
Blocked by: 12

# 13 — Il registro dei nuovi cataloghi (lato Node)

## Decisione già presa (mappa, 19/10/2026)

**I nomi e gli ID dei cataloghi si possono cambiare.** Con più righe (micro-cluster) lo schema fisso non regge.
**Conseguenza deliberata**: i due hash del manifest **cambiano** — e il nuovo valore atteso si aggiorna **in questo
ticket**, con il numero misurato. Non si scopre dopo, non si "aggiusta" un test.

## Cosa deve uscire

1. **Il registro** (`src/catalog/registry.js` e ciò che ne dipende) elenca le nuove righe: `il_tuo_mondo`, `gemme
   nascoste`, `classici`, `ultime visioni`, `punti d'incontro`, `nuove uscite`, i **micro-cluster** (id stabili), e
   le righe esistenti che restano.
2. **`src/pool/index.js`** consuma le liste per `ruolo` senza scartarne nessuna: **oggi scarta `mondo_{b}` e non lo
   dice** — verificalo e, se è vero, è parte del difetto.
3. **Gli ID dei micro-cluster sono stabili** fra una richiesta e l'altra: un catalogo che compare e sparisce è un
   guasto per Stremio, non una varietà.
4. **I due hash del manifest**: si calcolano con `buildManifest({})` e `buildRootManifest()`, si **incollano nel
   ticket** con il comando che li ha prodotti, e si aggiornano i test che li fissano. Il vecchio valore
   (`dc4af35c…` / `91bf96d3…`) resta scritto nel ticket come "prima", per tracciabilità.

## La prova

- Il manifest nuovo, con l'elenco dei cataloghi (tipo + id), e **i due hash nuovi calcolati e incollati**, con il
  comando.
- Un test che verifica che **ogni lista** prodotta dal grafo abbia un catalogo nel registro: nessuna riga calcolata
  e poi buttata via.
- Suite: le rosse ammesse restano le stesse; se un test fissava i vecchi hash, l'aggiornamento va **dichiarato**
  riga per riga (non cancellato).

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- **Ogni riga che non si riesce a riempire lo dichiara**: nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

---

## Esito (20/10/2026) — le sei righe nuove sono cataloghi, e lo dicono i due hash

### 0. L'ordine dei ticket è stato invertito, e perché

Il `13` era `Blocked by: 12`, ma il `12` è fermo su una **premessa falsa** (il «flag anime del canone» non
esiste: il canone non esporta nessun flag per-titolo, l'anime è deciso lato Node). Il prerequisito è il
ticket **19**. Il `13` invece **non dipende** dai filtri a monte — registro, pool e manifesto stanno in
piedi senza — e tiene in ostaggio il valore di sei ticket (dal `06` in poi le righe non arrivavano a
Stremio). Fatto il `13`, il `12` (e il `19`) restano dove sono.

### 1. La premessa, verificata

`src/pool/index.js` leggeva **quattro** ruoli con quattro `.find(...)` e scartava tutto il resto: i
`mondo_<b>` sparivano **senza un log**. Confermato. Anche `src/catalog/registry.js` elencava 8 cataloghi
(4 famiglie × 2 medium), quindi `classici_imperdibili`, `ultime_visioni`, `punti_incontro_*` e
`micro_cluster_*` non avevano né catalogo né consumatore.

### 2. Cosa è uscito

- **Registro**: sei famiglie nuove × 2 medium = **12 cataloghi** in più (8 → 20):
  `yaca_classici_{movies,series}`, `yaca_ultime_visioni_{…}`, `yaca_punti_incontro_{…}`,
  `yaca_micro_cluster_{1,2,3}_{…}`. Priorità 5–10, additive, `anime: agnostic`.
- **Pool**: una **tabella** ruoli→catalogo (`RUOLI_HERO`, `RUOLI_MICRO`, `RUOLI_PONTE`) al posto delle
  quattro assegnazioni copiate; i tre ponti si **uniscono** in un solo catalogo (senza doppioni); gli slot
  dei micro-cluster esistono anche quando il motore non produce quel filone (**restano vuoti, non
  spariscono**). Le righe **senza catalogo** (`mondo_<b>`) si **dichiarano** in un log.
- **Manifest**: `HERO_CACHE_KEY_VERSION` v15 → **v16** (il payload cambia). **Compatibilità**: un profilo
  che aveva **tutte** le righe hero storiche riceve anche quelle nuove (`HERO_SLUG_STORICI`); chi ne aveva
  una sola resta filtrato com'era.
- **Test nuovo** `tests/heroRowsCoverage.test.js`: ogni ruolo con titoli arriva nel catalogo giusto, il
  ponte è un catalogo solo e senza doppioni, ogni catalogo assegnato esiste nel registro, ogni slug del
  registro ha il suo catalogo nel pool, lo slot di un filone assente resta vuoto, e il manifesto dichiara
  le righe nuove.

### 3. I due hash del manifest (con il comando)

```
$ node -e "const {buildManifest, buildRootManifest}=require('./src/stremio'); const c=require('crypto'); const h=x=>c.createHash('sha256').update(JSON.stringify(x)).digest('hex'); console.log('buildManifest({})', h(buildManifest({}))); console.log('buildRootManifest()', h(buildRootManifest()))"

prima (4eac34a):
buildManifest({})    dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178
buildRootManifest()  91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2

dopo (HEAD):
buildManifest({})    4169fd73f14389f24097e6508bd06c289b1898ad727250342ccf1fe47b093dc5
buildRootManifest()  91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2
```

Il «prima» ricalcolato **coincide con il valore storico** (`dc4af35c…`), quindi la misura è la stessa di
sempre. `buildRootManifest` **non cambia**: il manifesto radice non elenca cataloghi.

### 4. I test che fissavano i valori vecchi: aggiornati riga per riga, non cancellati

`tests/catalogTypeAndValidation.test.js` (erano invarianti del Ticket 23):

| asserzione | prima | dopo | perché |
|---|---|---|---|
| `manifestRows` | `toHaveLength(8)` | `20` | 10 famiglie × 2 medium |
| `getHeroCatalogFingerprintRows()` | `toHaveLength(8)` | `20` | idem |
| `Object.keys(getHeroCatalogKindMap())` | `toHaveLength(8)` | `20` | idem |
| `heroPriority` | `[mondi, passo_fuori, uscite_nuove, nicchia_di_qualita]` | `+ classici, ultime_visioni, punti_incontro, micro_cluster_1..3` | le nuove hanno priorità 5–10 |
| `slugAdditivi.size` | `4` | `10` | tutte additive |
| `slugs` / `catalogs` | `4` / `8` | `10` / `20` | idem |
| `getHeroUiGroups()` | `4` card | `10` card | idem |
| `getRegistryHash()` | `4abf3230f7019d6d` | `aa9da269c5787496` | il registro è cambiato di proposito |
| testi dei test («8 righe», «4 card», «8 hero») | — | aggiornati | un nome che mente è un difetto |

`tests/graphClientPoolIntegration.test.js`: `_v15_` → `_v16_` (versione della cache righe).
`tests/heroMovieDateRegression.test.js`: l'helper `cachedHeroGroup` costruiva una voce di cache con **4**
famiglie; il validator del pool ora ne pretende 10 (voce vecchia = cache da rigenerare) → l'helper le
costruisce dal registro.
`tests/ticket47HeroProtection.test.js`: «8 hero» → 20; **la guardia sul frontend** è stata aggiornata nel
verso che conta (nessun id morto, ogni id del frontend è vivo) e le sei famiglie nuove sono **dichiarate**
come «servite ma non ancora nella dashboard», più due test nuovi: le righe nuove sono nel manifesto anche
se non sono nella dashboard, e chi aveva tutte le righe di ieri riceve anche quelle di oggi.

### 5. Suite

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 188 passed, 193 total
Tests:       8 failed, 1 skipped, 1918 passed, 1927 total
```

Baseline `1910`/`192` + i 6 test nuovi di `heroRowsCoverage` + 2 nuovi in `ticket47` = `1918`, `193`
suite. Le cinque rosse sono esattamente quelle ammesse.

### 6. Residui dichiarati

1. **Il frontend non conosce le sei famiglie nuove**: la dashboard non ha i toggle, e il cantiere vieta di
   toccarlo. Le righe sono servite (manifest + catalogo) ma **non configurabili**; chi non le vuole oggi non
   può spegnerle. È scritto nel test (`RIGHE_NON_ANCORA_IN_DASHBOARD`) e serve un ticket di frontend.
2. **I `mondo_<b>` restano senza catalogo** e ora lo dichiarano in un log: un catalogo per bolla non è
   statico, e il manifest di Stremio è fisso. Se il prodotto li vuole, serve una decisione (es. aggregarli
   in un solo catalogo «altri tuoi mondi»).
3. **La cache delle righe hero si invalida** (v16): al primo avvio dopo il deploy le righe si ricalcolano.
   È voluto, ed è il motivo del bump.
4. **Il `12` e il `19` restano aperti** (filtri a monte e flag nel canone): finché non ci sono, le righe
   nuove arrivano a Stremio **senza** il filtro anime/kids a monte — i tagli a valle restano la rete di
   sicurezza, come prima di questo cantiere.
5. **La rigenerazione di `metadati-canone.npz`** (per il `19`, e per `COLL`/`DIR` del `04`) è un passo sul
   mate: non si fa qui.
