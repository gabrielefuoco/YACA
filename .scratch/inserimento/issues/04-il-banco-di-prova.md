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


---

## CORREZIONE (dal ticket 06)

**Due numeri di questo ticket erano sbagliati, e il secondo per colpa mia.**

**1. Il criterio adiacente non discrimina.** La mappa delle bolle ha **1.037.438 adiacenze su
1.306.536 coppie possibili: il 79,4%**. Quindi cade-in-una-bolla-adiacente accade per caso quattro
volte su cinque, e il **100% nel quartiere giusto** riportato sopra era gonfiato dal grafo denso:
il valore giusto e' 1,2 volte il caso. I criteri forti sono **la propria bolla** (27,7% per i film,
contro 0,062% di caso) e **la bolla non collegata** (0% contro 20,6% di caso).

**2. Il fallimento delle serie era un artefatto mio.** Nella Parte B la matrice dei vicini era
mascherata con `Pn = np.where(ha[:, None], Pn, 0.0)`: le righe delle serie diventavano **zero**, il
ranking cadeva sui pareggi a -9, cioe' sull'ordine degli indici di catalogo. Per questo le tre serie
ricevevano gli stessi vicini. La misura vera (ticket 06): lo studente dei film applicato alle serie
da' **2,2%** di bolle esatte, 35 volte il caso. **Debole, non rotto.**

**Cosa resta di questo ticket**: la collocazione dei film e' **27,7%** di bolle esatte (450 volte il
caso) e **0%** di bolle non collegate (contro il 20,6%). Quel risultato tiene. La parte sulle serie
va letta nel ticket 06, che mostra che sono deboli con entrambi gli studenti — e che la strada e'
l'appoggio film del ticket 03-bis.