
# 21 — Il ranker: la popolarità si batte (per la prima volta)

**Data**: 08/10/2026 · 300 account sintetici (split temporale) · 727.646 righe (una per candidato) · train 150 account / test 150

## Protocollo (dichiarato prima)

- **universo di candidati identico** per tutti gli ordinamenti: pool di produzione + 2 hop del grafo;
- **train e test separati per account** (mai lo stesso account in entrambi): il modello vede 150 utenti,
  ne giudica altri 150;
- **la popolarità è sempre in tabella** come controllo banale;
- il ranker è una **regressione logistica su 7 feature standardizzate** — poche, interpretabili, niente
  capacity: i pesi si leggono e si discutono.

Feature: `prod` (scorer di produzione) · `lpop` (log voti) · `collab` (coseno nello spazio collaborativo) ·
`yeardiff` (distanza dall'anno mediano) · `genrec` (generi condivisi) · `in1`/`in2` (vicino diretto / a
distanza 2 nella cronologia).

## Potere di ogni feature da sola (AUC su account mai visti)

| feature | AUC | lettura |
|---|---|---|
| lpop | 0.791 | la popolarità è forte, da sola |
| **prod** | 0.718 | lo scorer di produzione è meglio del caso |
| in1 | 0.672 | essere vicino diretto di un titolo visto conta |
| collab | 0.654 | la posizione collaborativa, da sola, è debole |
| in2 | 0.601 | |
| genrec | 0.516 | i generi condivisi non dicono quasi niente |
| yeardiff | **0.330** | **sotto 0.5 = segnale negativo**: più lontano nell'anno, meno probabile |

## Il ranker batte la popolarità

| ordinamento | @50 | @200 |
|---|---|---|
| popolarità (controllo banale) | 12,5% | 36,0% |
| **scorer di produzione** | 8,0% | 27,2% |
| posizione collaborativa | 9,0% | 24,1% |
| generi condivisi | 2,6% | 10,5% |
| **RANKER (7 feature)** | **17,9%** | **48,9%** |
| RANKER senza la scelta del grafo (5) | 16,7% | 47,5% |

**+43% su @50 e +36% su @200 rispetto alla popolarità. E 2,2× lo scorer di produzione.**

| strato | popolarità | collab. | scorer prod. | **RANKER** |
|---|---|---|---|---|
| fondo (nicchia) | 6,0% | **11,2%** | 5,7% | **16,7%** |
| resto (mainstream) | 17,5% | 7,3% | 9,8% | **18,8%** |

## Pesi (standardizzati) — la parte più informativa

| feature | ranker 7 | ranker senza grafo (5) |
|---|---|---|
| lpop | **+1.222** | +1.357 |
| **collab** | **+0.646** | +0.776 |
| in1 | +0.250 | — |
| genrec | +0.121 | +0.089 |
| in2 | +0.043 | — |
| **prod** | **+0.029** | +0.060 |
| yeardiff | +0.022 | −0.018 |

AUC del ranker: **0.873** (0.862 senza le feature del grafo).

## Le cinque letture

1. **Si batte la popolarità, e non di poco**: +43% @50 su 150 account mai visti. È la prima volta in
   tutto il filone che qualcosa batte il controllo banale che ci batteva.
2. **La posizione collaborativa è la seconda feature per peso (+0.65)**: l'idea del "matcher" non era
   sbagliata, era **incompleta**. Da sola perde (9,0% contro 12,5%), dentro un ranker è **l'aggiunta
   più preziosa alla popolarità**. Un segnale debole da solo può essere decisivo in combinazione —
   lezione che vale oltre questo caso.
3. **Lo scorer di produzione è zavorra**: peso **+0.03**. Da solo è meglio del caso (AUC 0.718), ma
   *condizionato* a popolarità e posizione collaborativa **non aggiunge niente**. Questo è il difetto
   dell'ordinamento attuale: non è che il segnale per keyword sia sbagliato, è che è **dominato**.
4. **La nicchia è dove si guadagna di più**: sul fondo il ranker fa 2,8× la popolarità (16,7% contro
   6,0%) e la sola posizione collaborativa la raddoppia (11,2% contro 6,0%). Sul mainstream il guadagno
   è più modesto (18,8% contro 17,5%). **Il collaborativo serve esattamente dove le keyword non
   arrivano.**
5. **`yeardiff` è informativa da sola (AUC 0.330) e inutile nel modello** (peso 0.02): popolarità e
   posizione la contengono già. Non tutte le feature utili vanno messe dentro.

## Limiti (dichiarati)

- **profili sintetici, solo film**: MovieLens non ha serie. Le serie restano non misurate.
- **è una prova di concetto, non un modello di produzione**: le feature vincenti (posizione collaborativa,
  vicinato del grafo) esistono solo nel prototipo, non in `src/`; e servirebbe training data vero.
- l'AUC 0.873 è alta perché il compito è facile (1,1% di positivi, molta popolarità): il numero da
  guardare è il recall@50.
- **`prod` misura lo scorer con profilo senza L1** (stato di produzione): il confronto è onesto per
  l'ordinamento attuale, non per il grafo completo.

## Due bug trovati in questo giro (undicesimo e dodicesimo della giornata)

1. **Campo `keywords` mancante nel mio caricatore**: `ocean.keywordsOf` restituiva vuoto → il profilo
   usciva **senza keyword** → il pool perdeva in silenzio il filtro per keyword (10k candidati invece di
   3k) e la feature `prod` sarebbe stata inutile. **L'ho scoperto perché il pool era 3× quello del banco**,
   non perché me l'aspettassi. Il controllo che ha funzionato è stato il confronto fra due strumenti.
2. La riga del "soffitto" nel primo run confrontava le righe con sé stesse (100% per costruzione).
