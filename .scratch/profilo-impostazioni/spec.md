# profilo-impostazioni — un posto solo per configurare un profilo

## Destination

I selettori «Solo Anime / No Anime», la modalità bambini, il rinominare e l'emoji vivevano in tre
posti diversi (tre icone nella riga, un pannello sotto la griglia, un dialog a parte per il nome).
Ora vivono in **un dialog solo**, aperto dall'ingranaggio sul profilo selezionato. In più il badge
«ultimo episodio» esce dal Creatore: non si sceglie.

Chiuso quando: il dialog fa nome + emoji + kids + filtro anime, il profilo globale si rinomina come
gli altri, e nel Creatore non esiste più la scelta del badge episodi.

## Decisions so far

- **Dove**: un bottone «Impostazioni» (ingranaggio) nella riga dei profili, accanto a «Nuovo Profilo».
  Le tre icone (baby, matita, cestino) spariscono; «Elimina profilo» sta in fondo al dialog, staccato.
- **Filtro anime**: un segmento a tre stati — `Tutti · Solo anime · No anime`. Due checkbox
  mutuamente esclusive potevano sembrare entrambe spente e invece significavano «tutti».
- **Emoji**: campo vero sul profilo (`Profile.emoji`, schema `AddonConfig`, `profileProcessor`,
  whitelist del payload). Separata dal nome: sopravvive al rename. Senza emoji l'avatar mostra la
  prima lettera del nome, come prima.
- **Profilo globale**: si rinomina come gli altri. Il nome era congelato in **due** punti — il backend
  (`profileProcessor`) e il frontend (`useProfiles.updateProfile` faceva `name: p.name`) — e vanno
  tolti entrambi, altrimenti il dialog sembra rotto.
- **Badge episodio**: la scelta sparisce dal Creatore; i cataloghi creati a mano non lo mandano più
  (default: spento). I preset «Serie: Episodi Recenti» e «Simulcast» continuano ad averlo dal loro
  `definition`: è la loro ragione d'essere, non una preferenza dell'utente.

## Not yet specified

- Niente di aperto su questo fronte: le due domande che erano qui (il doppio «Solo anime» e i
  `typeSelectors.film/serie`) sono state chiuse dal ticket 03 — il primo con due nomi distinti, il
  secondo togliendo i campi dal modello, perché `isCatalogConformant` legge solo `anime`.

## Out of scope

- Nuove funzionalità del motore o dei cataloghi.
- Riscrivere la card del profilo: si aggiungono solo due marcatori (Bambini / Solo anime · No anime).
