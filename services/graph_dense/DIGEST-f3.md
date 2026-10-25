# Digest — implementazione `f3_subspace_autoint` (per revisione senior)

Codice scritto, **non eseguito**. Obiettivo: farti validare decisioni e contratti prima di bruciare GPU.
Modulo: `services/graph_dense/` (nuovi file, niente modifiche a `services/graph/`).

## 1. File nuovi e ruolo

| file | ruolo |
|---|---|
| `canon_clean.py` | Slot 1: audit + `canon-clean.npz` (`keep`, `date`, `anno`). Non muta gli originali. |
| `yc_impute.py` | `Ŷc[missing] = A[missing,raw]·Yc[raw]`, righe di A normalizzate. Solo per i target. |
| `centroids.py` | `mu_dir`, `mu_coll` per film: LOO + shrinkage `m=3` verso il prior. Solo `Yc` grezza. |
| `fusion_target_v2.py` | Target nuovo: pool `top40(b10) ∪ top40(m1) ∪ top25(beh)`, rerank `cos+0.3·beh`, filtro medium 2 regole, fusione per confidenza, top-50. Checkpoint/ripresa. |
| `beh_target.py` | Target comportamentale `Z_beh`: top-50 di `beh_puro` (0.5 graph + 0.5 Yc_full). |
| `model_f3.py` | Multi-Subspace: `SemBranch` (Bp+Bk→768), `FieldBranch` (AutoInt→768), `BehBranch` (AutoInt+centroidi→512), `F3.concat` con i pesi a inferenza. |
| `train_f3.py` | Tre loss listwise **isolate** (sem/field/beh), **nessuna** loss sul concatenato; `Z_all` ricalcolato ogni 5 epoche; checkpoint; salva `Z`, `Z_sem`, `Z_field`, `Z_beh`. |
| `eval_f3.py` | Trap Set (contamination@5/@10, hit@10) + Yc held-out (GT, 3 fasce, Set A/B, recall@20). |
| `data/trap-set.json` | 50 titoli, 5 categorie. **Solo i 5 casi bandiera sono compilati**; il resto è TODO (validazione utente). |

## 2. Ordine di esecuzione

```bash
py -m services.graph_dense.canon_clean --report        # poi --write
py -m services.graph_dense.yc_impute
py -m services.graph_dense.centroids
py -m services.graph_dense.fusion_target_v2            # ~2-3 min, checkpoint
py -m services.graph_dense.beh_target                  # top-50 beh_puro
py -m services.graph_dense.eval_f3 --build-splits      # yc-split.npz (una volta)
py -m services.graph_dense.train_f3 --epoche 40 --nome f3 --ckpt-every 10
py -m services.graph_dense.eval_f3 --modello f3 --trap
py -m services.graph_dense.eval_f3 --modello f3 --yc
```

## 3. Decisioni prese (da validare)

