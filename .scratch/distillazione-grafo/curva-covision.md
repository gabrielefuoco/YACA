# Curva COVISION: accuratezza contro ridondanza

Misura a due assi, sulla stessa configurazione (9 tipi, RRF k=15, damping coll+titolo, `gate_popolarita`
tau 3,0 slope 1,5, chiusura `--alpha0 0.1`). Cambia solo il peso di COVISION.

- **Accuratezza**: banco curato 499 voci (qui i candidati sono solo film, quindi i valori assoluti sono
  più bassi di `eval-gold`: conta il confronto fra righe).
- **Ridondanza**: quota di titoli con >5.000 voti nella top-10, su 200 semi popolari scelti a caso;
  e la stessa quota sui nostri 8 seed.

| COVISION | R@5 | R@10 | R@20 | MRR | >5k top-10 | voti mediani | 8 seed |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2,2 (V18) | 0,059 | 0,090 | 0,124 | 0,136 | 74,5% | 8.324 | 59% |
| 1,5 | 0,059 | 0,090 | 0,125 | 0,138 | 69,8% | 7.928 | 51% |
| 1,0 | 0,059 | 0,090 | 0,126 | 0,138 | 66,4% | 7.352 | 48% |
| 0,5 | 0,059 | 0,089 | 0,126 | 0,138 | 62,0% | 6.820 | 39% |
| 0,0 | 0,059 | 0,088 | 0,123 | 0,137 | 54,9% | 5.762 | 26% |

## Lettura

Il ginocchio è a **0,5-1,0**: la quota di blockbuster scende di 8-12 punti senza perdita misurabile
(R@20 e MRR anzi guadagnano 0,001-0,002). A 0,0 comincia a costare. COVISION a 2,2 non comprava
accuratezza: comprava ridondanza.

## Effetto qualitativo

- **Drive**: da «solo film di macchine famosi» a *Cogan - Killing Them Softly*, *Solo Dio perdona*,
  *7 psicopatici* (2.000-4.500 voti) — stesso registro, meno ovvio.
- **The Truman Show**: entra *EDtv* (724 voti), che è il Truman Show messicano: COVISION trova il
  gemello di nicchia che nessun segnale di trama troverebbe.
- **Barbie**: peggiora (entrano *Pinocchio*, *La sirenetta*). Il suo segnale forte non era la
  co-visione ma i tag «giocattolo/fantasy», che restano deboli sugli altri tipi.

## Perché contava

`gate_popolarita(tau=3.0)` non tocca gli archi fra titoli di pari popolarità (sotto ~20x di rapporto):
per un seed popolare il gate non diversifica nulla. Il peso di COVISION era l'unica leva che
spingesse i primi posti fuori dalla «stessa lega».

## Artefatti

- `services/graph/data/v18cov-{1.5,1.0,0.5,0.0}/bolle-eterogeneo-COV*-p1.0-triangolo.npz`
- misura: `.scratch/distillazione-grafo/misura-curva.py`
- build: `.scratch/distillazione-grafo/sweep-covision.sh`, `build-cov0.sh`
