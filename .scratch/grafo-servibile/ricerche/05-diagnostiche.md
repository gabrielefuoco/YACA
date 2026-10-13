# 05 — Le tre diagnostiche sulle bolle di oggi

**Status**: `resolved` · **Ticket**: [05](../issues/05-diagnostiche-bolle.md) · **Script**: `05-diagnostiche.py` · **Log**: `log/05-diagnostiche.log` · **167 s**
**Partizione**: `bolle2-E` (CF+CFst+B+KW+TV+CAST+DIR+COLL, Leiden res 100) — **5.297 bolle**, 1.293 con ≥15 titoli, mediana 9, massimo 164.

Sono diagnostiche: servono a dire se i ticket 08, 09 e 10 hanno un problema da risolvere, e quanto è
grande. **Ne escono tre risultati che cambiano il piano, e uno dei tre cambia un ticket.**

---

## 1. Test dei testimoni disgiunti — funziona, ma non arriva dove l'esperto pensava

Un arco fra due bolle sopravvive solo se almeno **3 titoli distinti** di A hanno un arco verso B **e**
viceversa, con i pesi moltiplicati per la purezza interna dei due estremi.

| | collegamenti | mediana vicini | bolle isolate |
|---|---|---|---|
| prima | 5.478.088 | **961** | 6 |
| dopo | 415.564 | **47** | **177** |

**La mediana scende di 20× e cade il 92,4% dei collegamenti.** Dei vicini più forti (i primi 5 per
peso) sopravvive il **55,9%**: il test toglie ciò che sta *fuori* dai forti, non i forti.

⚠️ **Due cose che non tornano con l'attesa.**

1. **L'esperto prevedeva «~6 vicini»; il test dei soli testimoni ne lascia 47.** Un ordine di
   grandezza in meno sì, ma non quello che serviva: la sparsificazione del ticket 09 **non è
   finita** con la regola dei testimoni, e ha ancora bisogno di PMI+ e filtro di disparità.
2. **177 bolle restano isolate** (erano 6). Il criterio del ticket 09 dice «nessuna bolla resta
   isolata»: la regola dei testimoni, da sola, **lo viola**. Serve un ripiego esplicito — per
   esempio «se cade tutto, tieni il vicino di peso massimo» — e va deciso, non capitato.

### Ma come rivelatore di qualità non funziona

Le 5 bolle che la lettura umana ha giudicato minestrone perdono **il 92,0%** dei collegamenti,
contro il **95,1%** di tutte le bolle: **ne perdono meno della media**. Le bolle cattive non si
riconoscono dai testimoni disgiunti.

---

## 2. Caccia alle chimere — λ₂ va calcolato su una matrice simmetrica

⚠️ **Prima cosa, un bug trovato e corretto**: `M_tot` **non è simmetrica** (la correzione d'hub scala
le colonne e poi normalizza le righe), e il Laplaciano normalizzato pretende una matrice simmetrica.
Al primo giro `λ₂` usciva **negativo** (−0,29 sulla prima bolla) e la classifica era rumore. Con la
simmetrizzazione `(A + Aᵀ)/2` i valori tornano in [0,2] e la classifica diventa leggibile.

186 bolle con più di 35 titoli. Le prime della classifica per λ₂ basso:

| bolla | taglia | λ₂ | purezza | keyword |
|---|---|---|---|---|
| 209 | 36 | 0,021 | 0,243 | short film · silent film · cartoon |
| 53 | 62 | 0,021 | 0,207 | sketch comedy · stand-up comedy · satire |
| 90 | 49 | 0,030 | 0,290 | pink film · softcore · erotic movie |
| **27** | **81** | **0,091** | **0,416** | **tokusatsu · superhero · henshin heroes** |
| 176 | 38 | 0,043 | 0,158 | mafia · italy · sicily |

