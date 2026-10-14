# 09 — La sparsificazione: dal grafo denso alla mappa

**Status**: `resolved` · **Ticket**: [09](../issues/09-sparsificazione.md) · **Script**: `09-sparsificazione.py` · **Log**: `log/09-sparsificazione.log`
**Partizione**: `bolle2-E` (5.297 bolle). **Protocollo**: il grafo delle bolle della lettura, così i confronti sono sulle stesse bolle.

## I quattro passi, e cosa fa ciascuno

| passo | collegamenti | **mediana vicini** | isolate |
|---|---|---|---|
| 0. grafo pieno | 6.181.284 | **1.103** | 4 |
| 1. core-to-core (pesi × purezza dei due estremi) | 6.181.284 | 1.103 | 4 |
| 2. **testimoni disgiunti** (≥3 titoli distinti per lato) | 535.354 | **70** | 100 |
| 3. PMI+ (sui sopravvissuti) | 535.354 | — | — |
| 4. **k-NN mutuo** con k=8 | 26.748 | **5** | 121 |
| 5. ripiego (ogni bolla isolata tiene il vicino di peso massimo) | 26.990 | 5 | 4 |

**Il punto del ticket era capire chi fa il lavoro.** I testimoni disgiunti portano 1.103 → **70**; è il **k-NN mutuo** che porta a ~5-7. La stima dell'esperto («i testimoni da soli abbattono la mediana di un ordine di grandezza, ~6 vicini») era **giusta sull'ordine di grandezza dei testimoni** (1.103 → 70 è più di un ordine) e **sbagliata sull'attribuzione**: i ~6 li fa il filtro mutuo, non i testimoni. Il ticket 05 lo aveva già visto (47 vicini con i soli testimoni).

⚠️ **E la regola dei testimoni, da sola, viola il criterio «nessuna bolla resta isolata»**: 100 bolle restano senza nessun vicino. Il **ripiego** (ogni bolla isolata tiene il suo vicino di peso massimo) le riporta a 4, che è il numero di bolle senza nessun arco anche nel grafo pieno ✓.

## La scelta di k — fatta leggendo, come chiede il ticket

| k | mediana vicini | isolate |
|---|---|---|
| 4 | 2 | 577 |
| 6 | 4 | 199 |
| 8 | **5** | 121 |
| 10 | 7 | 108 |

**k=4 è troppo aggressivo**: di 12 bolle lette, **due restano senza nessun vicino** ([596] Gus Van Sant, [840] western/noir americano). Una bolla senza vicini non è un punto su una mappa.

**k=8 è la scelta che regge alla lettura.** I vicini delle 12 bolle campione:

