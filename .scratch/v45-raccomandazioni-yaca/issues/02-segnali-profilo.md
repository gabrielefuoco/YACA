Status: resolved
Type: grilling

# Semantica e peso dei segnali del profilo

## Question

Quali segnali entrano nel profilo di lungo periodo e con che priorità relativa? Sono già richiesti `loved`, `liked` e `library/watchlist`; resta da decidere quanto contano i titoli `watched`, le revisioni e gli altri segnali, senza confondere il consumo con il gusto esplicito. La decisione deve specificare cosa è un seed positivo e cosa resta escluso.

## Resolution — si ereditano, non si ridecidono

I pesi sono già nel sistema precedente, dichiarati **e** misurati in `services/graph/parametri.py`. Non si riapre la decisione: si trasferisce.

| parametro | valore | perché |
|---|---|---|
| `PESO_TIPO` | loved 3 · liked 2 · library 1 · watched 1 | `measure/pesi.py`; ticket 02 del vecchio modulo fissa library a 1 (una watchlist non è un gusto) |
| `PESO_FILM_MAX` | 3 | `measure/equilibrio.py` (253 utenti): senza cap, a chi guarda solo film le serie prendevano il 67% del peso del seme, fino all'85% |
| `PESO_SERIE_BASE` + `PESO_SERIE_FASCIA` | 1 + 2 × frazione episodi → [1, 3] | le puntate contano come *quanto* hai visto, non come play |
| `NIENTE_RECENZA`, `NIENTE_BOOST`, `NIENTE_RANGO` | recenza non è un peso | misurato tre volte: come peso è inerte (18,12× vs 18,17×); come **selezione** gli ultimi 15 fanno 47,5× |

**Conseguenza misurata sul runtime nuovo**: `graph.runtime.Engine` applicava solo `PESO_TIPO`, ignorando tetto dei film e formula delle serie. Non era una decisione aperta ma un difetto di implementazione; il rimedio è chiamare `camminata.pesi_semi`, che è la sola implementazione della formula.

Il seed positivo resta: titoli della storia con `loved`/`liked`/`library`, più `watched` con peso base. Le liste curate non sono un segnale del profilo (vedi [Cold start](04-cold-start-liste.md)).
