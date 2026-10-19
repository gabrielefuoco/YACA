Status: ready-for-agent
Type: task

# 55 — La riga «il tuo mondo»: il grafo sa fare 51 titoli, l'app ne serve 11

## Il sintomo, misurato in produzione il 19/10/2026 (dopo il rebuild del grafo)

Il grafo, chiamato **direttamente** coi semi del profilo reale (`REOZrGNRr3`, **29 semi**, medium `tv`), risponde:

```
il_tuo_mondo:       51 titoli   ← la feature del ticket 40 (accumula finché non raggiunge ≥50)
un_passo_fuori:     40 titoli
uscite_nuove:        1 titolo
nicchia_di_qualita: 39 titoli
mondo_1359:  8 · mondo_2130: 7 · mondo_1739: 11 · mondo_1620: 7 · mondo_1981: 7
```

La riga **pubblica** dell'app, per lo stesso profilo:

```
GET /ff7084d8-904b-42d9-91f5-ea2b4ae37590/catalog/series/yaca_mondi_series.json
→ 11 titoli          ← esattamente quanti ne ha `mondo_1739`, UNA delle liste per mondo
GET /…/yaca_passo_fuori_series.json   → 20
GET /…/yaca_nicchia_di_qualita_series → 20
```

**11 = la dimensione di un singolo mondo**, non della lista accumulata. Sembra che l'app stia servendo
*una* lista per mondo invece di `il_tuo_mondo`.

## Cosa è già stato escluso (con la prova, non per impressione)

1. **Non è l'handle sbagliato**: `UserAccount.addonUuid = ff7084d8-904b-42d9-91f5-ea2b4ae37590` → `userId = REOZrGNRr3` (verificato su Atlas). Quindi l'app chiede per l'utente giusto.
2. **Non è la cache dell'app**: `graphClient.getGraphHealthVersions()` risponde `{artefatto: cf1d80dcba3eddce, ricetta: 2330b143bc8845a7}` — la ricetta **nuova** — e la chiave della cache hero porta `artefatto`/`ricetta` in `dipendenze.invalida` (`src/pool/index.js:61-63`). Quindi la voce vecchia non viene riusata.
3. **Non è la composizione**: `src/pool/index.js:250` consuma proprio `liste.find(l => l.ruolo === 'il_tuo_mondo')` e ne prende `titoli`.
4. **Il grafo gira il codice nuovo**: la ricetta è cambiata (`8b2d7932…` → `2330b143…`) dopo il rebuild.

## Le ipotesi che restano (in ordine di probabilità)

1. **I semi che l'app passa sono meno dei 29** che ho usato io: l'app li filtra per **politica anime**, selettori di tipo e medium prima di chiamare il grafo (`src/pool/index.js:170-190`). Meno semi → meno mondi attivati → lista accumulata più corta. **Il mio test non filtrava nulla.**
2. **La chiamata dell'app passa `opzioni` e `cap: 60`** (`src/pool/index.js:231-246`), la mia no. Se `opzioni` (slider) o `cap` cambiano la composizione, i due numeri non sono confrontabili.
3. **Un filtro a valle** taglia la lista dopo la composizione: la politica anime, `kidsMode`, i selettori di tipo, o l'esclusione dei **già visti** (`il_tuo_mondo` è «titoli non visti»: se il profilo ne ha visti molti di quei 51, restano 11).
4. **`cap` o la paginazione**: la rotta serve una pagina (100 o 20 a seconda del catalogo).

## Cosa deve uscire

1. **Il numero vero**: replicare **la chiamata dell'app** — stessi semi (filtrati), stesse `opzioni`, stesso `cap` — e riportare `il_tuo_mondo` prima e dopo i filtri. Il confronto va fatto **a parità di ingressi**, se no i due numeri non si possono mettere accanto.
2. **La causa**, con la prova: quanti semi passa l'app, quanti titoli tornano dal grafo, quanti ne restano dopo ogni filtro (anime → kids → visti → paginazione). **Una misura per ogni passaggio**, non un'ipotesi.
3. **Se la causa è un filtro legittimo**, il ticket si chiude **dichiarando il numero atteso** (e aggiornando il ticket 40 con la nota: *«51 sulla lista grezza, N dopo i filtri del profilo»*).
4. **Se è un difetto** (es. l'app legge la lista sbagliata, o un filtro taglia senza motivo), la correzione **e un test che sarebbe fallito**: un caso con `il_tuo_mondo` > 40 titoli che, passando dal percorso dell'app, deve uscire con più di 20.

## Come si verifica

- La sonda **committata** (`scripts/qa/`): dati i semi del profilo reale, chiama il grafo e poi il percorso dell'app,
  e stampa **i due conteggi** con la differenza spiegata. Il repo pretende la sonda nel repo: *«se no la misura vive nella prosa»*.
- `npx jest --forceExit` con la baseline misurata: `main` fa **5 suite fallite / 8 test falliti / 1881 passati**
  (188 suite); le sole ammesse: `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`,
  `presetBurtonOrdering`. Lista `FAIL` e totali, non un sottoinsieme.
- I due hash del manifest invariati: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` /
  `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
- `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.

## Note operative (già pagate, non ripagarle)

- Un `node -e` **dentro `yaca-app`** deve girare con `--workdir /app` (se no `require('mongoose')` non risolve) e
  chiudere con `process.exit(0)`. Il file di prova va copiato in `/app`, non in `/tmp` (i moduli non si risolvono da `/tmp`).
- `curl` **non è installato** nell'immagine dell'app: per una POST usa `node` (`http.request`).
- `semiDi` **esce vuoto se Mongo non è connesso** (`readyState !== 1`): connetti prima, o la misura è un artefatto.
- Non toccare `frontend/**` (decisione dell'utente: il frontend si tocca dopo). Niente `git push`, niente `npm run build`.

## Quando è chiuso

Appendici un `## Esito` in italiano: i due conteggi a parità di ingressi, la misura per ogni filtro, la causa, e cosa
**non** hai fatto. Lascia `Status: ready-for-agent`: chiude l'integratore.
