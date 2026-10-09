# 27 — Il test dei vicini: film e serie con lo stesso strumento (e lo studente batte il teacher)

**Data**: 08/10/2026 · verita' esterna: "related" di Trakt (79 film, 136 serie) · controllo casuale

## Perche' non il co-watch split-half

Il primo test sui film usava il co-watch dell'altra meta' degli utenti come verita'. Risultato: studente
0,8% @50, **soffitto 1,7%** — nemmeno le *coordinate vere*, addestrate sull'altra meta', ritrovano i
co-watch di quella meta'. La verita' split-half e' troppo rumorosa per discriminare: **lo strumento era
debole, non il modello**. Sostituito con Trakt, la stessa verita' usata per le serie.

## Il risultato

| k | STUDENTE (film) | SOFFITTO (coordinate vere ML) | controllo | SERIE (stesso strumento) |
|---|---|---|---|---|
| 10 | **14,7%** | 8,2% | 0,0% | **15,0%** |
| 20 | **22,4%** | 11,4% | 0,0% | **22,0%** |
| 50 | **33,4%** | 15,6% | 0,2% | **34,2%** |

**I due lati coincidono**: film 33,4%, serie 34,2%, controllo ~0,1%. Lo stesso classificatore produce
vicini di qualita' equivalente su entrambi i medium — ed e' la prima volta che film e serie si misurano
con lo stesso metro.

## La sorpresa: lo studente batte le coordinate vere

33,4% contro 15,6% = **2,1x**. Lo spazio dei METADATI ritrova i related di Trakt **meglio** dello spazio
co-watch di MovieLens.

Perche': i related di Trakt sono in gran parte **contenuto** (Fantastic Beasts -> Harry Potter =
franchise; American Psycho -> Joker = tema; Non e' un paese per vecchi -> Sicario, Wind River = genere),
mentre l'SVD di MovieLens e' dominato dal **consumo mainstream** (i primi componenti sono popolarita').
Sono due fonti comportamentali diverse, e i metadati somigliano piu' a Trakt di quanto ci somigli il
co-watch mainstream.

**Cautela onesta**: non e' "i metadati battono il comportamento". E' "questo SVD, ottimizzato per la
varianza (ricostruzione), e' un cattivo spazio di vicinato per questa verita'". Un spazio co-watch
ottimizzato per i vicini (PPMI, o l'adiacenza appresa) potrebbe fare meglio — e' un test che non ho fatto.

## Cosa significa per la matrice sparsa

Il classificatore e' **pronto**: mette vicino cio' che Trakt considera correlato, su film e serie, con lo
stesso numero e un controllo a 0,1%. La matrice sparsa (top-k per titolo, con i pesi) si puo' costruire
dai suoi vettori — e' una moltiplicazione a blocchi, minuti su CPU a 87k titoli.

## I tre bug del giro (tutti miei, tutti istruttivi)

1. **Matching di stringhe nelle patch**: tre tentativi falliti perche' cercavo `print(` dove il file aveva
   `log(`. Passato a un metodo per righe (indice della riga), che non dipende dai caratteri.
2. **Cache del teacher senza `mids`** -> ricostruiti dai dati con un `assert` di coerenza (84.310 ✓).
3. **Namespace tmdbId/movieId, DI NUOVO**: due tentativi di allineamento sbagliati, con 8.073 e 1.715
   film "allineati" **per collisione** fra i due namespace. E' lo stesso errore del primo giorno di
   questo filone. **Il controllo che l'ha beccato e' stato il conteggio**: l'atteso era 49.070 su 49.070,
   e 8.073 non lo era. Senza un numero atteso da confrontare, sarebbe passato in silenzio.
