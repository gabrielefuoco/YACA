Status: claimed
Type: task
Blocked by: 08

# 09 — "Punti d'incontro": il vero sostituto di "un passo fuori"

## Cosa deve uscire

Con i vettori di attivazione dei micro-cluster del ticket 08 — `r_1 … r_K`, ciascuno normalizzato a **somma 1** —
per ogni coppia `(a, b)` di cluster dell'utente e per ogni titolo non visto:

1. **Punteggio di ponte**: `ponte_{a,b}(x) = sqrt(r_a[x] * r_b[x])` (media geometrica).
2. **Perché geometrica e non aritmetica**: se un titolo è fortissimo nel cluster A (`r_a = 0.01`) e **assente** in B
   (`r_b = 0`), il prodotto è **zero**. Sale solo chi riceve massa di camminata **da entrambi i filoni**. Con la
   media aritmetica vincerebbero i titoli di un solo filone, e la riga sarebbe un doppione del micro-cluster.
3. **Pavimento**: `VAVE[x] >= 6.8`, più i cap di saga/regista (ticket 04).
4. **Fallback**: se l'utente ha **un solo** cluster (guarda un solo genere), usa i due mondi **più distanti** accesi
   dal profilo (`scegli_mondi` con `lontano = 1.0`) e **dichiaralo** nella riga.

### Decisioni prese prima del codice (20/10/2026, integratore)

- **Le `r_k` sono quelle del `08`, non si ricalcolano.** `lista` costruisce già una diffusione per filone e le
  butta dopo la riga: qui vengono raccolte e passate ai ponti. Nel caso normale **zero PageRank in più**;
  gli unici due nuovi sono quelli del fallback (sotto).
- **Le coppie**: per K filoni, tutte le coppie `a < b` (con `K <= 3` sono al massimo 3 righe), una riga per
  coppia. Il ticket dice "per ogni coppia": non si sceglie una coppia sola e non si inventa un tetto. Il
  waterfall del `11` deciderà chi tiene i titoli.
- **Identità della riga**: `tipo = punti_incontro_<i>` (posizionale, come i micro-cluster) e `coppia_id` con le
  **ancore** dei due filoni (`b<a>_b<b>`), così il filone non è identificato solo dallo slot. Nel fallback
  `coppia_id` è `b<mondo1>_b<mondo2>` e `fallback: true`.
- **Pavimento**: `VAVE >= 6.8` come dice il ticket (`PUNTI_INCONTRO_VAVE_MIN`), **più** il pavimento voti già
  usato da tutte le righe (`VOT >= soglia_voti`): non si abbassa niente, si aggiunge.
- **Fallback con semi veri**: due mondi che hanno almeno un seme, scelti per **distanza**
  (`Motore.distanza_fra_mondi`: differenza di fascia di notorietà + medium), e ogni mondo cammina dai
  **propri** semi. **Divergenza misurata dalla premessa del ticket**: `scegli_mondi(att, {largo: 2,
  lontano: 1.0})` **non** sceglie i due mondi più lontani — con `lontano = 1.0` tutti gli slot sono slot di
  diversità e il filtro viene **saltato** (`len(scelti) >= quante - diverse` è sempre vero), quindi torna i
  primi due per **attivazione**. La distanza è quindi estratta in `distanza_fra_mondi`, che `scegli_mondi`
  usa a sua volta per la propria diversità, e il fallback prende la coppia col valore massimo. Se i semi
  stanno tutti in un mondo solo, la riga lo **dichiara** (vuota + motivo): un ponte senza due sponde non
  esiste, e inventare i semi dell'altra sponda sarebbe peggio del silenzio.
- **Titolo parlante**: il seme più pesante di ciascuno dei due filoni → «Tra «X» e «Y»»; `semi_chiavi` = l'unione
  dei semi dei due filoni; `fallback` viaggia nel contratto.

## La prova

- Un profilo con **due filoni netti** deve produrre una riga di ponte in cui i primi titoli **non** appartengono
  interamente al filone dominante (altrimenti è la media aritmetica travestita).
- Un titolo forte in un solo cluster **non** deve entrare: provalo con un caso costruito.
- Profilo monolitico → fallback dichiarato, non riga vuota.
- Suite alla baseline.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- **Ogni riga che non si riesce a riempire lo dichiara**: nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

