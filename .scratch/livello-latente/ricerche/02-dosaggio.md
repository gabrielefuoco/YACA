# 04 — Il dosaggio della fusione: quanto peso al comportamento? (testato)

**Data**: 08/10/2026 · **Mappa**: [../map.md](../map.md) · **Banco**: `sim-dosaggio.js`, `apply-dosaggio.js`
**Nato da**: la scoperta che con T ≈ 66 la curva `w = 0,85·T/(T+50)` dà alla metà **dichiarata** il **52%** del peso,
cioè metà del DNA poggia su ~100 chiavi e metà su ~2.000 (una chiave dichiarata vale ~20 volte una comportamentale).

---

## 1. Il banco: leave-out sulla cronologia vera

Metodo identico al cold start, ma con **la metà dichiarata vera** del profilo (il suo `V_static`) e il dosaggio
variato a mano. La fusione replica esattamente `computeFinalDNA` (`applySoftRarity` + `normalizeVector` su
entrambe le metà, poi miscela). 5 profili reali × 4 livelli di semi × 6 estrazioni = 120 prove; caso casuale
2,5% @50 e 10% @200.

| peso comportamentale | k=1 @50 | k=3 | k=5 | k=10 | media @50 | media @200 |
|---|---|---|---|---|---|---|
| 0% (solo preset dichiarati) | 7,6% | 6,8% | 7,4% | 7,0% | 7,2% | 23,8% |
| 20% | 7,5% | 7,6% | 7,9% | 8,1% | 7,8% | 23,8% |
| 35% | 8,3% | 8,4% | 8,3% | 8,9% | 8,5% | 24,7% |
| **50%** (vicino alla produzione) | 6,9% | 9,2% | 9,0% | 8,5% | 8,4% | 27,0% |
| **65%** | 6,6% | 10,2% | 10,2% | 10,0% | **9,2%** | 29,6% |
| **80%** | 6,4% | 10,9% | 10,0% | 8,5% | 8,9% | **31,9%** |
| 100% (solo comportamento) | 6,2% | 10,1% | 9,9% | 8,2% | 8,6% | 31,6% |

**Confronto appaiato** (stesse estrazioni, quindi le differenze non sono rumore indipendente):

| confronto | recall | delta medio | errore std | t | estrazioni in cui vince |
|---|---|---|---|---|---|
| 65% vs 50% | @50 | +0,50 pt | 1,01 pt | 0,5 | 4/20 |
| 65% vs 50% | **@200** | **+2,87 pt** | 1,56 pt | **1,8** | 10/20 |
| 80% vs 50% | @50 | +0,86 pt | 1,26 pt | 0,7 | 6/20 |
| 80% vs 50% | **@200** | **+5,41 pt** | 2,84 pt | **1,9** | 8/20 |
| 65% vs 35% | @200 | +4,69 pt | 2,53 pt | 1,9 | 12/20 |
| 80% vs 35% | @200 | +7,23 pt | 3,72 pt | 1,9 | 10/20 |

Cosa dice: il vantaggio del dosaggio alto è **solo in profondità** (@200, +11-27% relativo) ed è **al limite della
significatività** (t ≈ 1,8-1,9; vince in 8-12 estrazioni su 20). In cima (@50) non cambia **nulla**.

### Il difetto di forma della curva

T stimato ≈ k × 3 (ogni titolo visto pesa ~3). Confronto fra la dose che il banco preferisce e quella che le
curve assegnerebbero:

| semi k | T | **dose migliore osservata** | oggi `0,85·T/(T+50)` | A `0,85·T/(T+15)` | B `0,90·T/(T+20)` | C `0,85·T/(T+10)` |
|---|---|---|---|---|---|---|
| 1 | 3 | 50% (22,3% @200) | **5%** | 14% | 12% | 20% |
| 3 | 9 | 80% (30,8%) | **13%** | 32% | 28% | 40% |
| 5 | 15 | 80% (37,2%) | **20%** | 43% | 39% | 51% |
| 10 | 30 | 100% (45,7%) | **32%** | 57% | 54% | 64% |