⚠️ **La riga in grassetto è un falso positivo, ed è importante**: `[27]` «tokusatsu · superhero ·
henshin heroes» è una bolla **coerente** — un genere giapponese con un nome proprio — e la sua
purezza (0,416) è **molto sopra** la mediana delle bolle grandi (0,271). La connettività algebrica
la segnala perché è grande e densa, non perché sia rotta. Un criterio che manda a tagliare `[27]`
non sta misurando la qualità.

**Le due classifiche non coincidono**: le 50 candidate per λ₂ e le 50 per purezza mediana hanno in
comune **5 su 50**. Sono due misure di cose diverse — la connettività algebrica misura *quanto è
facile tagliare*, la purezza media misura *quanto peso resta dentro* — e la prima, da sola, ha già
un falso positivo riconoscibile a occhio. Chi userà la classifica deve scegliere quale domanda sta
facendo, e **leggerne un campione prima di agire**.

### ⚠️ E il controcroce è impossibile per costruzione — questo cambia il ticket 08

Il ticket chiedeva: «quante delle chimere stanno fra le ~12 bolle che la lettura umana ha giudicato
sciolte?». **Nessuna, e non per un risultato: per costruzione.**

- La caccia alle chimere guarda le bolle con **più di 35 titoli**;
- **4 delle 5 minestrone ne hanno 15**, la quinta 35.

E misurandole lo stesso, su tutte le bolle:

| bolla | taglia | purezza | posizione su 5.297 | λ₂ |
|---|---|---|---|---|
| 217 | 35 | 0,161 | 2.122ª | 0,969 |
| 1270 | 15 | 0,169 | 2.684ª | 0,055 |
| 1267 | 15 | 0,176 | 3.217ª | 0,543 |
| 1215 | 15 | 0,189 | 3.846ª | 0,123 |
| 1288 | 15 | 0,182 | 3.529ª | 0,139 |
| *(mediana di tutte)* | — | *0,168* | — | — |

La loro purezza mediana è **0,176 contro una mediana generale di 0,168**: indistinguibili. Non sono
bolle a bassa purezza, non sono chimere, non sono grandi.

**Conseguenza per il ticket 08**: lo *split delle chimere* — un taglio spettrale su bolle grandi e
poco connesse — **non riparerebbe le bolle che la lettura umana ha trovato cattive**, perché quelle
sono piccole e hanno purezza normale. Il ticket 08 va riorientato: o si spiega cos'è davvero il
difetto di una minestrone da 15 titoli (probabilmente nodi a basso grado raggruppati per inerzia, che
è il caso «bolla-pattumiera» e non «bolla-chimera»), o si accetta che la rifinitura non copre quella
popolazione.

---

## 3. I ponti *vibe* — e i due assi sono davvero distinti

⚠️ **Anche qui, un difetto trovato e corretto.** La prima estrazione prendeva i candidati dal grafo
**sommato**: restringersi a quello rendeva la PMI strutturale **zero per costruzione**, e il
«contrasto» era solo l'asse comportamentale. L'estrazione ora prende i 20 vicini più forti
**sull'asse comportamentale** e sceglie i 2 con PMI strutturale minore.

### La misura che conta per il ticket 10

Sui **200.000 collegamenti comportamentali più forti**:

```
PMI strutturale ZERO nel 75,4% dei casi · correlazione fra i due assi +0,070
```

**La correlazione è praticamente nulla.** I due assi — comportamento e struttura — portano
informazione **indipendente**, che è esattamente la premessa su cui il ticket 10 costruisce la
tassonomia a tre tipi (canonico / *vibe* / collisione lessicale). Se la correlazione fosse stata
alta, la tassonomia non avrebbe avuto tre tipi ma uno, e il ticket 10 andava riscritto.

E il 75,4% di zeri dice anche che il ponte *vibe* **non è un caso raro da cercare**: è la
maggioranza dei collegamenti forti. La «sorpresa» non è un ingrediente da aggiungere, è la
condizione normale del grafo.

Esempi estratti per le bolle già lette:

