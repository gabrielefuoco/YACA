# Gli arbitri

Questi script **misurano** il sistema. Non costruiscono niente: dicono se quello che c'e' funziona.

Sono qui e non nell'archivio perche' il 15/10/2026 hanno corretto le metriche **sei volte**:

1. *Verity* in bolla 820 — l'occhio diceva «minestrone», i numeri dicevano «coerente»
2. il banco al 27,7% per i film — e l'occhio, su 100 inserimenti, diceva ~90 giusti
3. «la metrica di trama non discrimina» — era il modello: `bge-small-en` comprimeva le trame
   italiane in 0,74 ± 0,01
4. le saghe «spezzate» a RB 200 — erano **adiacenti** sulla mappa: 0 spezzate su 1.994
5. il «minestrone» da 543 titoli — che a RB 200 scende a 341 e resta l'unico senza nome
6. il voto di trama nella collocazione — «migliora l'occhio», e **peggiora il banco di 6 punti**

**La regola che ne esce**: quando due misure dicono cose diverse, non e' un errore — e' una domanda
sbagliata. E prima di dichiarare che una cosa non funziona, si guardano i risultati uno per uno.

Si lanciano come script:

```bash
python graph/measure/saghe.py          # le collezioni TMDB e la mappa
python graph/measure/contratti.py      # il retro-test dei contratti
python graph/measure/coerenza.py       # l'indice di chimera e N_eff
```

**Non sono test automatici** (`pytest`): sono misure da leggere. Il prodotto ha 177 file in `tests/`,
e questo modulo **non ne ha nessuno** — i contratti di `canon.py` sono assert a runtime, non una suite.
E' un buco vero, ed e' scritto qui invece che nascosto.
