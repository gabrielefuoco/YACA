Status: resolved
Type: research

# 16 — Le sei raccomandazioni del senior: esito

Il senior (risposta esterna, 22/10) ha indicato: tabella libera come teacher/bank e ancora
diretta, niente multi-vettore, metrica sul teacher ripulito + NDCG, riga intera + denoising voti,
sinossi per i senza-trama, consolidare m1. Tutte eseguite o chiuse con un motivo.

| esperimento | modifica | train rec | own | quartiere | recall@20 |
|---|---|---:|---:|---:|---:|
| **m1** | riferimento (512-d, bank mobile, γ=0,5) | 27,7% | **24,9%** | **41,9%** | **16,9%** |
| f1 | bank = tabella libera 512-d + ancora λ=1 | 30,2% | 21,2% | 40,6% | 13,6% |
| f2 | bank fissa + votsup + token pg | 31,7% | 21,6% | 40,9% | 13,6% |
| f3 | m1 + token pg + trame al 99,7% | 30,3% | 23,4% | 42,7% | 16,4% |
| f4 | m1 + trame al 99,7%, senza pg | 29,2% | 23,2% | 41,8% | 16,3% |
| f5 | m1 + votsup, senza pg | vedi report §12 | | | |
| tabella libera 512-d | diagnosi | 65,7% | — | — | — |

## Esiti

- **Tabella libera come ancora o bank: no.** Alza il train e affonda il test (-3,3): l'encoder
  insegue le idiosincrasie dei vettori liberi e memorizza invece di generalizzare. Il tetto della
  tabella libera è 65,7%, non 100%.
- **Multi-vettore: non fatto** (sconsigliato dal senior; già negativo in A5/A7/t1).
- **Metrica sul teacher ripulito + NDCG**: `eval-teacher.py`. Il teacher con holdout azzera le
  righe di test, quindi si valuta sul grafo pieno ripulito (floor/supporto). m1 17,34% / NDCG 20,61;
  f3 16,96 / 19,81. Classifica invariata.
- **Riga intera + γ=0,5: confermati.** Token pg neutri/negativi. Denoising voti isolato in f5.
- **Senza trama**: 70,6% dei film ha <50 voti (82% serie), 96,4% <200; nessuna sinossi in altre
  lingue nei Parquet (`ita` è un booleano). **Le sinossi vere esistono su TMDB**: `fetch_overview.py`
  ne ha recuperate **30.157** (99,3%) in ~16 min; copertura trama 54,2% → **99,7%** (66.048) in
  434 s. Effetto sul metrico: nullo (f4 16,3 vs m1 16,9). La pseudo-trama generata sarebbe stata
  inutile, come previsto.
- **Tetto 20-25%: coerente** (m1 16,9, teacher 17,3, oracolo bolla 32,3, kNN 11,0).

## Conclusione

Nessuna leva del senior batte m1. Il gap con la tabella libera (65,7% train) è informazione
assente nelle feature, non capacità. Artefatto: m1 (512-d).
