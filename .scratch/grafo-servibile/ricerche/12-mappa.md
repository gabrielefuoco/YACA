# 12 — La mappa: otto vicini tipizzati per bolla

**Status**: `resolved` · **Ticket**: [12](../issues/12-mappa-otto-vicini.md) · **Script**: `12-mappa.py` · **Log**: `log/12-mappa.log`
**Base**: il **k-NN diretto simmetrizzato** del ticket 23 — l'unica variante che dava poche componenti, mediana 8 e 6/6 delle adjacency verificate.

## La base è connessa

```
base (k-NN diretto k=8 simmetrizzato): 62.214 archi · 1 componente
bolle a maggioranza SERIE: 912 · a maggioranza FILM: 4.385
```

**Una sola componente connessa** ✓ — il problema che il ticket 11 aveva rivelato è risolto alla radice. E la sproporzione fra i due cataloghi (912 bolle a maggioranza serie contro 4.385 film) spiega in anticipo perché lo slot cross-medium sarà il più difficile da riempire.

## Gli otto slot: si riempiono tutti

| | |
|---|---|
| slot riempiti | mediana **8** · min 8 · max 8 |
| bolle con 8 slot | **5.297 su 5.297 (100%)** |
| bolle senza nessun vicino | **0** |
| ripartizione | canonico 28.624 · vibe 10.594 · cross-medium 3.158 |

## ⚠️ Ma il ponte cross-medium non si può garantire per tutte

| | |
|---|---|
| bolle con **≥2** slot cross-medium | **1.026 (19,4%)** |
| bolle con **0** slot cross-medium | **3.165 (59,8%)** |

Il criterio del ticket — «ogni bolla ha ≥2 vicini cross-medium» — **non è soddisfatto**, e non per un difetto del codice: ci sono **912 bolle a maggioranza serie** contro 4.385 film, quindi per una bolla film ci sono pochissime bolle serie fra cui scegliere, e dopo k=8 vicini spesso non ce n'è nessuna.

**Il numero da portare via**: **il ponte film→serie non si può garantire come quota quando il grafo ha cinque bolle film per ogni bolla serie.** Va o garantito a livello di catalogo servito (riservando slot nella lista finale, non nel grafo), o accettato come «dove esiste».

## ✅ La lettura: la mappa a 8 slot è molto meglio della top-4

Le sei adjacency verificate del ticket 09 sono **tutte nella mappa**, con il tipo giusto:

| | tipo |
|---|---|
| Fassbinder [210] → *Il tamburo di latta* [1102] | canonico ✓ |
| Star Wars TV [420] → i film [733] | canonico ✓ |
| mostri anni '50 [1092] → *I Was a Teenage Werewolf* [3948] | canonico ✓ |
| polacche [1251] → polacche [415] | canonico ✓ |
| argentine [1167] → argentine [4171] | canonico ✓ |
| norvegesi [761] → norvegesi [2428] | **cross-medium** ✓ |

### [210] Fassbinder — 7 slot su 8 sono cinema tedesco/europeo d'autore

| | |
|---|---|
| canonico | [1102] *Il tamburo di latta* · world war ii ✓ |
| canonico | [1486] **berlin** · adolf hitler · satire (*Mein Führer*) ✓ |
| canonico | [1242] black and white · **france** (*La Maman et la Putain*) ✓ |
| canonico | [2823] amnesia · **antisemitism** ✓ |
| **vibe** | [3251] monster · tentacle · depressing (*Possession*) ✓ |
| vibe | [56] south america · science documentary ✗ **dubitabile** |
| canonico | [2819] **east friesland** · comedian (*Otto - Der Film*) ✓ |
| canonico | [1336] **bavaria · germany · austria** (*The Keeper*) ✓ |

**Sette su otto.** Il mondo di Fassbinder adesso ha intorno il Nuovo Cinema Tedesco, la satira tedesca, il cinema d'autore europeo in bianco e nero, e *Possession* come salto *vibe* — che è esattamente il tipo di accostamento sorprendente ma non casuale che il prodotto cerca.

