Status: needs-info
Type: grilling
Blocked by: 01

# 06 — Il doppio titolo sulle locandine: una decisione da riaprire

## Perché

Su mobile, le locandine mostrano **due volte** titolo e voto: una stampata nell'immagine, una
nell'overlay HTML. Esempio dagli screenshot: `SPIDER-MAN: BRAND NEW DAY 6.6` e `RESIDENT EVIL 7.0`.

Fatti, verificati:

- `shared/PosterCard.tsx:85` — overlay con `opacity-0 group-hover/poster:opacity-100 **pointer-coarse:opacity-100**`
  e gradiente `from-primary-dark/90 via-primary-dark/30 to-transparent` (semitrasparente in basso).
- `shared/AutocompleteSearch.tsx:109` — stesso pattern, con velo `bg-black/60` a tutta card.
- `dashboard/CreatorPanel.tsx:657` — stesso pattern.
- `dashboard/UserLibraryPanel.tsx:414-415` — il pattern **è stato rimosso**, con il commento che ne
  spiega il costo: *«forzarlo visibile sui touch (pointer-coarse) coprirebbe ogni locandina di nero su
  tablet. Sui telefoni il cestino in alto a destra è già sempre raggiungibile.»*

Tutti e tre i siti che ancora lo usano vengono dal commit `97a65e0`
(`fix(frontend): responsività — un solo contratto per card, poster e touch`), dove
`pointer-coarse:opacity-100` era la **decisione D2** del ticket 04 di `frontend-responsive`: rendere
raggiungibili al dito azioni che esistevano solo all'hover. Il motivo era buono e il problema che
risolveva era reale (un comando invisibile ma cliccabile). La conseguenza non era stata misurata
sull'immagine vera: le locandine ERDB hanno già titolo e voto *dentro* il JPEG, quindi l'overlay non
aggiunge informazione: la duplica.

**Non è un difetto dimenticato e non si chiude con una classe.** Il PDF, che non conosce questa storia,
propone `bg-gradient-to-t from-black via-black/90 to-transparent pt-12`: coprirebbe il voto stampato
nel poster, cioè butterebbe via il dato invece di mostrarlo.

## Da decidere (tre strade, costi diversi)

| | strada | costo | cosa si perde |
|---|---|---|---|
| A | titolo e anno **sotto** l'immagine, fuori da `aspect-[2/3]` | alza l'altezza della card; va rifatto il contratto di `PosterCard` | nulla: nessuna sovrapposizione possibile |
| B | overlay su hover **solo desktop**, titolo altrove su touch | 3 siti + verifica che l'azione resti raggiungibile al dito (è la ragione per cui D2 esiste) | la raggiungibilità che D2 aveva comprato: va risolta per altra via |
| C | gradiente coprente a tutta base dell'immagine | 1 classe | il voto già stampato nel poster, che è informazione dell'utente |

Da decidere anche **cosa fa il tocco** su una locandina nei risultati di ricerca: il ticket 08 di
`frontend-responsive` (B1.2) registra che oggi il tap "esplorativo" **aggiunge** il titolo alla
libreria, e chiede di decidere il comportamento, non lo stile. È la stessa faccia di questo problema:
finché il velo è sempre acceso su touch, l'azione è sempre a schermo e il tocco la colpisce.

## Done quando

- la strada è scelta e scritta qui, con il motivo;
- i 3 siti sono allineati alla scelta **e** `UserLibraryPanel` resta coerente (oggi è l'unico che
  diverge);
- se si sceglie B, esiste un modo perché l'azione resti raggiungibile al dito senza il velo: senza
  quello, B è una regressione del ticket 04;
- il comportamento del tap su locandina è deciso, non solo stilato: aggiornare il punto B1.2 del
  ticket 08 di `frontend-responsive`.
