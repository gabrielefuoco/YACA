# 66 — La passata di sottrazione: cosa si può togliere, e cosa no

**Il mandato**: smettere di aggiungere. La ricetta aveva 5 componenti + la curatela e ~15 parametri, tarati **a strati** — pesi uguali (report 49), poi `CF`×5 e `k`=60 (56), poi `CFst`×3 (54), poi `B`×5 (64). **Nessuno ha mai tolto niente.** L'ablation era stata fatta una volta sola, sul grafo a pesi uguali e sul solo metro del prodotto.

**L'esito**: tre cose si possono togliere — **`Kc` non serve a niente, i temi sono neutri, e la curatela fa male alle serie**. Ma il quadro finale **non è una vittoria netta**: il catalogo film preferisce la ricetta completa, e la spiegazione è che **i due banchi premiano i componenti del proprio dominio**.

Script: `ablazione.py` (2.791 s) · `ricetta-minima.py` · `confronto-finale.py` (1.407 s).

---

## 0. Il banco è triplicato

Il fetch Trakt è stato allargato da 400 a **1.200 autori di liste** (1.416 disponibili), stessa profondità (3 pagine × 100). Il banco passa da **356 a 1.063 utenti** con ≥20 film e ≥10 serie.

**Tutti i numeri del catalogo serie di questo report sono su 1.063 utenti invece di 178 per metà.** Era il punto debole dichiarato del report 65.

## 1. L'ablation: un componente per volta, dalla ricetta finale

Delta in punti percentuali togliendo quel componente (banco Trakt a 374 utenti per questa tabella):

| tolto | FILM @10 | FILM @100 | PROD @100 | PROD @500 | SERIE @10 | SERIE @100 | SERIE @500 |
|---|---|---|---|---|---|---|---|
| *(completa)* | *4,51* | *21,16* | *28,73* | *62,48* | *1,99* | *17,37* | *46,00* |
| **senza `CF`** | **−1,44** | **−7,06** | **−17,71** | **−33,11** | +0,05 | +0,24 | +0,23 |
| senza `CFst` | −0,08 | −0,15 | +0,12 | +0,25 | +0,02 | −0,81 | −3,07 |
| **senza `Kc`** | −0,02 | −0,08 | **+0,10** | **+0,25** | +0,01 | +0,10 | +0,08 |
| senza `B` | −0,03 | −0,26 | +0,01 | −0,04 | −0,09 | −1,80 | −6,14 |
| **senza `T`** | +0,08 | −0,17 | −0,08 | +0,11 | +0,00 | +0,15 | — |
| **senza la curatela** | +0,01 | +0,27 | **+1,19** | **+1,27** | **+0,99** | +0,51 | — |

### Le tre cose che si possono togliere

**1. `Kc` — i metadati puliti — non serve a niente, da nessuna parte.** Toglierlo costa **−0,08** sui film, **−0,10** sulle serie, e sul prodotto **migliora** (+0,10 @100, +0,25 @500). Era uno dei cinque pilastri, il SVD-128 del TF-IDF delle 7.934 feature. **Non contribuisce nulla.** Coerente con tutto il resto: il contenuto non contiene il comportamento (report 51) e non predice il gusto di un intenditore (report 62).

**2. `T` — i temi — è neutro** (±0,17 ovunque). La tassonomia scritta a mano non sposta niente.

**3. La curatela fa male.** Toglierla **migliora tutto**: +1,19 @100 e +1,27 @500 sul prodotto, **+0,99 al @10 sul catalogo serie** (1,99% → **2,97%**, cioè **+50%**), +0,27 sui film. I 3.417 legami scritti a mano, che pesavano 0,60, erano **zavorra** — e la loro giustificazione era il metro curato, che il report 62 ha dimostrato essere rotto e premiare gli artefatti.

### I due componenti che dividono i cataloghi

| | serve ai FILM? | serve alle SERIE? |
|---|---|---|
| **`CF`** (comportamento MovieLens) | **sì, moltissimo** (−7,06 @100) | no (+0,24 togliendolo) |
| **`CFst`** (pubblico previsto) | no (−0,15) | **sì** (−0,81 @100, −3,07 @500) |
| **`B`** (co-visione Trakt) | no (−0,26) | **sì** (−1,80 @100, −6,14 @500) |

