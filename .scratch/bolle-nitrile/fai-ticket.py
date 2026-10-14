"""Genera i ticket di `bolle-nitrile`. Si lancia una volta e si butta (o si tiene, non fa male)."""
import pathlib

D = pathlib.Path(__file__).resolve().parent / "issues"

T = {}

T["01-banco-sonda"] = ("ready-for-agent", "prototype", None, """Il banco sonda: 20 titoli sentinella, letti prima e dopo.

**Perche' e' il primo ticket.** Gli indicatori aggregati (modularita', lambda2, conteggio, intruder
test) ci hanno tradito quattro volte su quattro: ognuno ha premiato una partizione che leggendo i
titoli era peggiore. Serve uno strumento che sia **la lettura, resa ripetibile**.

**Cosa fare**
- Scegliere **20 titoli sentinella** in quattro gruppi da cinque:
  - **minestrone**: uno per ognuna delle 5 bolle del ticket 05 (`[217, 1270, 1267, 1215, 1288]`)
  - **nicchie delicate**: i mondi che il ticket 08 aveva distrutto (iyashikei, seinen, dorama,
    telenovela, slice-of-life)
  - **autori/scuole**: Fassbinder, Kurosawa, Argento, Tarkovsky, + una scuola nazionale
  - **cross-medium e intrusi**: Star Trek Into Darkness nella bolla Star Wars, un film con la sua
    serie, una serie polacca
- Uno script che, data una partizione `.npy`, stampa per ogni sentinella **i compagni di bolla**,
  con `+`/`-` rispetto a una partizione di riferimento.
- Registrare per ogni sentinella le **tre domande di lettura**: la bolla e' un mondo nominabile?
  l'intruso se n'e' andato? la nicchia e' rimasta intera?

**Criterio di chiusura**
- Lo script gira su `bolle2-E` e su `bolle-08-rifinita` e riproduce **le letture gia' fatte a mano**
  (le 5 minestrone sono minestrone, le nicchie dell'08 sono rotte). Se non le riproduce, lo
  strumento e' sbagliato.
- I 20 titoli sono scritti nel report con la motivazione di ognuno.""")

T["02-tre-difetti-senza-parametri"] = ("ready-for-agent", "task", "01", """I tre difetti che non sono scelte: sono bug. Si correggono e basta.

**D1 — Leiden con `n_iterations` non specificato: solo 2 passate.**
Verificato su leidenalg 0.12.0 installato: *«By default, 2 iterations are run»*. **Ogni partizione di
questa fase e' stata costruita con due passate di raffinamento.** Fix: `n_iterations=-1`
(convergenza). Una riga, zero parametri.

**D2 — `msk = Mc.row < Mc.col` su una matrice ASIMMETRICA** (`07-componenti.py:309`).
`M` esce da `K.normalizza`, che normalizza per riga: `Mij != Mji`. Prendere il triangolo superiore
significa che **un arco da riga 5000 a colonna 100 sparisce, e da 100 a 5000 viene tenuto**, con il
peso della riga 100. **I pesi dipendevano da quale titolo ha l'indice piu' basso in
`spazi-trakt.npz`.** Fix: simmetrizzare davvero.
> Questo difetto l'avevo **gia' trovato**: il commento e' in `05-diagnostiche.py:186`. L'ho corretto
> nella diagnostica e **non l'ho propagato a chi costruisce le bolle**.

**D3 — il coseno L2 senza shrinkage** (`07-componenti.py:46`: `nor = sqrt(sum(A^2)) + 1e-9`).
Un film con **una sola keyword** e un altro con la stessa hanno vettori normalizzati identici:
coseno **1,000 esatto**. `argpartition(-d, 30)` riempie i 30 vicini di film semi-vuoti, scavalcando
due film che condividono 6 keyword su 10. Fix: shrinkage bayesiano sulla norma + minimo di 2 keyword
condivise.

**Criterio di chiusura**
- I tre fix applicati in una variante nuova, e il banco sonda del ticket 01 dice **cosa e' cambiato
  nella lettura**. Se non cambia nulla, va detto: sarebbe il segno che il grafo era sporco per altre
  ragioni.""")

