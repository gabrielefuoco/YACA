Status: resolved
Type: task

# 03 — Le sei cose trovate lavorando: nomi, modello, un tap, emoji doppia, React

## Perché

Chiudendo i due ticket precedenti sono emerse sei cose che non eran nel perimetro ma che
avrebbero lasciato il lavoro a metà: due nomi uguali per cose diverse, un campo del modello che
nessuno legge, un'attivazione a due tap, un'emoji che può comparire due volte, un ref scritto nel
render e due default diversi per un utente nuovo.

## Cosa è stato fatto

1. **Il «Solo anime» del Creatore non si chiama più così**: la riga è `Catalogo Anime`, lo switch
   `Contiene anime`, il badge sulla card `Anime`. Il tooltip dice esplicitamente che non è il filtro
   del profilo (quello sta in Impostazioni profilo). Il filtro del profilo resta `Solo anime` nel
   segmento a tre stati: ora sono due nomi distinti.
2. **`typeSelectors.film` e `.serie` tolti dal modello**: `isCatalogConformant` (frontend e
   `src/catalog/catalogKind.js`) legge **solo** `anime`, e il commento del motore dice che Solo
   Film/Solo Serie sono stati rimossi. Erano config morte: tolti da `TypeSelectors`,
   `sanitizeTypeSelectors` e dai cinque default. Nessuna UI da aggiungere.
3. **Attivare un profilo costa un tap**: il bottone «Attiva» compare su tutte le card non attive,
   non solo su quella in modifica. Togliere un profilo resta nel dialog.
4. **Emoji doppia nei profili vecchi**: `mapBackendProfile` toglie dal nome l'emoji **se è la stessa**
   scelta nel campo (`🏠 Generale` + emoji `🏠` → `Generale`). Non tocca i nomi con emoji diverse.
5. **`useProfiles`: ref scritto durante il render** (`activeProfileIdRef.current = activeProfileId`)
   → spostato in un `useEffect` dichiarato prima dell'effetto che lo legge. React 19 lo segnalava
   come errore, non come avviso.
6. **Default allineati**: `createGlobalProfile` ora usa `[...DEFAULT_PRESET_IDS, ...HERO_PRESET_IDS]`
   come `createDefaultProfiles`, invece dei soli hero.

## Verifica (21/10)

Mock + CDP a 390px:

- creato un secondo profilo: **1** bottone «Attiva» (sulla card non attiva), un click e resta **1**
  solo «ATTIVO»;
- profilo dal backend con nome `🏠 Generale` ed emoji `🏠` → la card mostra `Generale`;
- tab Creatore: `Contiene anime` e `Catalogo Anime` presenti, `Solo anime` **assente**;
- payload `POST /api/configurazione`: `settings.typeSelectors` è `{ anime: null }`, senza `film`/`serie`.

Build, `tsc --noEmit` e `next build` verdi.
