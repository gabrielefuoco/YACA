# frontend-verifica — dal PDF alle fix verificate

## Destination

L'analisi di `frontend.pdf` (Gemini, 15/10) è diventata un elenco di difetti **verificati riga per riga**
contro il codice (`ricerche/01`), separando ciò che è una fix da ciò che è una decisione di design. Il
fronte si chiude quando: i ticket `ready-for-agent` sono verdi, le tre decisioni sospese (icone, overlay
delle locandine, refactor grafici) sono prese o scartate, e la verifica umana del ticket 08 di
`frontend-responsive` è fatta.

## Decisions so far

- **Il PDF non è un contratto.** Contiene 18 rilievi: 14 reggono, 4 no (righe sbagliate, spiegazione
  sbagliata del difetto principale, un fraintendimento). Ogni ticket riporta l'evidenza
  `file:riga` rimisurata. Il "prompt pronto da incollare" del PDF non si usa così com'è.
- **L'header trasparente non è un problema di z-index.** È `bg-background/80` che non genera nulla:
  `--color-background` e `--color-foreground` non sono registrati in `@theme inline`
  (`globals.css:10-53`). Il primo giro del PDF aveva proposto `bg-[#EED9B9]/95` hardcoded: un cerotto
  che lascia la causa in piedi.
- **Il doppio titolo sulle locandine è una decisione, non un difetto.** `pointer-coarse:opacity-100`
  su `PosterCard`/`AutocompleteSearch`/`CreatorPanel` è la decisione D2 del ticket 04 di
  `frontend-responsive` (commit `97a65e0`), applicata in modo non uniforme: in `UserLibraryPanel` è
  stata rimossa con un commento che ne spiega il costo. Va riaperta a mano (ticket 06).
- **Fix e restyling non viaggiano insieme.** I rifinimenti del 4° giro del PDF (8 voci, nessuna nuova
  feature) restano fuori: ticket 09, `needs-triage`.
- **Si lavora in `C:\Users\gabri\APP\YACA`.** Il checkout `orca/workspaces/YACA/stingaree` è 26 commit
  indietro e ha una `.scratch` scollegata; il suo `frontend/src` è però identico, quindi l'analisi vale
  per entrambi.

## Not yet specified

- Se le icone si unificano su `lucide-react` (tocca 6 file, rimuove ~300 KB di font) o si tampona solo
  il layout shift con `width/height` (ticket 05).
- Quale delle tre strade per l'overlay delle locandine (ticket 06): titolo fuori dall'immagine,
  gradiente coprente che però nasconde il voto già stampato, oppure overlay solo su desktop.
- Se `DnaAndAiPanel`/`SettingsPage` conservino l'auto-save come percorso unico o tengano due percorsi
  (ticket 07.2 e 07.6): dipende da cosa fa `page.tsx:194`.
- Come allineare i due checkout, e se `stingaree` va ritirato.

## Out of scope

- Nuove funzionalità.
- Rifinitura estetica del 4° giro del PDF finché il ticket 09 non è triato.
- La verifica su dispositivo reale: resta nel ticket 08 di `frontend-responsive`, dove è già
  tracciata. Qui si registra solo il collegamento (il suo punto B1.2 è la stessa domanda del ticket 06).