T["03-shrinkage-di-riga"] = ("ready-for-agent", "task", "02", """Lo shrinkage di riga `d + tau`, e CFst solo sui nodi freddi.

**Il difetto.** `correggi_hub` (`canone.py:50`) chiama `normalizza`, che porta **la somma di ogni riga
di ogni singolo componente a 1.0** prima di sommare gli otto componenti (`canone.py:114-116`).
Conseguenze:
- un film con **30 archi forti** in CF o KW: ogni arco vero vale `1/30 x 1/8 = 0,004`
- lo stesso film con **un solo arco** in DIR o CAST: quell'arco solitario vale `1/8 = 0,125`, cioe'
  **30 volte un arco comportamentale vero**
- **ecco spiegato l'intruso del ticket 14**: Star Trek Into Darkness nella bolla Star Wars.
  J.J. Abrams ha diretto sia Star Trek Into Darkness sia Star Wars VII/IX: l'arco DIR viene gonfiato
  fino a dominare il grado locale, incollando due universi opposti.

**Fix**
1. **Shrinkage per riga**: dividere per `d + tau_c` (tau_c = peso mediano di riga del componente, o
   un pavimento di 5 vicini equivalenti) invece che per `max(d, 1e-9)`. Un film con 25 archi resta
   ~1.0; un arco solitario resta `w/(w+tau) ~ 0.15`.
2. **CFst solo sui nodi freddi**: azzerare CFst per ogni nodo che ha gia' almeno 5 archi in CF+B+TV.
   CFst e' uno studente progettato come salvagente per i titoli ciechi; sui titoli caldi e' una nebbia
   densa di somiglianze generiche (e pesa 1 su tutti i 66.259 titoli).
3. Alzare `min_sim` da 0.02 a 0.12-0.15 su KW e CAST: chiedere 30 vicini con coseno > 0.02 a una
   nicchia di 6 film riempie il grafo di archi spuri.

**Criterio di chiusura**
- Il banco sonda: **Star Trek Into Darkness deve uscire dalla bolla Star Wars**, e la bolla Star Wars
  deve restare unita. Le bolle d'autore non devono cambiare.
- Dichiarare quanti archi cambiano, non solo la lettura.""")

T["04-chiusura-triangolare"] = ("ready-for-agent", "task", "03", """La chiusura triangolare: `S.multiply(S @ S.T)`.

**L'idea** (dall'esperto, ed e' la piu' elegante del lotto): *i triangoli non mentono mai*. Un arco
singolo `(i,j)` puo' sempre essere un incidente. Ma se `i` e `j` appartengono davvero allo stesso
micro-mondo, **non hanno solo un arco: hanno gli stessi vicini**.

    S_irrobustita = S .multiply(alpha_0 + (S @ S.T))

**Perche' risolve i casi patologici**: Star Trek Into Darkness e Star Wars hanno un arco DIR, ma i
vicini di Star Trek (gli altri titoli di Star Trek) e i vicini di Star Wars (gli altri di Star Wars)
hanno intersezione quasi nulla: l'arco-ponte viene abbattuto. Dentro una vera bolla (iyashikei,
poliziottesco, Fassbinder) tutti i membri si rimpallano gli stessi vicini: l'arco esplode e la bolla
si blinda.

**Costo**: su matrici sparse con grado <= 30 e' un prodotto matrice-matrice, secondi.

**Criterio di chiusura**
- Banco sonda: i **ponti casuali** devono sparire e le **bolle vere devono stringersi**, non sparire.
  Se una nicchia si svuota, la chiusura e' troppo aggressiva e va ammorbidita (dirlo).""")

T["05-potatura-al-nucleo"] = ("ready-for-agent", "task", "04", """La potatura al nucleo: espellere i parassiti senza dissolvere le bolle.

**Perche' serve, dato che la chiusura triangolare gia' taglia i ponti**: per l'**effetto catena** di
Leiden. Leiden ottimizza una funzione additiva sugli archi e non ha il concetto di centroide: se A
condivide il regista con B, B un attore con C, e C due keyword con D, finiscono tutti nella stessa
bolla anche se A e D non hanno niente in comune. E' l'effetto che genera i minestroni da 15-30
titoli.

**L'algoritmo**
1. Per ogni bolla trovata da Leiden, identificare il **Nucleo**: i 3-5 titoli con la massima somma di
   pesi interni.
2. Per ogni membro, calcolare l'affinita' media verso quei 3-5 titoli del Nucleo.
3. Se un membro ha affinita' **zero** verso il Nucleo (era entrato solo attaccato a un nodo
   periferico), staccarlo e riassegnarlo alla bolla il cui Nucleo ha la massima affinita' diretta con
   lui.
4. **Differenza esplicita dal ticket 08**: nell'08 avevo **sciolto intere bolle** guardando la purezza
   esterna, che puniva gli anime perche' parlavano con altri anime. Qui **non si scioglie nessuna
   bolla**: si verifica solo che ogni membro parli col centro della propria.

**Criterio di chiusura**
- Banco sonda: le nicchie delicate (iyashikei, seinen, dorama) **non devono perdere membri veri**, e i
  minestroni devono perdere i parassiti. Contare quanti titoli vengono espulsi e da quante bolle.""")

T["06-maschera-genere-e-COLL"] = ("ready-for-agent", "task", "05", """La maschera di coerenza su DIR/CAST, e COLL da 1 a 3.

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
  (La storia infinita 1-2-3, i casi del ticket 08).""")

