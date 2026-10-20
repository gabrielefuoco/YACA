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
- **Fallback con semi veri**: si scelgono i due mondi più lontani **fra quelli che hanno almeno un seme**
  (`scegli_mondi` con `largo = 2`, `lontano = 1.0`), e ogni mondo cammina dai **propri** semi. Se i semi stanno
  tutti in un mondo solo, la riga **lo dichiara** (vuota + motivo): un ponte senza due sponde non esiste, e
  inventare i semi dell'altra sponda sarebbe peggio del silenzio.
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
