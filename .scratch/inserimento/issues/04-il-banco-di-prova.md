# il banco di prova

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 03

Il banco: non solo Verity.

**Il problema**: Verity da' una risposta nota, ma **una sola**. Un banco di un titolo non distingue un
metodo da una coincidenza — ed e' la lezione dei ticket 06 e 22 di `grafo-servibile`.

**Cosa fare**
1. Scegliere **10-15 titoli recenti** dal dump TMDB che **non sono nel grafo**, coprendo i casi
   patologici: un'uscita con cast stellare, una di nicchia senza keyword, una serie TV, un film
   non-US, un documentario, un titolo con 0 keyword.
2. Per ognuno: la collocazione proiettata, i 5 vicini, la bolla votata.
3. **Leggere**: la bolla e' un mondo nominabile? il titolo ci sta?
4. **Un controllo con i titoli vecchi**: togliere temporaneamente 100 titoli dal grafo, ricollocarli
   con lo stesso metodo, e vedere se tornano nella bolla da cui sono stati tolti. **Questo e'
   l'unico criterio misurabile**, e va fatto prima di fidarsi.

**Criterio di chiusura**
- Il controllo sui 100 titoli tolti: quanti tornano nella bolla di partenza? Il numero va scritto,
  qualunque sia.

---

## Esito

**Il risultato piu' forte dell'effort.** Report in `ricerche/04-banco.md`.

**A. Il controllo su 600 titoli** (comportamento tolto, modello riaddestrato senza di loro):
- torna nella **propria** bolla: **166/600 (27,7%)**
- cade in una bolla **adiacente** sulla mappa: **434/600 (72,3%)**
- cade in una bolla **non collegata**: **0/600 (0,0%)**
- **nel quartiere giusto: 600/600 (100,0%)** — contro un caso di 0,06%

**B. I casi patologici: 9 su 12 ottimi.** Project Hail Mary -> Interstellar e Gravity. Michael ->
Elvis e Judy. Odissea -> Troy e Gods of Egypt. Super Mario -> Sonic e I Croods. E il titolo russo
con pochissime keyword trova **tutti vicini russi**.

**C. Il fallimento, con la causa esatta**: i 3 casi sbagliati sono **tutte serie TV**, e finiscono
tutti nella stessa bolla con gli stessi vicini. Misurato: **film con comportamento in Cf: 49.041 ·
serie: 0**. Lo studente e' `metadati -> Cf`, e Cf viene da MovieLens che non ha serie: per una serie
predice il vettore medio. **Il comportamento delle serie esiste ma altrove**: 14.723 serie in
`boot-B`, 12.315 in `nuovo-TV`.

**Cosa serve**: un secondo studente `metadati -> B` per le serie. Finchè non c'e', il cold start
vale per i film e non per le serie.