---

## Esito (20/10/2026) — il ponte fra i filoni, senza una camminata in più

### 1. Produzione

```
$ ssh mate 'docker exec yaca-graph python -c "import urllib.request;print(urllib.request.urlopen(\"http://127.0.0.1:7862/health\").read())"'
b'{"ok": true, "contratto": 1, "versioni": {"artefatto": "cf1d80dcba3eddce", "ricetta": "fa5771594b2ad0c4"}}'
```

Invariata dal `07` (né il `07` né l'`08` sono stati deployati). Nessun deploy qui.

### 2. La premessa, e una divergenza trovata scrivendo il codice

Le `r_k` sono quelle del `08`, raccolte in `lista` quando costruisce le righe dei filoni: **zero PageRank in
più** (prova alla sezione 4 della sonda). Il pavimento è `VAVE >= 6.8` **più** il pavimento voti generale, quindi
non si abbassa niente.

**Divergenza**: il ticket dice fallback «`scegli_mondi` con `lontano = 1.0`». Letto il codice, con
`largo = 2, lontano = 1.0` si ha `diverse = 2` e la condizione `len(scelti) >= quante - diverse` è **sempre
vera**: il filtro di diversità non viene mai valutato e `scegli_mondi` torna i **primi due per attivazione**, non
i due più lontani. La distanza è quindi stata estratta in `Motore.distanza_fra_mondi` (fascia di notorietà + medium,
la stessa misura che `scegli_mondi` usa per la sua diversità) e il fallback sceglie la **coppia col massimo** fra i
mondi che hanno semi. La sonda ha un caso apposta (5b) in cui le due più attive e le due più lontane sono coppie
diverse.

### 3. La prova

```
$ py scripts/qa/probe-ticket-09-punti-incontro.py
1. PARAMETRI DICHIARATI
  VAVE_MIN=6.8
  -> OK

2. DUE FILONI NETTI: IL PONTE VIVE SOLO DOVE ARRIVANO ENTRAMBE LE CAMMINATE
  filoni: ['b0', 'b1'] · ponti: ['b0_b1']
  titoli del ponte: 20 · mondi: [0, 1, 2] · primi 5: ['movie:1200', 'movie:1006', 'movie:1106', 'movie:1201', 'movie:1007']
  mondi dei primi 5: [2, 0, 1, 2, 0] · equilibrio del primo: 1.0000
  equilibrio primo del ponte 1.0000 vs primo di un filone 0.0000
  -> OK: solo chi riceve massa da entrambi, e il primo posto è un titolo bilanciato

3. LE RIGHE DEI SINGOLI FILONI NON SONO IL PONTE
  b0 (filone A) tocca i mondi [0, 2]
  b1 (filone B) tocca i mondi [1, 2]
  -> OK: il ponte non è il doppione di nessuno dei due filoni

4. IL PONTE NON COSTA CAMMINATE (riusa le r_k del 08)
  semi per camminata: [12, 6, 6] (attese: 1 principale + 2 filoni)
  -> OK: zero diffusioni in più

5. FALLBACK: UN FILONE SOLO, DUE MONDI LONTANI, DICHIARATO
  filoni: ['b0'] · ponti: [('b0_b2', True, 20)]
  -> OK: fallback dichiarato, e la riga si riempie

5b. IL FALLBACK SCEGLIE LA COPPIA PIU' LONTANA, NON LE DUE PIU' ATTIVE
  coppia scelta: b0_b1 (attive: b2 con 6 semi; lontane: b0 vs b1)
  -> OK: distanza, non attivazione

6. FALLBACK IMPOSSIBILE: TUTTI I SEMI IN UN MONDO, LA RIGA LO DICE
  righe di ponte: [('punti_incontro_1', 0, 'punti_incontro: i semi stanno in un mondo solo, nessun ponte fra due sponde')]
  contratto: status=200 · vuota=True · motivi=['punti_incontro: i semi stanno in un mondo solo, nessun ponte fra due sponde']
  -> OK: nessun ponte inventato, e il motivo arriva al chiamante una volta sola

7. IL CONTRATTO HTTP
  status=200 · righe=1
  punti_incontro_1   coppia=b0_b1 fallback=False descrizione='Tra «Film_0» e «Film_100»' semi=12 titoli=20

8. IL PAVIMENTO MORDE DAVVERO
  20 titoli, tutti sopra i due pavimenti, punteggi monotoni
  movie:1201: VAVE 7.4 -> 6.0 · presente dopo: False · sopravvissuti 100 -> 99
  -> OK: il pavimento taglia davvero

TUTTE LE PROVE SUPERATE — OK
```

Cosa la sonda ha **imparato a fare** (e non era così nel primo giro): le due `r` non sono ricalcolate a mano con
pesi uniformi ma **catturate** dal motore (spia su `diffondi`), il pavimento non è asserito sui titoli già filtrati
ma provato con un titolo che *sarebbe* passato e viene tagliato (VAVE 7.4 → 6.0), e c'è il caso in cui coppia più
attiva e coppia più lontana **non** coincidono.

### 4. Non regressione (A/B su `34a5b2d`)

```
solo in HEAD        : ['punti_incontro_1']
solo in 34a5b2d     : []
righe confrontate   : 10
righe divergenti    : nessuna
```

Le **dieci righe preesistenti sono identiche**. `scegli_mondi` è stato toccato solo nella sua funzione interna di
distanza (stessa soglia, stessa semantica: `fascia > soglia` oppure medium diverso), e il rifacimento A/B lo
conferma sulle righe vere.

### 5. Suite e ricetta

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 187 passed, 192 total
Tests:       8 failed, 1 skipped, 1910 passed, 1919 total

$ py -c "import sys; sys.path.insert(0,'services'); from graph import parametri as P; print(P.impronta())"
2dcd65764e5d870b
```

Baseline `1910` passati / `192` suite (quella del `08`): nessun file JS toccato, zero regressioni. Produzione:
`fa5771594b2ad0c4`; con questa immagine diventa `2dcd65764e5d870b`, artefatto invariato.

### 6. Le review (due assi)

**`standards`** ha preso subito la divergenza del fallback (prima che la correggessi io, stesso punto), poi:

1. **`ponte_fra` ricopiava il pavimento** → ora usa `self.pavimento(...)`: il difetto ricorrente, ennesima volta.
2. **Titolo parlante**: la scelta dei semi più pesanti era duplicata fra la riga del filone e il fallback, e nel
   fallback non deduplicava → ora è `Motore.titoli_seme(nodi, pesi, quanti)`, un posto solo, che deduplica.
3. **`filoni` era una seconda fonte di verità** (copie di `ancora`, `titolo_seme`, `semi_chiavi`) → ora tiene
   `riga` + le due camminate.
4. **Il motivo del fallback impossibile compariva due volte** nel payload (`motivo` della riga + `motivi`) → ora
   solo il log nel motore, e `servizio` lo mette nei `motivi` una volta; la sonda lo verifica sul contratto.
5. **La prova del pavimento non poteva fallire** (asseriva sui titoli già filtrati) → ora c'è un titolo che
   passerebbe e viene tagliato, con il conteggio dei sopravvissuti che scende.

**`spec`** ha verificato i quattro punti del ticket e la prova; il suo esito è la sezione 7.

### 7. Residui dichiarati

1. **La geometria funziona al primo posto, non a tutti.** Misurato: il primo titolo del ponte è bilanciato
   (equilibrio 1.0), ma dal secondo in poi possono entrare titoli **forti in un filone e quasi assenti
   nell'altro** (`movie:1006`, equilibrio ~1e-5), perché la massa che arriva dall'altra parte è piccola ma non
   zero e il prodotto la fa salire. È dentro la formula del ticket («assente = zero»), non fuori — ma se il
   prodotto vuole un ponte *davvero* bilanciato serve una soglia sull'equilibrio (`min(r_a,r_b)/max(...)`).
   **Proposta, non applicata**: è una decisione di prodotto, e il ticket non la chiede.
2. **Con K = 3 escono tre coppie** (tutte, come dice il ticket: «per ogni coppia»). Sono al massimo 3 per
   costruzione; il waterfall del `11` deciderà chi tiene i titoli.
3. **`measure/intero.py`** aggrega tutte le liste: i suoi numeri non sono più comparabili (stessa nota del `08`),
   da rifare col `16`.
4. **Nessun consumatore Node**: le righe arrivano in `/api/mondi` e `/api/bolle`, non nei cataloghi Stremio
   finché non c'è il `13`.
