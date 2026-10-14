Status: ready-for-agent
Type: task

# 04 — La coerenza sulla trama: l'arbitro che non usa la co-visione

Il §3.1: `V3` usa generi, keyword, cast, registi, reti, case, paesi — **mai il testo della trama**.
Quindi la similarità fra le trame è una misura **indipendente** di qualità semantica, l'unica che
valga anche per un'uscita del 2026.

Da fare, tenendo conto di due ostacoli **misurati** (non ipotizzati):
- l'`overview` manca per il **58,8%** dei film e il **51,5%** delle serie → il campione va dichiarato,
  e il bias (i film senza trama sono i meno noti) va scritto;
- le trame presenti sono **in italiano** e `bge-small-en-v1.5` è un modello **inglese** → prima si
  **misura** se su un testo italiano dà comunque un segnale relativo utile (due trame simili contro
  due a caso), e solo dopo si costruisce la metrica. Se non lo dà, si dice e si propone il modello
  multilingue, invece di produrre numeri che non significano niente.

Poi: `Sim_trama` media fra ogni titolo del banco e i suoi 10 vicini micro, e fra il titolo e il
centroide di trama della bolla predetta — per V1 e per V3, così il disaccordo col banco diventa una
misura e non un sospetto.

Esito: `04-trama.py` (con l'embedding salvato) + `ricerche/04-trama.md`.
