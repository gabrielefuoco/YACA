# LIST nelle bolle

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 07

`LIST` dentro la costruzione delle bolle — mai provato.

**Il fatto.** Nel ticket 18 di `grafo-servibile` ho costruito `nuovo-LIST.npz` dalle 540 liste umane
di Trakt e ho verificato che le coppie hanno coerenza comportamentale **6,9x il caso**. Poi l'ho
provato **nel recupero**, dove abbassava la coda perche' copre solo il 14,8% del catalogo.
**Nelle bolle non l'ho mai provato.**

**Perche' qui il difetto non c'e'**: nel recupero, un componente che copre il 14,8% del catalogo
agisce da attrattore ergodico e sbilancia la camminata. Nella costruzione delle bolle, lo shrinkage
sul denominatore (`d + tau`, ticket 03) **non penalizza l'85% dei titoli non coperti**: un titolo
senza archi LIST semplicemente non riceve quel pezzo.

E la ragione per cui dovrebbe funzionare: **le liste Trakt sono letteralmente cluster tematici
curati a mano da appassionati** — sottogeneri anime, cicli di registi, movimenti nazionali. E'
esattamente il segnale che stiamo cercando di ricostruire con le keyword.

**Fix**: aggiungere `LIST: 1` alla miscela delle bolle. Opzionalmente `Kpari` a peso 0.5.

**Criterio di chiusura**
- Banco sonda: le nicchie **curate** devono consolidarsi. Attenzione al rischio opposto: una lista
  curata puo' essere **essa stessa un minestrone** ("Film da vedere prima di morire"): verificarlo
  leggendo le liste che entrano di piu'.

---

## Esito

IL RISULTATO MIGLIORE DEL GIRO. 1.617 bolle, mediana 34. Le cinque minestrone diventano film noir americano (114), fantasy anni '80 (37), commedia romantica (53), commedia sexy all'italiana (162). Le nicchie rotte dal ticket 02 guariscono. Tarkovsky diventa cinema d'autore europeo. 18 sentinelle su 20 leggono un mondo nominabile. MA i film e le serie di Star Wars restano in DUE bolle separate: il ponte cross-medium non viene dalle liste.
