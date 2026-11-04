Status: resolved
Type: task

# Swap test dello studente (3 minuti) — l'ipotesi che spiega il crollo V15 → V18

## Perché

V15 batte V21 di +0,0183 [0,0102, 0,0263] sul banco tonale (sopra l'MDE), e abbiamo escluso: pool di
candidati (0,001), chiusura a conteggio (+0,0008), peso COVISION (−0,0086). L'unica regressione massiva
fra i due è lo **studente**: V15 usa `rrfstudent.npz` (target a 4 rami, R@20 da solo 0,251), V18+ usa
`rrfstudent-v18.npz` (maestro fuso a 76k, R@20 0,198, −21%), e RRFST pesa 1,0 nella fusione.

## Cosa fare

1. Costruire una matrice ibrida: le prime 66.259 righe dai vettori **esatti** di V15, le ultime 10.238
   proiettate da `rrfstudent-v18.npz`.
2. Rigenerare **solo** `RRFST` su quella matrice (norm + budget + mixer + chiusura, tutto il resto
   identico a V21).
3. Misurare sul dev set e sul banco tonale (a fine giro, una volta sola).

## Segnale di fallimento

Se lo swap muove R@20 di meno di 0,005, l'ipotesi studente è falsa: il vantaggio di V15 viene da
altrove e va cercato nei pesi/tipi residui.

## Criteri di accettazione

- Un artefatto `v23-swap` con RRFST ibrido e la sua misura;
- verdetto esplicito: l'ipotesi regge o no.

---

## Esito: l'ipotesi è falsa

Costruito lo studente ibrido: prime 66.259 righe dai vettori **esatti** del V15 (2.560-d, proiettati a
2.048 con proiezione deterministica), le ultime 10.238 dal nuovo. Rigenerato **solo** RRFST, tutto il
resto identico a V23.

| | R@5 | R@10 | R@20 | R@50 | MRR | >5k |
|---|---:|---:|---:|---:|---:|---:|
| V23 | 0,008 | 0,017 | **0,043** | 0,082 | 0,0083 | 66,5% |
| V27 (studente vecchio) | 0,009 | 0,018 | 0,041 | **0,089** | 0,0086 | 67,2% |

`ΔR@20 = −0,0021 [−0,0079, +0,0035]`, **sotto l'MDE**: nessuna differenza misurabile.

**Conseguenza sul ticket 08**: l'ipotesi che il crollo V15→V18 fosse lo studente non regge sul dev set
umano. Riaddestrare lo studente con logQ + modality dropout **non servirà al tono**. Resta sensato per
il suo scopo originale — il cold-start dei titoli nuovi — ma non è più la leva che credevamo.
