# 01 — Il gate: MovieLens copre il catalogo abbastanza da valerne la pena?

**Status**: `wontfix` · **Type**: `research` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: nessuno

## Domanda

Il teacher esiste, ma copre il *nostro* catalogo? Se coprisse solo i blockbuster che già conosciamo, la
distillazione non varrebbe il lavoro.

## Risposta: sì, e copre proprio la parte non-blockbuster

| Misura | Valore |
|---|---|
| Catalogo | 97.613 film + 19.585 serie |
| Film coperti | **62.516 (64,0%)** — ≥100 voti TMDB: 87,9% · ≥1.000: 93,3% |
| Serie coperte | **0** (`links.csv` rimanda solo a `/movie/{id}`) |
| Decennio 2020s | **36,5%** (snapshot fine 2023) |
| **Nostri film con ≥20 voti MovieLens** | **22.551** · mediana 228 voti TMDB · di cui solo il **20%** è "popolare" da noi |

Due letture che contano: **l'80% dei film coperti non è popolare** nel nostro catalogo (la nicchia c'è), e il
**buco è dove serve lo student** — serie (0%) e 2020s (36,5%). Il teacher vale perché la sua lezione si
trasferisce ai metadati.

**Conseguenza**: il filone va avanti. Ma il limite è dichiarato fin qui, non alla fine: le serie sono l'80%
delle cronologie reali e MovieLens è cieco (vedi [ticket 12](12-trasferimento-serie.md)).

## Chiusura

Chiuso con la mappa il 10/11/2026, per decisione esplicita. La mappa era già chiusa come ricerca il 13/10/2026 e l'esito è nel V45 servito oggi; i ticket rimasti erano la coda da «passare in rassegna». Restano scritti qui: se una domanda tornerà utile, si riparte da questo testo invece che da zero.
