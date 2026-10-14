# potatura al nucleo

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 04

La potatura al nucleo: espellere i parassiti senza dissolvere le bolle.

**Perche' serve, dato che la chiusura triangolare gia' taglia i ponti**: per l'**effetto catena** di
Leiden. Leiden ottimizza una funzione additiva sugli archi e non ha il concetto di centroide: se A
condivide il regista con B, B un attore con C, e C due keyword con D, finiscono tutti nella stessa
bolla anche se A e D non hanno niente in comune. E' l'effetto che genera i minestroni da 15-30
titoli.

**L'algoritmo**
1. Per ogni bolla trovata da Leiden, identificare il **Nucleo**: i 3-5 titoli con la massima somma di
   pesi interni.
2. Per ogni membro, calcolare l'affinita' media verso quei 3-5 titoli del Nucleo.
3. Se un membro ha affinita' **zero** verso il Nucleo (era entrato solo attaccato a un nodo
   periferico), staccarlo e riassegnarlo alla bolla il cui Nucleo ha la massima affinita' diretta con
   lui.
4. **Differenza esplicita dal ticket 08**: nell'08 avevo **sciolto intere bolle** guardando la purezza
   esterna, che puniva gli anime perche' parlavano con altri anime. Qui **non si scioglie nessuna
   bolla**: si verifica solo che ogni membro parli col centro della propria.

**Criterio di chiusura**
- Banco sonda: le nicchie delicate (iyashikei, seinen, dorama) **non devono perdere membri veri**, e i
  minestroni devono perdere i parassiti. Contare quanti titoli vengono espulsi e da quante bolle.

---

## Esito

A V4 non cambia quasi niente (1.413 bolle prima e dopo, 1.302 -> 1.295 con >=15): l'effetto catena non e' misurabile a questo stadio. Diventa aggressiva solo dopo il consenso (9.452 titoli espulsi a V6). Non ha mai rotto una nicchia: era il requisito.
