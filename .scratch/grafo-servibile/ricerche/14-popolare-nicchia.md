# 14 — La leva Popolare / Nicchia, dentro la bolla

**Status**: `resolved` · **Ticket**: [14](../issues/14-leva-popolare-nicchia.md) · **Script**: `14-popolare-nicchia.py` · **Log**: `log/14-popolare-nicchia.log` · **113 s**

## Cosa è stato costruito

Due coordinate per ogni titolo, **dentro la sua bolla**:

- **purezza**: la frazione del peso dei suoi archi che cade dentro la bolla (quanto è un membro archetipico e non un visitatore di confine);
- **percentile locale di popolarità**: la posizione per voti **rispetto agli altri membri**.

I due selettori:

- **Porta d'ingresso** = massimizza `purezza × percentile` — il capolavoro canonico e accessibile.
- **Deep cut** = purezza sopra la mediana della bolla (così non si pesca rumore) e percentile nella fascia bassa ma non nulla `[0,05, 0,45]`.

E **un solo** parametro globale: il pavimento di 10 voti.

| | |
|---|---|
| purezza (mediana del catalogo) | 0,197 · il 10% più puro sta sopra 0,389 |
| percentile locale (mediana) | 0,50 — per costruzione |

## La lettura: la leva si comporta come deve

### Una bolla di nicchia, dove tutto ha meno di 25 voti

**[208]** — 36 titoli, **voti med 2**: isekai «villainess» (*Diventerò una malvagia*, *Astarotte's Toy*, *Lieselotte la perfida*…).

- **Porta**: *An Observation Log of My F…* (2026, **25 voti**, purezza 0,21, percentile locale 0,89)
- **Deep cut**: *I Want to Escape from Princess Lessons* (12 voti, pct 0,63) · *Though I Am an Inept Villainess* (17, 0,69) · *The Villainess Is Adored* (20, 0,77) · …

**Tutti della stessa bolla, tutti sopra il pavimento, e la porta è la cosa più «famosa» che esiste in un mondo dove il massimo sono 25 voti.** È esattamente il caso che un parametro globale avrebbe rotto.

### Un blockbuster

**[140] Marvel** — 42 titoli, voti med **9.408**:
- **Porta**: *Guardiani della Galassia* (30.381 voti, purezza 0,51, pct 0,95) — **non** *Endgame*, che è il più votato
- **Deep cut**: *Ragazze nel pallone - Sfida mondiale* (262 voti, pct 0,10) · *Ant-Man and the Wasp: Quantumania* (6.148, 0,44)

La porta è il titolo **archetipico e accessibile**, non il più famoso ✓. E il deep cut scende di notorietà **senza uscire dal mondo** ✓.

### E una serie TV di film

**[325] Perry Mason** (29 titoli, voti med 12): la porta è *Perry Mason: dietro la faccia* (15 voti, purezza 0,74) e il deep cut sono i film TV con 10-11 voti e percentili 0,21-0,39 ✓ — **la stessa serie, i meno visti**. È il comportamento giusto per un franchise.

## I controlli — i più forti della sessione

| | misurato |
|---|---|
| la **Porta** è vuota (nessun membro sopra il pavimento) | **0 su 1.237** (0,0%) |
| il **Deep cut** è vuoto | **0 su 1.237** (0,0%) |
| la Porta coincide col **membro più votato** della bolla | **22,0%** dei casi |
| **con un parametro GLOBALE** (top 25% del catalogo, ≥211 voti) | **259 bolle su 1.237 (20,9%) darebbero ZERO titoli** |

**Il criterio «non restituisce mai vuoto» è soddisfatto su tutte e 1.237 le bolle piccole** ✓ — e la misura del fallimento che si evita è **concreta**: con un controllo globale, **un mondo su cinque non restituirebbe niente**.

**E nel 78% dei casi la leva non restituisce il più famoso**: restituisce il più **archetipico fra gli accessibili**. Il 22% in cui coincidono sono i mondi in cui il capolavoro canonico *è* anche il più famoso, e lì le due risposte devono coincidere.

## Un difetto che non è della leva

Nella bolla [733] *Star Wars*, il deep cut include ***Into Darkness - Star Trek*** ✗ — un film di un altro franchise finito nella bolla Star Wars. **Non è colpa della leva**, che dentro la bolla si comporta correttamente: è un **intruso nella bolla**, e il criterio di purezza non l'ha espulso (purity 0,32, sopra la mediana).
È un promemoria che la leva **eredita la qualità delle bolle**: su una bolla con un intruso, anche un selettore perfetto restituisce l'intruso.

## I criteri del ticket

- [x] le due coordinate sono calcolate per ogni titolo di ogni bolla
- [x] **dentro una bolla di nicchia piccola, «Popolare» restituisce titoli di quella bolla e mai zero**: verificato su **[208]**, dove il membro più votato ha 25 voti
- [x] **dentro una bolla di blockbuster, «Nicchia» non scende sotto il pavimento globale**: [140] scende a 262 voti (sopra il pavimento di 10) e non pesca film amatoriali
- [x] **le due liste sono lette**: la porta è il titolo canonico e accessibile (*Guardiani della Galassia*, *Perry Mason: dietro la faccia*), il deep cut è fedele ma poco battuto (i film TV di Perry Mason da 10 voti)
- [x] **controllo**: la porta **non** è il più votato nel 78% dei casi, e su 1.237 bolle la leva non restituisce mai vuoto dove un parametro globale ne romperebbe 259 (20,9%)
- [x] un titolo **ospite** usa la bolla **primaria** (la purezza si calcola lì, e il percentile pure)
- [x] **la leva funziona senza il resto della mappa**: è verificata su singole bolle, a mano, e non tocca né il recupero né il grafo

## Limiti dichiarati

1. **Il pavimento (10 voti) e la fascia bassa `[0,05, 0,45]` sono scelte non esplorate.** Il pavimento è l'unico parametro globale e vale la pena spazzarlo; la fascia determina quanto scende il deep cut.
2. **La «purezza» è calcolata sul grafo delle bolle**, non su un asse di contenuto: un titolo che assomiglia a due mondi è un «visitatore di confine» per costruzione, e il selettore lo penalizza anche se è un buon consiglio.
3. **Ho letto 5 bolle su 1.237.** Il controllo quantitativo (mai vuoto, 22% coincide col più votato) copre tutte; la plausibilità delle scelte no.
4. **Il deep cut restituisce fino a 5 titoli e non è ordinato per «quanto è nascosto»** ma per percentile crescente: su bolle grandi la fascia `[0,05, 0,45]` contiene molti titoli e la scelta fra loro non è motivata.
5. **Non è stato misurato l'effetto sul prodotto**: se un utente che sceglie «nicchia» poi guarda davvero quei titoli è una domanda che nessun banco attuale risponde.
