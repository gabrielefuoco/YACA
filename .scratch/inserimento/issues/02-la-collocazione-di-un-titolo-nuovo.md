# la collocazione di un titolo nuovo

**Status**: `ready-for-agent`
**Type**: `task`
**Blocked by**: 01

Dove va un titolo appena uscito: proiettarlo e cercargli i vicini.

**Cosa fare**
1. Metadati del titolo (dal dump TMDB, o dall'API per i titoli che il dump non ha).
2. `v = proietta(metadati)` — il suo vettore nello spazio del comportamento.
3. I vicini in quello spazio: i titoli piu' simili fra i 66.259.
4. Voto: la bolla che riceve piu' vicini (nella partizione `bolle-nitrile-V7.npy`).
5. **Il confronto coi canali strutturali**: keyword, cast, regia, generi. I due metodi devono
   concordare, o va detto perche' no.

**Criterio di chiusura**
- Per Verity: il vicinato proiettato deve contenere _Quello che non so di lei_ e almeno due film di
  Michael Showalter. Se non li contiene, il ticket si chiude **negativo** e lo si dichiara.
- Il confronto proiettato / strutturale e' scritto con i numeri, non a parole.
