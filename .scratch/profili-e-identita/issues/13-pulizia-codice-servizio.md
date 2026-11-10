# Pulire il codice morto del servizio: la pipeline editoriale che calcola per un log

Status: resolved
Type: task
Blocked by: —

## Cosa è stato verificato

Il pool calcola ancora l'intera pipeline editoriale — `RUOLI_HERO`, `RUOLI_MICRO`, `punti_incontro` e i quattro cataloghi `yaca_mondi_*`, `yaca_passo_fuori_*`, `yaca_uscite_nuove_*`, `yaca_nicchia_di_qualita_*` — dentro l'unica strategia `additive: true` di `HERO_STRATEGIES` (`src/pool/index.js:395-641`, ~250 righe). Gira a **ogni** costruzione del pool.

Quei cataloghi **non sono più dichiarati nel manifest**: verificato sul server, i quattro endpoint rispondono `0 titoli`. L'unico uso residuo del loro contenuto è una riga di log:

```
src/pool/index.js:924  console.log(`[Mondi] ... pool mondi ${nMondi} · passo fuori ${nPasso} ...`)
```

## Cosa va rimosso o riportato

1. **La pipeline editoriale**: strategia `additive`, `RUOLI_HERO`, `RUOLI_MICRO`, `HERO_PRIORITY`, `assignHeroPools`, la scrittura di `assigned[catMondi|catPasso|catUscite|catNicchia]`, e il log che le conta. Restano: la risoluzione degli **scaffali** (`sharedState.shelves`) e i semi (`seedIds`), che sono ciò che serve davvero.
2. **`src/catalog/registry.js`**: tiene le definizioni dei 20 cataloghi hero (524 righe). Tenerle solo se ancora lette: `catalogDefinitionsFromShelves` è viva, l'elenco hero no. Verificare con `grep` prima di togliere, e riportare cosa resta.
3. **`src/cache/index.js`**: le chiavi di cache si costruiscono ancora con `largo`, `lontano`, `cozy`, `canone`. I primi due non esistono più, gli altri due si chiamano `tonalita`/`notorieta`. Allineare e **invalidare** una volta, dichiarandolo.
4. **`src/stremio/fingerprint.js`**: `DEFAULT_HERO_CATALOGS` entra nell'impronta del manifest pur non dichiarando nulla. Toglierlo dall'impronta (o spiegare perché resta).
5. **`typeSelectors`**: compare in 24 file; i modi li hanno sostituiti e le leve si derivano da `derivaLeve(modo)`. Non è un lavoro di superficie: **elencare i file dove è ancora un input** e correggere solo quelli, lasciando i punti dove è un'uscita.

## Vincoli

- **Golden a `0.000e+00`** e manifest identico: togliere codice non deve cambiare una riga servita.
- Nessun commit, nessun deploy.
- I test che verificano solo la pipeline editoriale si cancellano, nominandoli; quelli che verificano scaffali e semi restano verdi.

## Esito

Meno codice nel percorso caldo, un solo nome per i cursori, un'impronta che non contiene ciò che non esiste.

## Esito

Fatto: blocco editoriale rimosso da `src/pool/index.js`, cursori a un nome solo,
`DEFAULT_HERO_CATALOGS` (20 cataloghi fantasma) tolto dall'impronta e cancellato, impronta senza
override inutilizzati, `typeSelectors` ripuliti dove erano ancora una seconda verità
(`resolveAnimePolicy` non li rilegge più dal profilo con i modi accesi; la proiezione
dell'impronta usa le leve della modalità). Manifest e risposte invariati.
