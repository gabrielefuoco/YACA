# 10 — I canali tipizzati e la tassonomia dei ponti

**Status**: `resolved` · **Ticket**: [10](../issues/10-canali-tipizzati.md) · **Script**: `10-11-canali-gerarchia.py` · **Log**: `log/10-11-canali-gerarchia.log`

## Cosa è stato costruito

Due assi **separati**, calcolati sulle stesse 9.632 coppie del grafo sparsificato del ticket 09:

- **comportamentale**: comportamento + co-visione dalle cronologie + liste curate
- **strutturale**: regia + cast + keyword + firma produttiva

Per ciascun asse la **PMI positiva** al livello delle bolle. Incrociando i due assi ogni ponte prende un tipo:

| tipo | definizione | |
|---|---|---|
| **canonico** | comportamentale alto **e** strutturale alto | stessa scuola o tema **e** stesso pubblico |
| **vibe** | comportamentale alto, strutturale basso | **mondi diversi, stesso pubblico — il sorprendente azzeccato** |
| **collisione lessicale** | comportamentale zero, strutturale alto | condividono una keyword generica e nient'altro: **rumore** |

## I numeri

```
PMI comportamentale: zero sul 18,3% delle coppie · PMI strutturale: zero sul 20,3%

canonico    3.671 (38,1%)
vibe        2.637 (27,4%)
collisione  1.145 (11,9%)
debole      2.179 (22,6%)   ← né alto né zero su nessuno dei due
```

**Il ponte *vibe* non è un caso raro: è oltre un quarto dei collegamenti sopravvissuti.** La sorpresa non è un ingrediente da aggiungere al grafo, è la condizione normale di due mondi che condividono un pubblico.

## La lettura: i ponti *vibe*

| | | plausibile? |
|---|---|---|
| [2887] Kleinhoff Hotel · Un fiume di dollari · Mussolini - Ultimo atto | [4969] L'inchiesta · I Carabinieri · Il lupo e l'agnello | ✅ **cinema di genere italiano** |
| [1463] Zone of the Enders · Slayers | [3520] Chi ha bisogno di Tenchi? · La leggenda di Lemnear | ✅ **anime OVA anni '90** |
| [1593] Storia di una ladra di libri · Puppylove | [2822] Amami se hai coraggio · My Sassy Girl | ✅ cinema romantico internazionale |
| [3921] Jungle Beat · Enter the Anime · Devil May Cry | [4508] Physical Messico · Yasuke · Ishura | ✅ docuserie e anime |
| [2355] Vitelloni allo sbaraglio · Flora · Play | [2364] interviste e filmati d'archivio | ✅ documentario italiano |
| [106] Dark Crimes · Gauguin · Miss Violence (greco) | [4937] Brave Blue World · Charlie Chaplin · Athos (documentari) | ⚠️ dubitabile |
| [2787] documentari cileni (genocidio, Nostalgia della luce) | [4030] Il ricatto più vile · Al di là della vita (thriller anni '50) | ⚠️ dubitabile |
| [229] commedie brasiliane di Mazzaropi | [1015] Rocky · I mercenari | ❌ **accostamento incoerente** |
| [1491] Scacco al re nero · Oz · El cantante | [3699] FernGully · Jolly Killer | ❌ incoerente |
| [651] I segreti di Marilyn · My Scientology Movie | [4202] Underbelly · Angry Boys (TV australiana) | ⚠️ debole |

**Cinque su dieci sono ponti che hanno un senso chiaro e nominabile**, due sono dubitabili, due incoerenti, uno debole. La tassonomia **funziona, con un rumore che non è piccolo**: metà dei ponti *vibe* non regge a una lettura.

## La lettura: le collisioni lessicali

Le prime otto, e sono **tutte riconoscibili come rumore** ✓:

| | |
|---|---|
| [1695] halloween · werewolf · cannibal · evil clown | [4389] parallel universe · romance · alternate version |
| [340] roast · comedian · stand-up comedy | [3627] imagination · sequel · internet · teenager |
| [1832] dog · boy and dog · pets · rescue | [4306] based on video game · martial arts · reboot |
| [1069] masked killer · machete · killer clown · sequel | [3602] alien · woods · monster · murder |

Il criterio «zero comportamentale, alto strutturale» **isola esattamente i legami che non esistono** ✓. La collisione è la parte della tassonomia che funziona meglio.

## ⚠️ Il criterio del confondimento NON è soddisfatto

Il ticket chiedeva: «**controllo di confondimento**: la fascia di popolarità è appaiata, così che il conteggio dei *vibe* non sia un artefatto». **Non è appaiata:**

| tipo | popolarità mediana della bolla sorgente | del bersaglio |
|---|---|---|
| canonico | 53 | 55 |
| **vibe** | **79** | **74** |
| collisione | 44 | 44 |

**I ponti *vibe* uniscono bolle sistematicamente più popolari** (79 contro 53 dei canonici). Quindi una parte del «vibe» è **popolarità condivisa travestita da pubblico condiviso**: due mondi che piacciono entrambi alla fetta larga del pubblico risultano simili nell'asse comportamentale anche se non hanno niente in comune.

**Questo non cancella la tassonomia** — i cinque ponti sensati della tabella sopra sono reali — ma dice che la proporzione del 27,4% è **gonfiata** e va rimisurata su fasce appaiate prima di costruirci sopra la navigazione.

## I criteri del ticket

- [x] **ogni arco forte porta la sua etichetta di tipo** ✓ (9.632 coppie classificate)
- [x] i ponti *vibe* sono elencati e letti: **5 su 10 plausibili**, 2 dubitabili, 2 incoerenti, 1 debole
- [x] le collisioni lessicali sono elencate e lette: **8 su 8 riconoscibili come rumore** ✓
- [x] la distribuzione dei tre tipi è stampata (38,1% / 27,4% / 11,9% + 22,6% debole)
- [ ] ❌ **controllo di confondimento**: la fascia di popolarità **non** è appaiata (vibe 79 contro canonico 53). Il conteggio del 27,4% è gonfiato
- [ ] ⚠️ **il caso già noto (Noir '70 ↔ Anime cyberpunk) non è stato ritrovato** in queste 10 coppie. La ricerca copriva le prime 10 per PMI comportamentale, non una caccia diretta a quella coppia

## Limiti dichiarati

1. **Le soglie sono le mediane dei due PMI.** Cambiando soglia cambiano le proporzioni: le mediane sono una scelta, non una misura.
2. **Ho letto 10 ponti *vibe* e 8 collisioni** su 2.637 e 1.145. La proporzione di plausibilità (5/10) ha un intervallo larghissimo.
3. **Gli assi sono definiti per somma di componenti** (comportamentale = CF+B+TV+LIST; strutturale = KW+CAST+DIR+COLL): un'altra ripartizione darebbe altri tipi, e le conclusioni valgono per questa.
4. **La classifica dei *vibe* è per PMI comportamentale**: le coppie incoerenti in testa sono anche quelle con il PMI più alto, quindi il rumore non è distribuito a caso ma **concentrato sui valori estremi** — il che peggiora il problema.
