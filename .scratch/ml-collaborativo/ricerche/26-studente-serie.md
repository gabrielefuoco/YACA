# 26 — Lo studente sulle serie: 23 volte meglio (e la propagazione era il problema)

**Data**: 08/10/2026 · 136 serie del campione Trakt (fuori da qualunque addestramento) · 16.550 serie · 49.709 film col teacher

## Cosa ho cambiato (tre cose, tutte indicate da te)

1. **Generi TV -> generi film** (mappatura dichiarata: 10759 -> Action+Adventure, 10765 -> Sci-Fi+Fantasy,
   10768 -> War+History, 10766 -> Drama, 10762 -> Family+Animation, 10763/10764/10767 -> Documentary;
   10 generi hanno lo stesso id e passano invariati). Prima le serie avevano id di genere che **nessun
   film ha in addestramento** -> coefficiente zero -> **il segnale dei generi per le serie era ASSENTE**.
2. **Campi che identificano il medium rimossi**: budget, incassi, numero di stagioni.
3. **Lo studente invece della propagazione**: le coordinate di una serie vengono dai suoi **metadati**,
   non dai vicini. E' il "vettore -> vettore": non passa dai film.

## Il risultato

| k | STUDENTE, fra le serie | STUDENTE, fra tutti i titoli | controllo | propagazione (positions.json) |
|---|---|---|---|---|
| 10 | **15,0%** | 14,9% | 0,1% | 0,8% |
| 20 | **22,0%** | 21,9% | 0,1% | 0,8% |
| 50 | **34,2%** | 34,1% | 0,1% | 1,5% |

**Da 1,5% a 34,2% @50: 23 volte.** Controllo 0,1%, raggiungibilita' 88% -> catturiamo il **39% di cio'
che e' raggiungibile** (34,2/88).

## La sanita' a occhio (i vicini veri)

- **Grey's Anatomy** -> Suits · The Pitt · Chicago Fire · Chicago P.D. · New Amsterdam · Dr. House
  (tutte serie, tutte medical/drama procedurale) OK
- **One Piece Film: Red** -> gli altri film di One Piece OK
- **El Camino (Breaking Bad)** -> crime/thriller OK

Lato film, coerente con i numeri precedenti: BASE 0,422 · ESTESE **0,486** held-out (alpha=30).

## Le tre cose che ne seguono

1. **Il teacher Trakt non serve** per far funzionare lo studente: il classificatore addestrato sui film
   **generalizza alle serie** (34% @50). Il fetch dei 5.000 si puo' risparmiare — o usarlo dopo, come
   rinforzo, non come prerequisito.
2. **Film e serie vogliono trattamenti diversi**: i film vanno meglio con la propagazione (i loro vicini
   portano comportamento), le serie con lo studente da solo (i loro vicini portano *film*). Da qui in
   avanti: **propagare solo lungo archi comportamentali**, e mai imporre ai film le coordinate delle serie
   o viceversa.
3. **Il classificatore e' pronto per la matrice**: le coordinate mettono vicino cio' che si guarda
   insieme, su entrambi i lati, con un controllo a 0,1%.

## Perche' era sbagliato prima (lezione)

La propagazione era stata adottata perche' **migliorava i film** (+4,7%, cold-start +10%) e applicata
**a tutto** senza mai testarla sulle serie. Un metodo che funziona dove c'e' il teacher non e'
automaticamente valido dove il teacher non c'e': li' stava **proiettando i film sulle serie**. Il test
e' arrivato solo quando c'e' stata una verita' esterna (Trakt) con cui misurarlo.

## Il prossimo passo

Il test dei vicini **sui film** con lo stesso strumento (co-watch tenuti fuori, soffitto e controllo):
e' l'ultimo numero che manca prima di costruire la matrice sparsa dei collegamenti.