**I componenti essenziali dei due cataloghi sono disgiunti.** Il catalogo film è un problema di **comportamento**; il catalogo serie è un problema di **similarità** (il pubblico previsto e la relatedness), perché il comportamento delle serie **non esiste**.

## 2. La ricetta minima, e il confronto pulito

Sul banco nuovo (1.063 utenti), stessa esecuzione, stesse misure:

| | FILM @10 | FILM @100 | FILM @500 | PROD @100 | PROD @500 | PROD @2000 | SERIE @10 | SERIE @100 | SERIE @500 |
|---|---|---|---|---|---|---|---|---|---|
| **A) COMPLETA** — 5 componenti + curatela | **4,63** | **21,19** | **45,81** | 28,73 | 62,48 | 88,49 | 2,02 | 17,30 | 45,70 |
| **B) MINIMA** — `CF` / `CFst`+`B` | 4,09 | 19,73 | 43,39 | **29,31** | **63,35** | **89,87** | **2,95** | **18,08** | **46,12** |
| **differenza (B − A)** | −0,54 | **−1,46** | **−2,41** | **+0,58** | **+0,87** | **+1,38** | **+0,94** | **+0,79** | **+0,42** |

**Non è una vittoria netta.** La ricetta minima vince su **due** misure su tre:
- **catalogo serie**: +0,94 / +0,79 / +0,42 — meglio su **tutte** le profondità;
- **prodotto** (MovieLens): +0,58 / +0,87 / +1,38 — meglio su tutte;
- **catalogo film (Trakt)**: **peggio** (−1,46 @100, −2,41 @500).

## 3. Perché il catalogo film preferisce la ricetta completa

E qui c'è la cosa che vale più di tutte: **i due banchi premiano i componenti del proprio dominio.**

- Il **catalogo film di Trakt** è misurato su **utenti Trakt**, e la ricetta completa contiene `B` (la co-visione **Trakt**) e la curatela (costruita su **Trakt**). Toglierle costa −1,46.
- Il **prodotto** è misurato su **utenti MovieLens**, e la ricetta completa contiene `CF` (il comportamento **MovieLens**) a peso 5. Il minimo, con `CF` da solo, vince.

**Ogni banco premia la propria origine.** E nessuno dei due è YACA: gli utenti YACA non si possono usare (sono test dell'utente).

**Conseguenza onesta**: **la ricetta del catalogo film non è determinabile dai dati che ho.** So che il minimo vince sul metro MovieLens e che il completo vince sul metro Trakt, e i due si contraddicono. Servirebbe un banco di un terzo dominio, o una scelta di prodotto.

**Sul catalogo serie invece non c'è ambiguità**: la minima vince su tutte le profondità, e il banco è lo stesso per entrambe le ricette.

## 4. Cosa si guadagna in semplicità

| | prima | dopo |
|---|---|---|
| componenti del grafo | **5** + curatela | **1-2** |
| pesi da tarare | 5 + curatela + `k` + β | `k`, β (e il rapporto `CFst`/`B`, che è 1:1) |
| parametri liberi | ~15 | **~4** |
| **curatela** | 0,60 | **0** |

E la cosa che vale più di tutte per il progetto: **la curatela non serve più**. Il vincolo che l'utente aveva posto — «niente curatela a mano come metodo» — **non è più un vincolo**: nella ricetta minima non c'è nessuna curatela.

## 5. La ricetta minima

```
catalogo FILM    CF da solo, senza curatela            (k-NN 60, beta 0,50)
catalogo SERIE   CFst + B a pesi uguali, senza curatela (k-NN 60, beta 0,50)
```

Con `k`=60 e β=0,50 che restano — ma **anche quelli vanno ritestati adesso che il grafo è più semplice**: erano stati tarati su un grafo a 6 componenti.

## 6. Cosa resta aperto

1. **Il conflitto fra i banchi** sul catalogo film (Trakt preferisce il completo, MovieLens il minimo): è la domanda vera, e non si risolve con i dati che ho.
2. **Ritarare `k` e β sulla ricetta minima** — erano ottimi di un grafo diverso.
3. **L'ablation va rifatta sul banco nuovo** (1.063 utenti): la tabella del §1 è su 374. I segni non cambieranno, i valori sì.
4. **I titoli nuovi** restano il buco: dodici volte peggio di uno già noto.
5. **Lo split temporale**: mai fatto.