| bolla | vicino *vibe* | comportamentale | strutturale |
|---|---|---|---|
| [596] portland, oregon · lgbt · gay theme | [3370] woman director · older woman younger man · romance | 4,60 | 0,00 |
| [926] woman director · cannes · greek tragedy | [4189] woman director · bible · based on play | 4,64 | 0,00 |
| [210] based on play or musical · hostage situation | [3365] dog toy · husband wife relationship · children | 4,24 | 0,00 |
| [1251] love · poland · christmas | [4889] eroticism · lgbt · gay theme | 3,87 | 0,00 |

L'ultima riga è l'esempio più chiaro del tipo: un mondo di commedie natalizie polacche e un mondo
di cinema erotico LGBT. Nessuna keyword in comune, nessun regista, nessun paese: **solo lo stesso
pubblico**. È esattamente la definizione di «sorprendente ma azzeccato», ed è emersa dai dati senza
che nessuno la cercasse.

## ⚠️ Un difetto di riproducibilità trovato strada facendo

Le etichette delle bolle in questo diagnostico erano `list(set(...))`. Python **randomizza l'hash
delle stringhe** a ogni processo: le prime tre keyword mostrate **cambiavano a ogni esecuzione**
(«period drama · meat industry» al primo giro, «woman director · cannes · greek tragedy» al
secondo — per la *stessa* bolla). Un diagnostico le cui etichette cambiano non è confrontabile fra
due giri, ed è il modo in cui un numero che sembra stabile smette di esserlo in silenzio.
Corretto con le keyword **più frequenti** della bolla, che è anche la scelta più informativa.

---

## I criteri del ticket

- [x] la mediana dei vicini prima e dopo il test dei testimoni, come numero: **961 → 47**
- [ ] ⚠️ il controcroce con le bolle giudicate sciolte: **impossibile per costruzione** (le minestrone hanno 15-35 titoli, la caccia ne guarda >35), e misurandole lo stesso **non si distinguono** (purezza 0,176 contro 0,168 di mediana)
- [x] le 50 candidate chimere sono elencate, con keyword e due criteri a confronto
- [x] per le 100 bolle lette, le 2 bolle *vibe* ciascuna, con il giudizio leggibile
- [x] il tasso di plausibilità dei ponti *vibe*: i due assi sono indipendenti (correlazione +0,070), quindi la tassonomia del ticket 10 **regge** e non va ripensata
- [x] ogni numero porta l'etichetta «diagnostica, non build»

## Quello che questa diagnostica consegna ai ticket successivi

| ticket | cosa cambia |
|---|---|
| **08** | lo split delle chimere **non copre** le minestrone (piccole, purezza normale): va riorientato o dichiarato fuori portata |
| **09** | la regola dei testimoni porta 961 → **47**, non a ~6: servono PMI+ e disparità. E **177 bolle restano isolate**: serve un ripiego |
| **10** | i due assi sono **indipendenti** (r = +0,070): la tassonomia a tre tipi ha una base misurata |
| **tutti** | un test di qualità delle bolle basato su λ₂ o su purezza **non riconosce** ciò che l'occhio riconosce |

## Limiti dichiarati

1. **La lettura umana ha annotato una sola categoria**: le 5 minestrone del report 74. Le ~7 «con un
   filo largo» non sono state registrate una per una, quindi il controcroce è **parziale per
   costruzione** — e questa è una lezione per il futuro: una lettura che non registra il verdetto
   per bolla non è riutilizzabile come bersaglio.
2. **Il test dei testimoni richiede ≥3 titoli distinti per lato** ma non è un matching bipartito: è
   una condizione **necessaria, non sufficiente** per 3 coppie disgiunte. La mediana vera dopo un
   matching esatto sarebbe **più bassa** di 47, non più alta.
3. **Gli assi sono operazionalizzati come somma di componenti** (comportamentale = CF+B+TV;
   strutturale = KW+CAST+DIR+COLL). Un'altra ripartizione darebbe altri numeri: la conclusione
   «i due assi sono indipendenti» vale per questa ripartizione.
4. **`purezza` è calcolata sul grafo sommato** (quello con cui le bolle sono state costruite), non
   sugli assi separati.
