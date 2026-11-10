# Un DNA o cinque: quali segnali sono dell'account e quali della modalità?

Status: resolved
Type: grilling
Blocked by: 01

## Question

I cursori Tonalità e Notorietà salgono all'account. Il DNA (generi, keyword, network con un punteggio) è oggi calcolato dentro il profilo dalla sua storia. Se il profilo diventa una modalità dello stesso account, cinque DNA sono cinque ritratti della stessa persona: probabilmente uno solo è vero.

Proposta da sbrogliare, non da ratificare:

- **Un DNA per account**, calcolato su tutta la storia. La modalità decide cosa si recupera, non chi sei. In modalità Anime i semi non-anime restano parte del DNA — ed è esattamente il comportamento voluto per la propagazione.
- **Un DNA per modalità**, cioè calcolato solo sulla storia di quel medium. In modalità Film il DNA sarebbe "i tuoi gusti di film", che è più preciso ma è un'altra persona ogni volta che cambi modalità.

Da chiudere:

1. Quale delle due, e perché. Cosa si guadagna e cosa si perde in ognuna, con un esempio concreto su un account che guarda 80% serie e 20% film.
2. Il DNA mostrato nella sezione DNA & AI LAB: dna dell'account, o dna della modalità attiva con etichetta? (Nel primo caso i cursori e il DNA sono coerenti; nel secondo il pannello cambia quando cambi modalità.)
3. La storia **per modalità**: in modalità Film, i semi del grafo sono solo film (già così) ma il DNA è di tutto. Questo può spingere un film verso un gusto che viene dalle serie: è desiderabile o è rumore? Serve una misura, non un'opinione — si può guardare cosa succede alle prime righe di un profilo con storia mista.
4. I valori Tonalità/Notorietà oggi salvati per profilo: cosa diventa il valore d'account (media? quello del profilo attivo? azzerato?).
5. I `typeSelectors` esistenti: sopravvivono come leva tecnica dietro il tipo, o vengono assorbiti del tutto?

La decisione va scritta qui, con la struttura del DNA risultante e la sorte dei dati esistenti.

## Risoluzione

### Un DNA per account, non uno per modo

Il DNA (generi, keyword, network con punteggio) si calcola **una volta per account, su tutta la storia**. La modalità decide cosa si recupera, non chi sei. In modalità Anime i semi non-anime restano parte del DNA — ed è esattamente il comportamento voluto, perché sono parte della persona anche quando non li si consiglia.

Motivo, nelle parole dell'utente: *«preferisco una logica unica per account e non per profilo»*. Cinque DNA sarebbero cinque ritratti della stessa persona, e nessuno dei cinque sarebbe vero.

### Conseguenze

1. **Il pannello DNA & AI LAB mostra il DNA dell'account**, senza etichetta di modalità: non cambia quando cambi modo. I cursori sono lì accanto e sono anch'essi dell'account, quindi pannello e manopole raccontano la stessa cosa.
2. **La storia per modalità**: Film e Serie non ricalcolano nulla sul DNA. Il modo filtra l'uscita (medium) e, per Bambini soltanto, anche i semi. Un film consigliato in modalità Film può essere guidato da un gusto che viene dalle serie: è voluto, non è rumore.
3. **Valori Tonalità/Notorietà esistenti**: non c'è niente da migrare. La tabula rasa del ticket 01 azzera anche i cursori per-profilo: si riparte da un valore d'account (0 = comportamento neutro, risultati bit-identici al grafo nudo).
4. **`typeSelectors` e `kidsMode`**: assorbiti dal modo. Non sono più input, sono uscite di `derivaLeve(modo)`. Sparendo come input, sparisce anche l'unico loro uso residuo in `src/stremio/fingerprint.js:87-88`, che oggi le registra nell'impronta senza che filtrino niente.
5. **`dna` non è più un campo di `profiles[]`**: sale su `AddonConfig` accanto ai cursori. `src/profile/ProfileBuilder.js` calcola una volta per account.

### Cosa resta aperto

Niente di decisivo. Se in futuro si volesse un DNA per modo, la porta è aperta: il campo è uno e la funzione di calcolo accetta già un filtro sui semi.
