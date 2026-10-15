# Esiti — la trama come arco, e le bolle più piccole

`15/10/2026` · effort `.scratch/eterogeneo/` · lettura manuale di 100 bolle e 100 inserimenti

L'istruzione era: *«continua a cercare, poi prova a vedere se con bolle più piccole la situazione un
po' migliora»* e *«non commettere l'errore di affidarti solo a metriche ma guarda tu stesso i
risultati»*. Il risultato è che **guardare ha cambiato le conclusioni**, come era già successo cinque
volte oggi.

---

## 1. Il componente di trama, e V10

Gli embedding (`qwen3-embedding:0.6b`, payload **«titolo. trama»**) diventano un **tipo di arco**:
k-NN a blocchi, top-30, soglia 0,30, simmetrizzazione. **1.648.356 archi in 13 secondi**, grado mediano
30 — la forma di CAST.

```
Toy Story → Toy Story 3 (0,858) · Toy Story 2 (0,843) · Toy Story 4 (0,754)
```

V10 (la ricetta di V8 + il componente a peso 1,0): 1.783 bolle, 503 s. **La coerenza intra-cluster
sale da +0,653 a +0,803.**

## 2. E poi le bolle più piccole: RB 200

| | V8 (RB 100) | V10 (RB 100) | **V10 (RB 200)** |
|---|---|---|---|
| bolle | 1.625 | 1.783 | **2.838** |
| mediana | 33 | 29 | **16** |
| la più grossa | 552 | 543 | **341** |
| **coerenza intra-cluster (PMI mediana)** | +0,653 | +0,803 | **+0,944** |
| bolle a PMI negativa | 294/1.467 (20,0%) | 286/1.596 (17,9%) | 296/1.954 (**15,1%**) |

**La coerenza sale del 44%** rispetto a V8, e la mega-bolla da 543 titoli scende a 341.

E **il ticket 09 di `bolle-nitrile` che diceva «RB 200 frantuma» è smentito**: lo diceva su una
partizione senza il componente di trama e con le metriche vecchie. 2.838 bolle con mediana 16 e una
coerenza molto più alta non sono una frantumazione.

## 3. La collocazione, guardata: RB 200 vince

La lettura di 100 uscite 2024+ con ≥20 voti, **coi centroidi ricostruiti sulla stessa partizione**
(vedi §5) e coi membri di quella partizione.

**Dove RB 200 è nettamente meglio:**

| titolo nuovo | RB 100 | **RB 200** |
|---|---|---|
| Deadpool & Wolverine | Marvel generico (32 tit.) | **Deadpool ×4** (5 tit.) |
| Furiosa | Interstellar, The Martian | **Mad Max: Fury Road, Interceptor ×2, Mad Max** |
| F1: Il film | *Pirati dei Caraibi* ✗ | **Speed Racer, Le 24 ore di Le Mans, Veloce come il vento** |
| Toy Story 5 | Pixar generico | **Toy Story ×4** |
| Trap | Inception, Fight Club | **Split, The Sixth Sense, Unbreakable, Glass** (la saga Shyamalan) |
| La Mummia (2026) | The Conjuring ✗ | **La mummia, Il mistero della mummia** |
| Challengers | *Matthias & Maxime* ✗ | **La battaglia dei sessi, Borg McEnroe, Dream Horse** |
| Road House | misto ✗ | **Colpi proibiti ×3, Senza esclusione di colpi ×2** |
| Il robot selvaggio | Madagascar, Megamind | **Shark Tale, Bolt, Bee Movie** |
| Joker 2 · Madame Web · Supergirl | sparsi | **Lanterna verde, Superman Returns, Catwoman** (i flop DC) |
| Odissea (2026) | i film di Nolan | **Medea, Ifigenia** (il tema greco) |
| Anora | commedia romantica ✗ | **Starlet, Destricted, Now & Later** (l'indie sul sex work) |
| Wicked | musical/teen | **Il mago di Oz ×3** |

E le saghe vengono trovate con precisione: *Mission Impossible* (conf **0,61**), *Mortal Kombat ×4*
(0,39), *Final Destination ×4* (0,35), *Cattivissimo me ×4* (0,52), *John Wick ×4*, *Dragon Trainer*,
*Jurassic Park*, *Predator*, *Venom*, *Godzilla-Kong* (conf 0,46), *Il diavolo veste Prada*.

**Dove RB 200 è peggio** — e sono tre casi, tutti dello stesso tipo («sbagliato ma coerente»):
*Sonic 3* → i **Thor** ✗, *Conclave* → **L'esorcista** ✗ (cattolico, ma horror), *Kung Fu Panda 4* →
gli **speciali TV animati** ✗.

## 4. Il verdetto sul banco, che va ribaltato

**Il banco dice 27,7% per la collocazione dei film. L'occhio dice ~90%.**

Il banco chiede «atterra nella bolla che la **co-visione** gli aveva assegnato?» — e per un'uscita del
2024-2026 che nel grafo non c'è, quella domanda **non ha risposta**. Non è che il banco sbagli: misura
il **comportamento**, e l'occhio misura il **significato**. Sui titoli nuovi esiste solo il secondo.

**Questo non era mai emerso**, perché tutte le misure precedenti erano su titoli *dentro* il grafo.

## 5. Un errore mio che è una scoperta architetturale

La prima lettura degli inserimenti era **invalida**: leggevo i membri della bolla su **V10** mentre i
centroidi del collocatore sono costruiti su **V8**. Le bolle **non hanno id stabili fra partizioni**:

```
Deadpool & Wolverine -> bolla 1098 -> "Bayside School, Kenan & Kel, Clarissa, Sister Sister"
```

Non era un errore del collocatore, era un disallineamento mio — la stessa classe del contratto
`assert_allineamento_spazi`, che qui non ha protetto perché **la partizione non era nell'elenco degli
artefatti da allineare**. E non è solo un bug: **passare a una partizione nuova richiede di rifare i
centroidi**, altrimenti si legge silenziosamente un'altra partizione. **La partizione e i centroidi
sono un artefatto solo, e si rigenerano insieme.**

## 6. Cosa fare

1. **La trama dentro il grafo**: sì. È un arco a tutti gli effetti e la coerenza ne guadagna.
2. **RB 200 come risoluzione**: sì, e sostituisce RB 100. Coerenza +44%, collocazione più precisa,
   mega-bolla dimezzata.
3. **Il voto di trama nella collocazione**: no per i titoli col comportamento (−6 punti sul banco),
   **sì per quelli senza** — che è esattamente il caso che l'architettura dell'utente descrive.
4. **Il contratto di allineamento va esteso alla partizione**: partizione, centroidi e vocabolario si
   generano e si verificano insieme.

## 7. Il limite che resta

**Il 46% del canone non ha una trama**, quindi il componente di trama non copre tutto e non può essere
l'unico arco. E il banco, per i titoli nuovi, **non può arbitrare**: l'unico arbitro è l'occhio, e
l'occhio non scala. Serve una misura della qualità semantica sui titoli nuovi, e la Sim_trama — che
dopo la correzione del modello **discrimina** — è il candidato più serio che abbiamo.
