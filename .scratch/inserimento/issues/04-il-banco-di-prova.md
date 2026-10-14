# il banco di prova

**Status**: `ready-for-agent`
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
