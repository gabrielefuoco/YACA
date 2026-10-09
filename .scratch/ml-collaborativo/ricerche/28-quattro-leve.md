# 28 — Alzare l'asticella: quattro leve, tutte misurate (e nessuna vince)

**Data**: 08/10/2026 · stesso metro (Trakt, 79 film, 1.399 correlate, controllo, rango mediano) ·
stesso insieme di addestramento per tutte le configurazioni (27.203 film)

| config | @10 | @50 | rango mediano | saga in top-10 |
|---|---|---|---|---|
| A baseline (SVD64 + gerarchia) | 15,7% | 37,1% | 125 | 6% |
| **B1 + keyword specifiche** | 15,6% | **37,8%** | **117** | 6% |
| B2 + metrica appresa (pairwise) | 11,8% | 29,6% | 168 | 5% |
| B3 + pesi affidabilita' | 11,5% | 29,1% | 171 | 5% |
| C1 teacher PPMI k-NN (256) | 13,1% | 27,7% | 293 | 7% |
| C2 PPMI + metrica appresa | 13,8% | 30,1% | 218 | 7% |

## Cosa dice

1. **Una sola leva vince, e di poco**: le keyword specifiche (+0,7 punti su @50, rango mediano 125 -> 117).
   Le 20.000 colonne keyword non aggiungono molto perche' la gerarchia L1/L2/L3 gia' le riassumeva.
2. **La metrica appresa (obiettivo pairwise) PEGGIORA** (37,1% -> 29,6%): una logistica addestrata a
   distinguere le coppie co-viste di MovieLens non trasferisce alla verita' di Trakt.
3. **Il teacher PPMI k-NN (ottimizzato per i vicini) PEGGIORA** (27,7%): il teacher "migliore per i
   vicini" produce uno studente **peggiore** su questa verita'. Controintuitivo e importante.
4. **Errore metodologico mio**: le configurazioni sono **a catena** (B2 = keyword+metrica, B3 = +pesi),
   quindi i pesi di affidabilita' NON sono isolati. Non posso attribuirgli ne' bene ne' male. Le leve
   vanno misurate una per volta, non in accumulo.

## Perche' il teacher PPMI perde (la parte che vale)

L'SVD della matrice dei voti e' ottimizzato per la **varianza**, e i primi componenti di una matrice di
voti sono **genere, epoca, popolarita'** — cioe' struttura *grossolana di contenuto*. La verita' di Trakt
e' **contenuto** (franchise, tema, genere). Quindi il teacher "ingenuo" e' **allineato** con la verita',
mentre il PPMI sulla co-visione enfatizza il **consumo specifico** (nicchia mainstream), che e'
disallineato con essa.

**Conseguenza**: su questa verita', spingere verso il comportamento *peggiora*. Che non vuol dire che il
comportamento sia inutile — vuol dire che **questa verita' non lo misura**.

## Il problema di fondo: quale verita'

Abbiamo due verita' che **non concordano**:

| verita' | natura | chi vince |
|---|---|---|
| **Trakt related** | contenuto (franchise, tema, genere) | lo spazio di METADATI (37,8%) batte le coordinate vere di MovieLens (15,6%) |
| **co-visione MovieLens** | comportamento mainstream | il teacher e' costruito su questa |

Una rappresentazione "perfetta" per il prodotto deve fare bene su **entrambe**, e oggi misuriamo **solo la
prima**. La prossima mossa non e' un'altra leva: e' **misurare su due verita'** con la stessa disciplina —
Trakt (contenuto) e il co-watch split-half con una verita' piu' densa (comportamento).

## Il bug: quarto errore di namespace della giornata

`row_ppmi` era indicizzato per **posizione** invece che per movieId -> "addestrabili" 8.778 film **per
collisione** (invece di 27.203) e coppie pairwise quasi tutte vuote. **Il primo run era invalido in
blocco**, non "negativo": senza il fix avrei concluso che il PPMI e la metrica fanno schifo, e sarebbe
stata una conclusione su un bug.

**Quarto errore di namespace in un giorno** (tmdbId, movieId, posizione). Ogni volta non da' un crash: da'
un **crollo di prestazioni**, che e' molto piu' facile da scambiare per un risultato.