La curva di produzione è **sistematicamente troppo prudente**: assegna 5-32% dove il banco dice 50-100%. La
direzione è coerente a ogni livello (questo conta più della singola differenza borderline).

## 2. La verifica sulle liste servite — e qui il segno cambia

Ho scritto la curva candidata A nei **profili di test** (`apply-dosaggio.js`, dose 61-63% contro il 48% di
produzione), svuotato la cache e riscaricato i 55 cataloghi (`runs/doseA`).

| misura (55 cataloghi serviti) | dose di produzione (48%) | dose candidata (62%) |
|---|---|---|
| percentile mediano degli item | 78% | 77% (−1,1 pt) |
| percentile dell'ultimo item | 71% | **67% (−3,8 pt)** |
| quota nel top 5% del pool | 33% | **31% (−2,0 pt)** |
| quota bambini/animazione | 33% | 35% (+2,3 pt) |
| ponte film→serie (caso 14%) | **56%** | 50% (−6 pt) |
| liste identiche fra le due dosi | — | 29/55 (Jaccard 86,5%) |

## 3. Perché i due banchi dicono cose diverse (e perché non si decide)

1. **Non misurano la stessa cosa.** Il leave-out misura «il profilo ritrova il tuo comportamento reale»; la
   nitidezza misura «la lista sta in cima alla distribuzione di *quel* profilo». Con più peso al comportamento
   il profilo si sparpaglia su più chiavi, la distribuzione si appiattisce, e i percentili scendono **anche se
   la lista non è peggiore**: la metrica non è invariante al dosaggio. Va letta come indizio, non come prova.
2. **Le dimensioni in gioco sono piccole e opposte**: +3/+5 pt @200 (profondità) contro −2/−4 pt di nitidezza e
   −6 pt sul ponte film→serie. Nessuna delle due è netta.
3. **Serve un giudice umano.** Il banco che può decidere è la rubrica `qc-cataloghi` (pertinenza, qualità,
   distintività, coerenza, completezza) su un campione di cataloghi serviti con le due dosi — oppure una metrica
   di comportamento vero (click, like), che non abbiamo.

## 4. Verdetto

**Non si cambia la curva su queste prove.** Il dosaggio è una leva reale (il banco mostra che c'è margine in
profondità e che la curva sottostima il comportamento a ogni livello), ma nessuna delle due misure disponibili
lo dichiara un miglioramento: una è borderline e l'altra è di segno opposto.

Quello che resta acquisito:

- la curva attuale **sottostima** il comportamento, e lo fa in modo monotono su tutto il range misurato;
- il margine è nei **risultati profondi** (dalla posizione ~50 in giù), non nella testa della lista: la cima non
  cambia con il dosaggio;
- se un giorno si tocca, la verifica va fatta **con i giudici** su un campione, non con la nitidezza.

## 5. Come si riproduce

```bash
node .scratch/livello-latente/sim-dosaggio.js                 # il banco: recall per dosaggio + confronto appaiato
node .scratch/livello-latente/apply-dosaggio.js T+15          # scrive la dose candidata nei profili di TEST
# svuotare recommendation_cache, poi:
node scripts/qa/simulate.js fetch --spec .scratch/ocean-prototipo/runs/profili-reali.spec.json --run .scratch/ocean-prototipo/runs/doseA
node .scratch/ocean-prototipo/analyze-serviti.js .scratch/ocean-prototipo/runs/doseA
node .scratch/ocean-prototipo/runs/compare-dosaggio.js
node scripts/qa/simulate.js profiles --spec .scratch/ocean-prototipo/runs/profili-reali.spec.json   # riallinea i test
```

I profili di test sono stati **riallineati alla produzione** e la cache svuotata a fine misura: nessun residuo.
