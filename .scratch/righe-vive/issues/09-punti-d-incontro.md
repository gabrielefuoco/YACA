Status: ready-for-agent
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
