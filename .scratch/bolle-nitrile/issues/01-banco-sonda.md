# banco sonda

**Status**: `resolved`
**Type**: `prototype`

Il banco sonda: 20 titoli sentinella, letti prima e dopo.

**Perche' e' il primo ticket.** Gli indicatori aggregati (modularita', lambda2, conteggio, intruder
test) ci hanno tradito quattro volte su quattro: ognuno ha premiato una partizione che leggendo i
titoli era peggiore. Serve uno strumento che sia **la lettura, resa ripetibile**.

**Cosa fare**
- Scegliere **20 titoli sentinella** in quattro gruppi da cinque:
  - **minestrone**: uno per ognuna delle 5 bolle del ticket 05 (`[217, 1270, 1267, 1215, 1288]`)
  - **nicchie delicate**: i mondi che il ticket 08 aveva distrutto (iyashikei, seinen, dorama,
    telenovela, slice-of-life)
  - **autori/scuole**: Fassbinder, Kurosawa, Argento, Tarkovsky, + una scuola nazionale
  - **cross-medium e intrusi**: Star Trek Into Darkness nella bolla Star Wars, un film con la sua
    serie, una serie polacca
- Uno script che, data una partizione `.npy`, stampa per ogni sentinella **i compagni di bolla**,
  con `+`/`-` rispetto a una partizione di riferimento.
- Registrare per ogni sentinella le **tre domande di lettura**: la bolla e' un mondo nominabile?
  l'intruso se n'e' andato? la nicchia e' rimasta intera?

**Criterio di chiusura**
- Lo script gira su `bolle2-E` e su `bolle-08-rifinita` e riproduce **le letture gia' fatte a mano**
  (le 5 minestrone sono minestrone, le nicchie dell'08 sono rotte). Se non le riproduce, lo
  strumento e' sbagliato.
- I 20 titoli sono scritti nel report con la motivazione di ognuno.

---

## Esito

Lo strumento funziona e riproduce le letture a mano. Trova due patologie nuove: The Mandalorian con Il re leone ed Elf, Star Trek: Discovery con La mummia e MacGyver. Conferma che le 4 nicchie che il ticket 08 di grafo-servibile aveva dissolto erano perfette.
