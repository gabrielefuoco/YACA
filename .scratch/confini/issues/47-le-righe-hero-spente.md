Status: claimed
Type: bug

# 47 — Il ticket 46 ha spento le righe hero: i profili veri selezionano id che non esistono più

## Il sintomo, misurato

`buildManifest` sui **profili veri di produzione** (Atlas, `configurazioni: 2`):

| profilo | `selectedPresets` | righe hero nel manifest |
|---|---|---|
| `global` | 8 id, **tutti morti** | **0** |
| `4159713d` | 33 id, 4 vivi + 8 morti | 4 (`mondi` + `passo_fuori`) |
| `1c1da0af` | 24 id, **tutti morti** | **0** |
| `0465f104` | 22 id, 0 vivi 0 morti | 0 |
| `3f2f4afd` | 18 id, 0 vivi 4 morti | 0 |
| i 5 profili `sim_*` | 8 id, **tutti morti** | **0** |

Comando (rieseguibile): `buildManifest(userConfig, {hostUrl})` coi profili letti da `addonconfigs`, contando
`catalogs.filter(c => /yaca_(mondi|passo_fuori|uscite|nicchia)/.test(c.id))`.

**Prima del ticket 46 quelle 8 righe c'erano**: gli otto id erano i cataloghi hero. La rimozione
(`37a5b55`) ha svuotato la selezione dei profili esistenti — e il manifest filtra gli hero proprio con
`selectedPresets`:

```js
// src/stremio/manifest.js:93-97
const activeHeroCatalogs = (
    Array.isArray(selectedPresets)
        ? heroCatalogs.filter(c => selectedPresets.includes(c.id))   // ← intersezione vuota = zero righe
        : heroCatalogs
).filter(c => isCatalogConformant(c, typeSelectors));
```

## Perché nessun test l'ha visto

`tests/feedProtocolAndCatalogs.test.js` (nuovo del 46) costruisce un profilo **sintetico con gli id nuovi** →
passa. I profili veri hanno gli id **vecchi** → non li prova nessuno. È la classe di guasto già pagata due volte
in questa mappa: *il test giusto con i dati sbagliati*.

## Le tre cause (tutte da chiudere)

1. **Il manifest non degrada**: se l'intersezione è vuota, non mostra *nessun* hero invece di mostrare i
   cataloghi di sistema. Un profilo legacy non dovrebbe perdere il feed.
2. **I dati**: i `selectedPresets` dei profili salvati contengono gli 8 id morti (e `catalogOrder` pure).
   Serve una migrazione (o una riscrittura al salvataggio).
3. **Il client li riscrive**: `HERO_PRESET_IDS` con gli 8 id morti in **quattro** posti —
   `frontend/src/app/page.tsx:21`, `frontend/src/hooks/useProfiles.ts:9`, `frontend/src/lib/utils.ts:164`,
   `frontend/src/lib/catalogKind.ts:17-24` (registro di fallback). Ogni profilo nuovo nasce già spento.
   Il 46 non li ha toccati: `git show --stat 28c1621 | grep frontend/` → vuoto.

## Cosa deve uscire

1. **Il manifest** che non spegne il feed: intersezione vuota → i cataloghi hero di sistema si mostrano lo
   stesso (con un log). E una riga di commento che dice *perché*.
2. **La migrazione dei profili** (una tantum, come quella di `libraryOrder`): gli id morti mappati ai vivi —
   `true_blend`/`hidden_gems` → `nicchia_di_qualita`, `seed_network` → `mondi`/`passo_fuori`,
   `trakt_filtered` → niente (era una strategia, non una riga). Da decidere in grilling: **la mappa dei
   rimpiazzi è una decisione di prodotto**.
3. **Il client**: gli id vivi al posto dei morti nei quattro posti — meglio ancora, **derivati dal registro**
   (`/api/dashboard` porta già `heroCatalogs`) invece che scritti a mano in quattro file: è la decisione 27
   («le superfici sono dati, non rami di codice»).
4. **Un test che sarebbe fallito**: `buildManifest` con un profilo **legacy** (solo id morti) deve restituire
   gli 8 hero; e i `HERO_PRESET_IDS` del client devono essere un sottoinsieme del registro.

## Blocca il deploy

Il ticket 30 (push) porta in produzione il 46: senza questo, **chi ha un profilo legacy perde tutte le righe
hero** — cioè il feed. Va chiuso **prima** del push.

## Le decisioni (18/10/2026)

1. **Un profilo legacy vede tutti e 8 i cataloghi hero di sistema.** Il manifest: se l'intersezione fra
   `selectedPresets` e gli id hero è **vuota**, mostra tutti gli hero (con un log). Gli hero sono **righe di
   sistema**: un profilo non deve perdere il feed perché il sistema ha rinominato le righe.
2. **La migrazione dei profili** aggiunge i vivi mancanti a `selectedPresets` e `catalogOrder` (e toglie i morti).
   **Come le altre: dry-run di default, `--apply` per scrivere, exit code 1 su errore critico** — e va eseguita
   **dopo il deploy**, non prima: la produzione attuale conosce gli id vecchi, e scrivere i nuovi prima del push
   le spegnerebbe il feed.
   ⚠️ **Il fallback nel manifest non è opzionale proprio per questo**: protegge i profili *prima* che la
   migrazione giri, e protegge per sempre dal prossimo rinomino.
3. **Il client**: id vivi nei quattro posti — o, meglio, **derivati dal registro** (`/api/dashboard` porta già
   `heroCatalogs`): è la decisione 27, «le superfici sono dati, non rami di codice».
4. **Un test che sarebbe fallito**: (a) `buildManifest` con un profilo legacy → **8** hero; (b) ogni id hero
   scritto nel client deve esistere nel registro.