### [1092] mostri anni '50 — 8 slot su 8

[3948] *Ho sposato un mostro venusiano* / *I Was a Teenage Werewolf* · [2174] murder · teenager · astronaut · [458] film noir · east side kids · police detective · [2093] murder · monster · alien · [4987] *The Amazing Mr. X* · [2381] **b movie** · murder · marijuana · [310] tarzan · jungle · chimpanzee · [759] scientist · black and white · monster (*Il mostro della laguna nera*)

**Otto su otto**, e non uno solo generico: il bubble era «dottor K, Gorgo, La maledizione della mosca», e adesso ha intorno il cinema di serie B americano degli anni '50 titolo per titolo.

### [1251] commedie natalizie polacche — il cross-medium funziona dove serve

| | |
|---|---|
| canonico | [415] **poland** · independence · biography ✓ |
| canonico | [1228] porno · heist (*Seksmisja*) ✓ **commedia polacca** |
| canonico | [1230] **polish history** · world war ii ✓ |
| canonico | [1602] woman director · new identity ✓ |
| vibe | [3684] private detective · satellite ✓ |
| vibe | [1613] **warsaw, poland** · warsaw uprising ✓ |
| **cross-medium** | [26] based on true story · lgbt · prison (*Żeby nie było śladów*) ✓✓ **una serie polacca** |
| canonico | [1254] biography · sports · incest ✓ |

**Lo slot cross-medium ha fatto esattamente il suo lavoro**: a una bolla di commedie polacche ha dato una **serie polacca** ✓✓. È la promessa del prodotto — «a chi guarda film polacchi arriva una serie polacca» — realizzata dentro il grafo.

## I criteri del ticket

- [x] **ogni bolla ha 8 vicini tipizzati** ✓ 100% delle 5.297, min 8, max 8
- [ ] ⚠️ **ogni bolla ha ≥2 vicini cross-medium — o il fallimento è contato e dichiarato**: **fallisce su 59,8%** delle bolle, e la causa è strutturale (4.385 bolle film contro 912 serie)
- [x] **nessuna bolla è isolata e nessuna ha uno slot canonico vuoto** ✓ (0 isolate, tutti gli slot pieni)
- [x] l'adiacenza è scritta come **documento sfogliabile**: 30 bolle con gli 8 vicini tipizzati, nel log
- [x] **la lettura: 2 bolle su 2 sono ottime** (Fassbinder 7/8, mostri '50 8/8) e il cross-medium della bolla polacca è centrato
- [x] la quota cross-medium è garantita **dal contenuto dove esiste** (la bolla polacca riceve una serie polacca) e **contata dove non esiste** (59,8%)

## Limiti dichiarati

1. **Ho letto 3 bolle su 30 scritte.** La qualità media della mappa non è misurata: i tre letti sono i casi già noti (scelti perché verificabili), non un campione casuale.
2. **Lo slot cross-medium riempie 3.158 volte su 5.297 bolle**, cioè in media 0,6 slot per bolla: la quota «2» è raggiunta solo dal 19,4%. **Il ponte va spostato nel catalogo servito**, dove può essere garantito per lista.
3. **Il tipo è assegnato con una priorità** (prima i canonici, poi i vibe, poi i cross-medium): una bolla che è insieme canonica e cross-medium conta come canonica. La ripartizione 28.624/10.594/3.158 riflette la priorità, non la natura degli archi.
4. **Il tipo non distingue «cross-medium» da «vibe»**: [761] norvegesi è finito come cross-medium, ma è probabilmente anche un vibe. I tipi non sono mutuamente esclusivi.
5. **La base è a k=8 sul punteggio combinato** dei due PMI: un'altra combinazione (somma pesata, prodotto) darebbe un vicinato diverso.
