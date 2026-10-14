# maschera genere e COLL

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 05

La maschera di coerenza su DIR/CAST, e COLL da 1 a 3.

**Il difetto.** Un regista o un attore feticcio e' un collante fortissimo, **tranne quando gira
un'opera fuori dal suo mondo**: Scorsese che gira Hugo Cabret, un regista horror che gira una
commedia su commissione. Oggi l'arco DIR o CAST incolla il film "traditore" nella bolla dell'autore
con la stessa forza dei film canonici.
E all'opposto: in `BASE` (`07-componenti.py:290`) **COLL** (la saga/franchise TMDB) pesa **1 su
8 = 0,125**, troppo poco per impedire che una saga si divida quando gli attori cambiano tra un
capitolo e l'altro.

**Fix**
1. **Maschera di genere su DIR/CAST**: se due film dello stesso regista o attore condividono almeno
   un genere **specifico** (escludendo il genere ombrello drama) o almeno una keyword, l'arco resta a
   peso 1.0; se hanno generi e keyword **completamente disgiunti**, l'arco scende a **0.15**. Cosi'
   un autore con due filoni opposti in carriera produce **due bolle pulite** invece di un minestrone.
2. **COLL da 1 a 3**, filtrando prima i documentari making-of con la maschera DOC gia' esistente
   (`formato.npy`).

**Criterio di chiusura**
- Banco sonda: i casi d'autore con doppio filone devono separarsi; le **saghe** non devono rompersi
  (La storia infinita 1-2-3, i casi del ticket 08).

---

## Esito

Taglia il 76,3% degli archi DIR (317.624 su 416.154) e il 39,5% di CAST. Percentuale enorme, e la lettura dice che e' benefica: e' qui che emergono i mondi veri. COLL da 1 a 3 non isolato, dichiarato.