1. **Titolo / bag-of-tokens.** Il vocabolario (79.281) contiene **solo token prefissati** (`ca:`, `kw:`, `co:`…): il titolo **non è nel bag**. Vive solo dentro `Bp` (payload «titolo. trama»). Quindi la rimozione «a costo zero» è un no-op: per l'A/B vero bisogna **ri-embedare le trame senza titolo** (`embed_trama.py`, ~14 min) e rifare 2 run. Nel codice non ho toccato `Bp`; il flag per il payload senza titolo non l'ho aggiunto (aspetto la tua decisione).
2. **`Bk` in un solo ramo.** Applicato il punto B: `Bk` solo in `Z_sem`; `Z_beh` = AutoInt + centroidi, niente keyword.
3. **Prior dei centroidi.** Usato il **prior globale** (media di `Yc` grezza) invece di studio/genere: il prior di studio che avevi indicato richiede il campo company, che nel canone non è strutturato (è un token `co:` dentro X_meta, non un id). Se vuoi il prior per genere/studio va aggiunto un mapping esplicito.
4. **Filtro medium, Regola 1.** Implementata come: query non-animazione, candidato animazione, rating in {G,PG,TV-Y,TV-G} o assente, **stessa `COLL`** → ×0.15. Il «token del titolo/studio d'animazione» non è implementabile (il titolo non è un token); la stessa `COLL` copre il caso Barbie. Da confermare.
5. **Fusione v2.** `T=0.02`, confidenza = gap assoluto `s[0]-s[1]`, `w = gap_b/(gap_b+gap_m)`, score `w·p_b+(1-w)·p_m`. `beh` non è un terzo modello con softmax: entra solo via `+0.3·beh` e via il pool `top25`. Coerente con la tua risposta 3, ma **il target non ha un peso esplicito per il ramo beh**: se lo vuoi, va aggiunto.
6. **Target `Z_beh`.** Top-50 di `beh_puro` (0.5 graph + 0.5 Yc_full, pesi normalizzati). Non è la riga intera del grafo: è la combinazione graph+Yc su 50 candidati. Il grafo resta teacher solo nella loss, mai in input.
7. **Memoria del training.** `Z_all` (embedding di tutti i 66k) ricalcolato ogni 5 epoche per limitare la VRAM; il rischio è che i negativi in-batch siano leggermente stale. In alternativa: `Z_all` ogni epoca (più lento) o `--refresh 1`.
8. **Gate 0.** Implementato come fit separato per ramo (`sem/field/beh`) + concat, ma **`train_f3.py` non calcola il fit**: va aggiunto un blocco `--train-eval` che misura `fit(Z_field)>0.14`, `fit(Z_concat)>0.255` e `fit(Z_field)>0.190` (le tre soglie della specifica). Da completare prima del run.

## 4. Punti che ti chiedo di rivedere

- **Il codice del `BehBranch`/`FieldBranch`** costruisce i token per campione con una gather (`h[rows, local] = e`): è la parte più fragile (lunghezze variabili, `src_key_padding_mask`). Va rivista/benchmarkata contro `FieldStudent` di `train_b3.py`.
- **Set B.** La mascheratura a monte (5 vicini GT tolti da `Yc` e dal grafo prima dei target) **non è implementata**: `eval_f3.py` calcola la metrica assumendo che il target sia già stato costruito con la maschera. Serve uno script che applichi la maschera **prima** di `fusion_target_v2`/`beh_target` per i 900 film. Oggi il Set B è solo la metrica, non il protocollo completo.
- **Trap Set.** Solo 5 bandiera compilati. Le liste «bad/good» per gli altri 45 titoli richiedono la validazione umana (250 giudizi se 5 good per titolo). Il gate `cont@10<=1` non è calcolabile finché il set non è completo.
- **`Z_sem` target.** Uso `mercury-target.npz` (66k, misto). Se preferisci `sem-top25.npz` per il ramo semantico, è un flag da aggiungere.
- **Il `fit` del `Z_field`**: con solo 17 campi e target comportamentale, la soglia 0.14 di non-collasso è arbitraria. Se il senior ha un valore atteso migliore, lo fissiamo.

## 5. Numeri attesi (dal tuo spec)

- Gate 0: `fit(Z_field)>0.14` (non-collasso), `fit(Z_concat)>0.255`, `fit(Z_field)>0.190`.
- Gate 1: `cont@5=0` sui 5 bandiera, `cont@10<=1` per categoria, `hit@10 >= b10`.
- Obiettivo dichiarato: **22-25% recall@20** contro il grafo, rompendo il tetto 20-22% senza `lc150`.

## 6. Cosa non ho scritto (per scelta)

- La variante `trama` senza titolo (ri-embedding): aspetto la decisione sul punto 3.1.
- La maschera upstream del Set B (punto 4).
- Il blocco `--train-eval` con il fit (punto 3.8).
- I 45 trap set mancanti (validazione utente).

Se dai l'ok su 3.1, 3.4, 3.5 e 4 (Set B), completo questi quattro pezzi e il codice è pronto per il run.
