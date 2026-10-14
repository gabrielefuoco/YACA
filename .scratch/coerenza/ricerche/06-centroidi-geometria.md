# Ticket 06 — Il bug geometrico dei centroidi: top-M e ibrido

`Status: resolved` · 14/10/2026 · `06-centroidi-geometria.py` (log in `log/06-centroidi-geometria.log`)

**Due risultati, uno dei quali cambia la diagnosi del senior, e uno che la conferma in modo brutale.**

1. **Il top-M peggiora** (32,0% → 28,5% a `M=15`): la §5.1.1 non funziona.
2. **L'ibrido con i top-5 esemplari porta a 33,2%** — un guadagno vero ma piccolo, **+7,7 punti sulle
   bolle da più di 120 titoli**, che è dove stava il problema.
3. **E la prima misura dell'ibrido dava 55,8%.** Era tutta **data leakage**: la serie in esame è
   *membro* della sua bolla, quindi la sua auto-similarità (1,0) entrava nei top-5 esemplari. È
   **esattamente** il leak che il senior prevede in §4.1, e il suo contratto l'ha fermato.

---

## Il confronto, col leave-one-out esatto

| variante | propria bolla | 10-30 | 30-60 | 60-120 | 120+ |
|---|---|---|---|---|---|
| **com'è adesso** | 32,0% | 21,8% | 34,1% | 31,2% | 36,5% |
| top-M = 100 | 31,7% | 19,2% | 34,1% | 31,6% | 34,6% |
| top-M = 50 | 31,2% | 20,5% | 33,6% | 30,4% | 34,6% |
| top-M = 35 | 30,0% | 19,2% | 33,2% | 28,7% | 32,7% |
| top-M = 25 | 29,8% | 20,5% | 34,1% | 27,0% | 32,7% |
| top-M = 15 | **28,5%** | 19,2% | 31,9% | 27,8% | 25,0% |
| **ibrido + top5** | **33,2%** | 20,5% | 31,9% | **35,0%** | **44,2%** |
| ibrido, top-M=50 | 32,2% | 20,5% | 31,4% | 33,3% | 42,3% |
| ibrido, top-M=35 | 32,0% | 20,5% | 31,0% | 33,3% | 42,3% |

**Il top-M taglia informazione e basta**: tenere i 25 o i 35 token più alti di un centroide grande
significa buttare via proprio i token che descrivono i sotto-filoni — e i sotto-filoni sono la ragione
per cui le bolle grandi esistono. Il diagnosi del senior («la L2 compatta i token principali di un
fattore 3-4×») è **vera come misura** ma **non è la causa del problema**, perché:

```
correlazione fra dimensione della bolla e successo, con V3:  r = +0,003
```

**Non c'è nessun vantaggio sistematico delle bolle piccole.** La curva 100% → 21% che il senior cita
era misurata sulla variante **V0**, e con V3 la correlazione è nulla. La curva per fascia resta
(71,4% sotto i 10, 36,5% sopra i 120), ma è guidata da **una fascia sola**: le bolle sotto i 10 titoli,
che sono mondi di 5-8 film e si trovano per definizione. Sopra i 10 titoli la dimensione non predice
niente, e non c'è nessuna distorsione geometrica da correggere.

## L'ibrido: piccolo, e concentrato dove serve

`0,5·⟨x, μ_b⟩ + 0,5·(1/5)Σ_{j∈Top5(b,x)} ⟨x, v_j⟩` porta **+1,2 punti** complessivi, ma la
distribuzione conta più della media: **+7,7 sulle bolle sopra i 120 titoli** e −2,2 su quelle fra 30 e
60. Ha senso: un esemplare serve quando il centroide è una media di cose diverse, e non serve quando la
bolla è già un mondo. **Va adottato**, con la nota che sulle bolle medie è leggermente peggio e che la
soglia dove accenderlo (per dimensione? per purezza?) non è ancora tarata.

## Il leak, e il contratto che l'ha fermato

La prima esecuzione stampava **55,8%** (335/600) e una curva appiattita: 21,8% → 50,0% → 60,2% → 52,3%
→ 59,6%. Sarebbe stato il risultato dell'effort.

Poi ho guardato il codice del top-5 e ho visto che `T[:, membri]` include la serie in esame quando la
bolla è la sua. `T[i, i] = 1,0` è il massimo della riga, quindi entra **sempre** nei top-5 e regala
alla bolla vera un quinto di 1,0. Azzerando il solo elemento diagonale:

```
ibrido, senza top-M + top5      33,2%
```

**Da 55,8% a 33,2%.** Un guadagno illusorio di 23,8 punti, sparito con una riga. E la curva che
sembrava appiattita si è **ri-monotizzata** (20,5% → 31,9% → 35,0% → 44,2%), perché il leak gonfiava
soprattutto le bolle grandi — dove il segnale vero è più debole e la costante 1,0 pesava di più.

È il **terzo leak di questa sessione** (il leave-one-out incompleto da 63,7%, il `tasso_base` senza
riferimento da 58,27%, e questo). Il senior ha ragione a chiedere un contratto automatico: la
disciplina di «ricalcolare per un'altra via» ha funzionato tre volte su tre, ma è una disciplina, non
un controllo.

## Cosa va nel collocatore

- **Lo scoring ibrido**, con l'avvertenza sulle bolle medie.
- **Niente top-M.**
- E il **contratto `assert_loo_esatto`** del ticket 01, che qui ha la sua prima prova concreta.
