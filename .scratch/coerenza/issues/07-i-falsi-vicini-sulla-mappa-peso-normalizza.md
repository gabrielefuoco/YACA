Status: ready-for-agent
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
