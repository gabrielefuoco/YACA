# frontend-verifica — dal PDF alla cura dal telefono

## Destination

L'analisi di `frontend.pdf` (Gemini, 15/10) è diventata un elenco di difetti **verificati riga per riga**
contro il codice (`ricerche/01`), separando ciò che è una fix da ciò che è una decisione di design.
Il grilling del 21/10 ha preso le decisioni sospese: il telefono è una superficie di **cura completa**
e le locandine non hanno più gesture implicite.

Il fronte si chiude quando: i ticket **01-13** sono verdi, la **B0** è verde su tutti i tab a
360/390/768/1024/1440, e i punti B1 **riscritti** del ticket 08 di `frontend-responsive` sono stati
visti su un dispositivo reale. Non si chiude con «i nove ticket sono verdi»: si chiude col telefono
che cura.

## Decisions so far

- **Il PDF non è un contratto.** Contiene 18 rilievi: 14 reggono, 4 no. Ogni ticket riporta l'evidenza
  `file:riga` rimisurata.
- **Riallineamento al codice del 21/10 (`12c4198`).** Le nove evidenze reggono, ma sei ticket avevano
  righe sbagliate; il 07 è passato da 1 a 3 `https` forzati; il 08 perde `DashboardPage:201` (non è
  più ritagliato); il 09 scopre 13 `text-[10px]/[11px]` rientrate in `DnaAndAiPanel`.
- **D1 — Il telefono cura, non consulta.** Creare e modificare cataloghi dal telefono è dentro il
  perimetro. Conseguenza: `frontend-verifica` assorbe il lavoro touch e **non** chiude come un fronte
  di sole fix.
- **D2 — Tocco su locandina = niente.** Fuori dalla modalità selezione, il tap non aggiunge, non toglie,
  non apre nulla. `PosterCard.onClick` resta solo per la selezione in libreria.
- **D3 — Nessuna azione sopra l'immagine.** Un'icona 44px in alto a destra se l'azione è una; se sono
  più di una, «⋯» → **action sheet** sul `ui/dialog.tsx` esistente (zero dipendenze). Nel composer il
  riordino resta con le **frecce visibili sotto la card**: è l'unica azione che si ripete.
- **D4 — Titolo: `titlePlacement: 'none' | 'below'`.** `PosterRow` e `CatalogLivePreview` = `none`
  (sono anteprime: devono somigliare a Stremio, e il JPEG ERDB porta già titolo e badge). Libreria,
  autocomplete e lista statica del Creator = `below`.
- **D5 — Aggiunta immediata, senza annulla.** Il «+» è un bersaglio esplicito: l'incidente che
  l'annulla copriva non esiste più. L'aggiunta è reversibile con «⋯ → Rimuovi».
- **D6 — Un solo scrittore della configurazione: l'auto-save**, con debounce ~500 ms. Gli slider
  scrivono su `onValueCommit` (una tirata = 1 POST, non 20). «Salva» diventa «Installa in Stremio» e
  non chiama più `configure`: **svuota la coda** e installa.
- **D7 — Icone: una libreria sola.** Migrazione a `lucide-react` in due passate (le 3 di `CatalogItem`
  dentro il lavoro sul contratto, le altre 12 dopo), poi via `<link>` da `layout.tsx` e la classe da
  `globals.css`.
- **D8 — La libreria si riordina con una modalità «ordina»**: frecce 44px per card, come la modalità
  selezione già esistente. Il drag resta un fatto desktop.
- **D9 — Il 09 non è un effort.** Sette voci su otto sono servite dal lavoro sul telefono e sono
  distribuite nei ticket esistenti; l'unica puramente estetica (`LoginPage` senza card) è `wontfix`.
- **Implementato il 21/10.** I ticket 01-08 e 10-13 sono `resolved`; il 09 è `wontfix` con la
  redistribuzione scritta. `next build` verde, `tsc --noEmit` verde, harness B0 verde
  (`sforano non gestiti = 0` su tutti i tab a 360/390/768/1024/1440; `touch target < 44px = 0` fino a
  768px, restano i 5 tab a 38px su desktop con mouse). Restano aperti solo i punti che richiedono un
  dispositivo vero, tracciati nel ticket 08 di `frontend-responsive`.

## Not yet specified

- **Header dopo il token.** Con `--color-background` registrato, `bg-background/80` diventa davvero
  semitrasparente: `/80` basta o serve `/95` + `backdrop-blur-md`? Si **misura** a 360px con scroll.
- **Quali 12 icone Lucide** sostituiscono i glifi Material: si sceglie con uno screenshot prima/dopo,
  non a tavolino (alcuni glifi non hanno un equivalente perfetto).
- **Se i poster ERDB hanno davvero titolo e voto stampati**: dedotto dal servizio
  (`/erdb-poster/<file>`, `src/api/staticPosters.js:252`), non visto in un'immagine. D4 regge comunque,
  ma se un poster composto resta senza titolo il preview perde il nome (resta l'`aria-label`).
- **Come allineare i due checkout** (`orca/workspaces/YACA/stingaree` è indietro), e se va ritirato.

## Out of scope

- **Restyling puro**: `LoginPage` senza card contenitore → `wontfix` (ticket 09), con il motivo scritto.
- **La verifica su dispositivo reale**: resta nel ticket 08 di `frontend-responsive`, dove è tracciata.
- ~~Nuove funzionalità~~: **uscita di proposito**. La cura dal telefono è una funzionalità nuova, e il
  fronte la fa. Non è una svista: è la decisione D1, presa sapendo di rompere questa regola.
