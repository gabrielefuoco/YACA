# la tenuta e il costo

**Status**: `ready-for-agent`
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
