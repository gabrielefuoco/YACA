Status: resolved
Type: task

# 07 — I falsi vicini sulla mappa: peso normalizzato × coerenza

Il §5.4. Sulla mappa pesata i vicini più forti di una nicchia sono bolle giganti: il seinen anime ha
per 3° vicino una bolla da 155 titoli di cinema italiano, il true crime ha per 1° *Concerto di Natale
con i Flintstones*. La causa: `BB = S.T @ Ws @ S` è la **somma grezza** degli archi, e una bolla da
150 titoli ha cinque volte il volume di fuoco di una normale, senza alcun filtro di coerenza fra i
due centroidi.

La correzione del senior:

    W_mappa(a, b) = BB_ab / sqrt(|a| · |b|) · max(0, cos(μ_a^V3, μ_b^V3))

Dividere toglie il vantaggio di volume, moltiplicare per il coseno fra i centroidi — che è già in
`05-centroidi.npz` — azzera i legami spuri. Da verificare: i tre casi che il senior nomina, e che la
mappa resti **una sola componente** (il vincolo del ticket 23 di `grafo-servibile`).

Esito: la mappa nuova + `ricerche/07-falsi-vicini.md`.

## Esito

**La correzione di §5.4 funziona a metà, e la seconda metà va cambiata.** La divisione per
`sqrt(|a|*|b|)` fa esattamente quello che deve: i falsi giganti cadono di tre ordini di grandezza
(la bolla 12 vede *Flintstones* scendere da 294,7 a 2,99; la 525 vede *Miss Bala* sparire dai primi
posti). Il `cos(mu_a, mu_b)` invece NON discrimina, e su un caso sbaglia: fra i centroidi V3 il
coseno e' positivo nel **99,7%** delle coppie (mediana 0,086), e sulla bolla 525 mette *Miss Bala*
**al primo posto con 0,755** mentre i vicini veri stanno a 0,65-0,70.

La coerenza va misurata **fra esemplari**: `max_{i in a, j in b} cos(v_i, v_j)`. Con quella *Miss
Bala* precipita a **0,130** (i vicini veri: 0,50-0,61) e il talk show recupera *Letterman* (0,715) e
*Jeopardy!* (0,401). Due casi su tre si separano nettamente; il terzo no — i *Flintstones* restano
primi anche per esemplari (0,620), perche' la coerenza per esemplari eredita le debolezze dei pesi
V3 (probabilmente il cast). La forma finale la usa coi soli token tematici, e il ticket 09 la adotta.

Sulla mappa: col peso coerente la mappa **resta navigabile** (una sola componente a ogni k) ma ha un
ginocchio **peggiore** (1,16 contro 1,24 del top-k pesato). Quindi due mappe per due scopi: quella
coerente per **mostrare** i vicini, quella pesata per **navigare**. Vedi
`ricerche/07-falsi-vicini.md`.
