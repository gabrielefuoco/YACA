Status: resolved
Type: task

# 05 — Promozioni semantiche o errori veri: la scomposizione del banco

Il §3.2: sui casi in cui `bolla_predetta != bolla_vera`, calcolare la sovrapposizione di generi e
keyword **pure** (`ge:` + `kw:`) del titolo con la bolla predetta e con quella vera.

Se la bolla predetta è tematicamente più pura di quella vera, non è un errore del collocatore: è una
bolla comportamentale eterogenea che il collocatore ha evitato. Contare separatamente
`propria bolla + bolla tematicamente più pura` **toglie il falso trade-off fra V1 e V3**: il 32,0%
di V3 contro il 35,3% di V1 potrebbe diventare un vantaggio una volta contate le promozioni.

Esito: `05-promozioni.py` + `ricerche/05-promozioni.md`.

## Esito

**V1 BATTE V3 DI 18 PUNTI, e questo ribalta la scelta che avevo fatto.** Col leave-one-out
esatto su entrambe: V1 = **87,3%** di «non e' un errore del collocatore» (63,0% nella propria bolla +
24,3% promosse), V3 = **69,3%** (35,3% + 34,0%). E il verdetto e' forte perche' la metrica delle
promozioni usa generi e keyword — cioe' proprio i token che V3 pesa x1,5 — quindi e' a favore di V3,
e V1 vince lo stesso.

**La collocazione delle serie non e' 35,3%: e' 63,0%.** Il numero che ho ripetuto per ore era con V3;
con V1, sulle stesse 336 candidate e con lo stesso LOO esatto, quasi raddoppia.

**IL QUARTO LEAK DELLA SESSIONE, e l'ho commesso io**: la prima esecuzione dava a V1 il 69,2% perche'
il leave-one-out non c'era (la serie e' membro della sua bolla, e si regalava 1/n di coseno: +0,033 su
una scala dove i coseni veri stanno fra 0,02 e 0,2). Il contratto `assert_loo_esatto` del ticket 01
esiste, e' testato, ferma 4 casi su 4 — **e non l'ho chiamato**. Averlo scritto non basta.

Conseguenza: due livelli, due pesature — V1 per la bolla (macro), V3 per i dieci titoli (micro). Non e'
un compromesso: sono due domande con due risposte misurate.
