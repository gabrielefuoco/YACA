# la tenuta e il costo

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 04

Inserire un titolo non deve rompere niente, e deve costare poco.

**Cosa fare**
1. **La tenuta**: il banco sonda di `bolle-nitrile` prima e dopo l'inserimento di 50 titoli nuovi.
   Le bolle esistenti cambiano? L'intruso resta fuori?
2. **Il costo**: quanti secondi per proiettare un titolo, quanti per 100, quanti per 1.000. E quanto
   pesa in memoria il modello salvato.
3. **La tenuta della partizione**: i titoli nuovi si agganciano a bolle esistenti (via potatura al
   nucleo) o servono bolle nuove? Le bolle di 114-162 titoli della partizione V7 reggono altri
   ingressi?
4. **Cosa succede fra sei mesi**: con 10.000 titoli nuovi dentro, la partizione va rifatta o no?

**Criterio di chiusura**
- I tempi sono misurati, non stimati.
- La risposta alla domanda "si aggancia o crea una bolla" e' scritta con un numero.

---

## Esito

**Il costo e' misurato, la tenuta no** — e la ragione e' scritta. Report in `ricerche/05-costo.md`.

**Il costo**: caricamento 16 s una volta sola, **7,7 ms per titolo** (1.000 in 7,7 s, 10.000 in
1,3 min), modello 3,8 MB su disco, vocabolari 0,3 MB.

**La tenuta non e' misurabile oggi**: l'inserimento nel grafo vuol dire aggiungere archi, e gli
archi strutturali del ticket 03 mescolano film e serie. Inserirli oggi significherebbe misurare il
danno di una via che sappiamo sbagliata.

**Cosa si sa gia'**: il titolo **si aggancia a una bolla esistente** (il quartiere giusto 600/600),
non ne crea una — e la potatura al nucleo e' il meccanismo che lo aggancia senza gonfiare.

**E il numero che orienta**: 10.000 titoli nuovi sono il **15% del catalogo** (66.259). Non e' una
perturbazione: la partizione **va rifatta periodicamente**, non aggiornata per sempre.

**Le due condizioni perche' la tenuta si possa misurare**: il vincolo di medium (ticket 03) e il
secondo studente per le serie (ticket 04).
