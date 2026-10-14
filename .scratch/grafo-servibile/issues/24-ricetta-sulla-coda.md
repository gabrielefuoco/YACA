# 24 — La ricetta va ridecisa sulla coda

**Status**: `resolved` · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/24-ricetta-sulla-coda.md) · **la ricetta e' ridecisa sulla coda**, e i due cataloghi NON la vogliono uguale.
- **FILM: CF + decadimento (tau 365), SENZA TV.** Il decadimento e' **l'unica candidata che non peggiora la coda** (+0,02/+0,17/+0,43); TV la peggiora di **-1,83 al @500**, le liste di -1,34, il gating di -0,94.
- **SERIE: CFst + B + TV + decadimento.** Sul banco Trakt la co-visione migliora **anche la coda**: **+1,44 al @10, +6,82 al @100, +10,01 al @500** (e il guadagno della coda e' il 97% di quello globale al @500).
- **E la scoperta che vale piu' della ricetta**: TV sul banco **MovieLens** (sorgente estranea) peggiora la coda di -1,83, sul banco **Trakt** (sorgente propria) la migliora di +1,78. **L'invarianza cross-dominio va dichiarata PER METRICA, non per componente** -- il verdetto del ticket 21 era vero sulla testa e falso sulla coda.
- **E il numero che fa riflettere**: la ricetta «tutto» (F) **massimizza la recall globale (+1,913 al @500) ed e' la PEGGIORE sulla coda (-2,341)**. La metrica che il prodotto dichiara di volere e' quella che le aggiunte peggiorano.

**Status originale**: `ready-for-agent` · **Type**: `research` · **Blocked by**: nessuno (era bloccata da una decisione sbagliata) · **Aperto**: 13/10/2026

## Da dove nasce: il ticket 21 ha deciso sulla metrica sbagliata

Il ticket 21 ha scelto **R1 — film = CF + TV(0,5), serie = CFst + B + TV(0,5)** — misurando la **recall globale**: 2,89 → 3,27 al @10, 18,94 → 20,15 al @100.

Poi `21-bis-coda.py` ha misurato le **tre** metriche insieme, e il quadro cambia segno:

| differenza R1 − R0 | @10 | @100 | @500 |
|---|---|---|---|
| **GLOBALE** | **+0,385** | **+1,210** | **+1,173** |
| **MEZZO+CODA** | **−0,151** | **−0,994** | **−1,834** |
| auto-informazione | +0,264 | +0,813 | +0,722 |

**TV migliora la testa del catalogo e peggiora la coda.** E il prodotto, per dichiarazione dell'utente, vuole **l'azzeccato non banale**: la metrica che conta è mezzo+coda, non la globale.

## E non è un caso isolato: è il **quarto** parametro di fila

| cosa | globale | mezzo+coda |
|---|---|---|
| **LIST (0,5)** (ticket 18) | +0,52 al @100 | **−1,34 al @500** |
| **TV (0,5)** (ticket 21-bis) | +1,21 al @100 | **−0,99 al @100** |
| **decadimento** (ticket 15) | +0,13 al @100 | +0,17 al @100 ✓ |
| **gating** (ticket 16) | +0,25 al @100 | −0,57 al @100 ✗ |

**Tre aggiunte su quattro migliorano la testa e peggiorano la coda.** E il ticket 04 ha mostrato la stessa cosa dal lato del tempo: il grafo onesto perde di più al @2000 che al @10.

**La spiegazione è semplice e va scritta**: ogni componente che porta **comportamento** — co-visione, liste, comportamento degli altri — porta con sé il **gusto della maggioranza**, che è il gusto popolare. Aggiungerlo alza la recall globale (che è dominata dalla testa) e abbassa quella della coda, perché sposta la massa là dove il comportamento è denso.

**Questo non è un difetto dell'implementazione: è una proprietà dei dati che il prodotto non può ignorare.**

## Cosa deve consegnare il ticket

**La ricetta di riferimento scelta sulla metrica che il prodotto dichiara.** Concretamente:

1. **Rimisurare tutte le candidate del ticket 21 con le tre metriche insieme**, non solo la globale: R0, R1, R2, e le varianti con sole liste / solo decadimento / solo gating.
2. **Applicare la regola del 21 alla coda**: invarianza cross-dominio e minimax su **mezzo+coda**, non sulla globale.
3. **Se nessuna aggiunta migliora la coda, dichiararlo** — e allora la ricetta di riferimento resta **R0 (la MINIMA)** e il lavoro si sposta su *come* usare i componenti di comportamento senza far salire la testa: per esempio un peso **differenziato in uscita** (che non si applichi ai titoli già popolari), che è la stessa correzione che serve alle liste.
4. **Rimisurare anche il banco Trakt con le tre metriche**: il +2,19 al @10 della co-visione sul catalogo serie **è una recall globale** e non è mai stato stratificato. Il guadagno più celebrato della fase potrebbe avere la stessa struttura.
5. **Aggiornare il ticket 21 e il map** col verdetto corretto.

## Criteri di accettazione

- [ ] la tabella delle candidate con **globale / mezzo+coda / auto-informazione** affiancate, non in report separati
- [ ] la ricetta di riferimento dichiarata **sulla coda**, con la regola scritta prima dei numeri
- [ ] **il banco Trakt stratificato**: il +2,19 della co-visione sul catalogo serie regge sulla coda?
- [ ] se la coda non migliora con nessuna aggiunta: **il negativo è dichiarato** e R0 resta la ricetta
- [ ] il ticket 21 e il map portano il verdetto corretto, non quello vecchio
- [ ] il numero di parametri liberi non cresce (quattro)

## Cautela dichiarata

**Questo ticket è nato da un errore mio, ed è la seconda volta nella stessa fase che misuro una cosa e ne decido un'altra.** La prima è stata il criterio di conservazione del ticket 09 (i «vicini forti per peso» non sono i vicini significativi). Qui è peggio: **ho scelto la ricetta di riferimento sulla metrica che il prodotto ha dichiarato di non volere** — e me ne sono accorto solo perché ho deciso di misurare la coda dopo aver chiuso tutti i ticket.

**La regola che ne esce, e che vale più della ricetta**: in questa fase ogni decisione va presa con le **tre metriche affiancate**. Una sola metrica, qualunque sia, ha già premiato quattro volte la cosa sbagliata.