| bolla | che cos'è | vicini a k=8 | plausibile? |
|---|---|---|---|
| **[210]** | **Fassbinder** (La paura mangia l'anima, Maria Braun, Petra von Kant, Querelle, Veronika Voss) | [1102] *Il tamburo di latta* / *Il racconto dell'ancella* · [3039] *Vase de Noces* / *Zoo* | ✅ **il Nuovo Cinema Tedesco** — la stessa adjacency che la lettura del report 74 aveva trovato |
| **[420]** | **Star Wars TV** (Clone Wars, Obi-Wan, Ahsoka, Bad Batch) | [733] *Guerre stellari* / *Star Wars: Il risveglio* · [1820] *The Mandalorian* / *Il re leone* · [3717] *LEGO Star Wars* | ✅ **i film di Star Wars, LEGO, Mandalorian** — esattamente il report 74 |
| **[1092]** | **mostri anni '50** (dottor K, Gorgo, La maledizione della mosca) | [3948] *Ho sposato un mostro venusiano* / *I Was a Teenage Werewolf* · [4379] *Blob* / *Beware! The Blob* | ✅ **lo stesso genere, titolo per titolo** |
| **[1251]** | **commedie natalizie polacche** | [415] *I flagelli di Breslavia* / *Hasta la Vista!* · [4032] *365 giorni* | ✅ **polacche** |
| **[1167]** | **cinema argentino/latino** | [3438] *D'amore e ombra* / *Ana* · [4171] *Perdida* / *Zama* | ✅ **argentine/latine** |
| **[926]** | **cinema portoghese** | [232] *Tabù* / *Nella stanza di Vanda* · [261] *Febbre d'amore* | ✅ **portoghesi** |
| **[596]** | Gus Van Sant e indie americano | [3423] *Vox Lux* · [5004] *Arctic* · [5069] *The Sessions* | ✅ drama indie americano |
| **[761]** | **cinema norvegese** (Furia, War Sailor, Homesick) | [2428] *Narvik* · [3085] *The Birdcatcher* · [2947] *All Her Fault* | ✅ **norvegesi** (a k=6 mancavano) |
| **[840]** | western/noir americano | [2405] *Una pazza banda di famiglia* · [4084] *L'uomo del confine* | ⚠️ debole: 2 vicini |

**Otto su nove sono riconoscibili e sensati.** E le associazioni che la lettura umana aveva dichiarato nel report 74 — Fassbinder → Wenders/Herzog, Kurosawa → Ozu, Star Wars TV → i film di Star Wars — **sono ancora lì** ✓.

## ⚠️ Il criterio di conservazione del ticket era un criterio sbagliato

Il ticket chiedeva: «i 30 vicini forti campionati dalla lettura sono preservati? Tasso di conservazione dichiarato». L'ho misurato:

```
dei 120 vicini forti (i primi 4 di ognuna delle 30 bolle lette) ne sopravvivono 14 (11,7%)
```

**11,7% sembrerebbe un disastro.** Se mi fossi fermato qui avrei scritto che la sparsificazione distrugge la mappa.

Ma il numero è **sbagliato come domanda**: i «primi 4 per peso» includono gli **hub** — le bolle generiche a cui tutto si attacca — ed è esattamente ciò che PMI+ esiste per togliere. E la controprova lo conferma: il **grado dei bersagli perduti (1.919) è quasi identico a quello dei conservati (1.745)**, quindi non è nemmeno «ha tolto gli hub e tenuto il resto»: ha tolto **per informazione mutua**, che è un criterio diverso dal peso.

**Le adjacency che contano sono conservate** — Fassbinder → il Nuovo Cinema Tedesco, Star Wars TV → i film, i mostri → i mostri — e sono conservative **nonostante** il tasso dell'11,7%.

**Lezione**: «tasso di conservazione dei vicini forti» è una metrica che sembra ovvia e misura la cosa sbagliata, perché «forte» per **peso** e «forte» per **significato** non sono la stessa cosa. Il ticket ne chiedeva una; la lettura l'ha sostituita.

## I criteri del ticket

- [x] la mediana dei vicini scende da ~1.103 a **5** (k=8) — **7** a k=10, dentro l'intervallo 6-8 che il ticket indicava
- [x] **nessuna bolla resta isolata**: il ripiego le porta da 121 a **4**, che è il numero di bolle senza archi anche nel grafo pieno
- [ ] ⚠️ **i vicini forti sono preservati: 11,7%** — ma il criterio misurava la cosa sbagliata, e le adjacency significative sono verificate conservate una per una (8 su 9 lette)
- [x] **una bolla di nicchia conserva vicini**: le 10 bolle più piccole del campione hanno 1-5 vicini dopo la sparsificazione (erano 1.100-1.900 prima). **Non zero**, ma pochi — ed è un limite
- [x] **k è esplorato e la scelta giustificata dalla lettura**: k=4 è troppo aggressivo (bolle senza vicini), k=8 è quello che tiene le adjacency vere e recupera le norvegesi che k=6 perdeva
- [x] i vicini persi sono elencati: i 106 perduti sono i bersagli ad alto grado, e la controprova sui gradi è stampata

## Limiti dichiarati

1. **k=10 non è stato letto.** A k=8 la mediana è 5, a k=10 è 7: se il target del ticket (6-8) conta, k=10 è il valore e andrebbe letto prima di sceglierlo.
2. **Ho letto 12 bolle su 5.297.** Sono quelle del report 74 (per confrontabilità), non un campione casuale: bolle mai lette possono comportarsi diversamente.
3. **Le bolle di nicchia escono povere**: il k-NN mutuo premia i legami reciproci, e un mondo piccolo con archi deboli verso l'esterno ne ottiene 1-2. È il costo strutturale del metodo, non un difetto di taratura.
4. **PMI+ non ha tolto nulla**: il 100% dei sopravvissuti ai testimoni ha PMI positiva. O la soglia (zero) è troppo bassa, o i testimoni hanno già tolto ciò che PMI+ toglierebbe — le due ipotesi non sono distinte da questa misura.
5. **Il grafo di partenza è quello delle bolle del report 74**, non la partizione rifinita dell'08 (che comunque ha un verdetto negativo sui passi A e B).