T["07-consenso-multivista"] = ("ready-for-agent", "task", "06", """Il bonus di consenso multi-vista.

**Il difetto.** In `costruisci` i componenti si sommano **linearmente**. Ma un arco che esiste **solo
in KW** (due film con 3 keyword simili per caso) o **solo in CAST** e' molto piu' fragile di un arco
che compare in **due viste indipendenti** (CF+KW, TV+KW, DIR+CAST, B+KW).

**Fix**
- Per ogni arco `(i,j)` contare in quante viste distinte esiste: `N_ij = sum((C[nome] > 0) for nome in
  pesi)`, in `{1..8}`.
- Se `N_ij = 1` **e** quell'unica vista e' solo CAST o solo KW: **dimezzare** (x0.5).
- Se `N_ij >= 2`: **moltiplicare** per `1 + 0.5 (N_ij - 1)`.

**Perche' non penalizza la nicchia**: a un film di nicchia senza comportamento basta avere **DIR+KW**
o **CAST+KW** o **PROD+KW** per ricevere il bonus. Taglia i falsi positivi lessicali senza chiedere il
dato che la nicchia non ha.

**Criterio di chiusura**
- Banco sonda + distribuzione di `N_ij` (quanti archi hanno 1, 2, 3+ viste). Se quasi tutti gli archi
  hanno una vista sola, il bonus non fa nulla e va detto.""")

T["08-LIST-nelle-bolle"] = ("ready-for-agent", "task", "07", """`LIST` dentro la costruzione delle bolle — mai provato.

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
  leggendo le liste che entrano di piu'.""")

T["09-CPM-e-risoluzione"] = ("ready-for-agent", "task", "08", """CPM contro RBConfiguration, e la risoluzione.

**Il difetto.** In `07-componenti.py:312` la partizione usa `RBConfigurationVertexPartition` con
`resolution_parameter=100`. Ma il modello nullo di RBConfiguration e' `gamma * k_i k_j / (2m)`, e **i
gradi dei film e delle serie sono distribuiti diversamente**: i film hanno CF (49.041 film, zero
serie), le serie hanno B. In piu' RBConfiguration **soffre del resolution limit**.

**E c'e' un'evidenza dalla nostra storia**: il ticket 08 ha scoperto che una nicchia di anime si
spacca in due perche' **gli anime hanno molti archi tra loro** — che e' esattamente il sintomo del
resolution limit di RBConfiguration.

**Fix da provare**
- **CPMVertexPartition** (Constant Potts Model): il `resolution_parameter` e' direttamente la
  **densita' interna minima** perche' una bolla resti unita. Non soffre del resolution limit e non
  spacca i cluster omogenei solo perche' hanno molti archi interni. Range: gamma in `[0.005, 0.02]`.
- Confronto con RBConfiguration a risoluzione **piu' bassa** (gamma in `[30, 60]` invece di 100), ora
  che la matrice e' simmetrizzata e ripulita dagli hub.

**Criterio di chiusura**
- Banco sonda su almeno 3 risoluzioni CPM + 2 RB: **le nicchie anime devono restare intere**, e il
  numero di bolle con >=15 titoli non e' il metro (anzi: se sale troppo, sospettare).""")

T["10-mappa-nuova"] = ("ready-for-agent", "task", "09", """La mappa sulla partizione nuova: otto slot, lettura, leva.

**Solo se il banco sonda dice che la partizione nuova e' migliore.** Se non lo dice, questo ticket si
chiude dichiarando che la partizione vecchia resta, e il lavoro si ferma.

**Cosa fare**
- Ricostruire l'architettura della mappa (`grafo-servibile` ticket 12, poi 23) sulla partizione
  nuova: **k-NN diretto k=8 simmetrizzato** (non il mutuo: e' cio' che frammenta), 8 vicini tipizzati
  per bolla (4 canonici + 2 vibe + 2 cross-medium), priorita' ordinata.
- Rileggere le **6 adiacenze verificate** (Fassbinder, mostri anni '50, Star Wars, polacchi,
  argentini, norvegesi) e dire se sono ancora giuste e se i tipi sono giusti.
- Ri-misurare la **leva popolare/nicchia** (ticket 14): mai vuota su ogni bolla? Il caso Star Trek
  Into Darkness come deep cut e' risolto?

**Criterio di chiusura**
- Una componente connessa, 8 slot per bolla, le 6 adiacenze lette, la leva mai vuota — **e la lettura
  di almeno 10 bolle nuove** che prima non erano leggibili.""")

for slug, (st, tp, dep, body) in T.items():
    h = f"# {slug.split('-', 1)[1].replace('-', ' ')}\n\n**Status**: `{st}`\n**Type**: `{tp}`\n"
    if dep:
        h += f"**Blocked by**: {dep}\n"
    h += "\n" + body + "\n"
    (D / f"{slug}.md").write_text(h, encoding="utf-8")

print(f"scritti {len(T)} ticket in {D}")
for f in sorted(D.glob("*.md")):
    print(f"  {f.name:<40} {len(f.read_text(encoding='utf-8')):>6} byte")
