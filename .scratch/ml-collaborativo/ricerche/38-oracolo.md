# 38 — L'oracolo: siamo all'88% del soffitto della combinazione. Servono segnali NUOVI.

**Data**: 08/10/2026 · verifica sulle sorgenti pari · componenti: contenuto, comportamento, anno, saga, temi

## La misura che mancava

Per ogni sorgente: quanti dei suoi collegamenti "peso 3" stanno nell'**UNIONE** delle top-K delle
cinque componenti? Se non ci stanno, **nessuna fusione, nessun peso, nessun modello puo' trovarli**:
il segnale non c'e'.

| unione delle 5 componenti | verifica (pari) | calibrazione (dispari) |
|---|---|---|
| nei primi **10** | **45,9%** (28/61) | 44,0% (22/50) |
| nei primi 20 | 52,5% (32/61) | 52,0% (26/50) |
| nei primi 50 | 62,3% (38/61) | 66,0% (33/50) |

**Noi stiamo al 40,3%: l'88% del soffitto a K=10.**

Conseguenza secca: **il margine rimasto nella combinazione e' +5,6 punti.** Tutto il lavoro su pesi,
gate, modelli e fusioni non puo' andare oltre il 45,9% **a parita' di segnali**. Il gate (test 37) non
era una sconfitta: era un vicolo cieco *strutturale*.

## Il contributo UNICO di ogni componente (link che SOLO lei prende, nei primi 20)

| componente | unici |
|---|---|
| **contenuto** | **14,8%** (9/61) |
| comportamento | 3,3% (2/61) |
| temi | 1,6% (1/61) |
| anno | 0,0% |
| saga | 0,0% |

Il contenuto e' il **cavallo di battaglia**: porta da solo quasi tutto il segnale unico. Il comportamento
aggiunge poco, i temi pochissimo, anno e saga **niente che non sia gia' coperto**.

## Le migliori coppie (K=20, verifica)

| coppia | copre |
|---|---|
| contenuto + comportamento | 50,8% |
| contenuto + temi | 49,2% |
| contenuto + saga | 45,9% |
| contenuto + anno | 45,9% |
| comportamento + temi | 37,7% |

Il contenuto e' in **tutte** le coppie migliori: e' la base, gli altri sono aggiunte.

## Cosa serve per aumentare il 40%

**Non un'altra combinazione. Un segnale nuovo.** E i candidati sono pochi e precisi:

1. **I VALORI dei voti (in test, in background).** Ho trattato tutti i voti come "visto": un voto di
   5 stelle e uno di 2 stelle sono la stessa cosa nel mio pipeline. **"Co-amato" e' un segnale molto
   piu' affilato di "co-visto"** — e il valore del voto non entra da nessuna parte. Test in corso.
2. **La vicinanza temporale (deprioritizzata, onesta).** I timestamp non erano mai stati usati, ma la
   misura dice che in MovieLens l'84% dei voti consecutivi sta entro 2 giorni: **sono sessioni di VOTO,
   non di visione** — gli utenti votano a raffica. Proxy debole: non ci costruisco sopra.
3. **Le serie.** Il "medium" e' al 12,5% e per le serie il comportamento e' **zero** per costruzione:
   li' non c'e' segnale, e l'unico disponibile e' il teacher Trakt (rimandato).
4. **I film classici.** L'era e' al 30%: i film del 1920-1950 hanno pochissimi voti, e il teacher non
   li copre. E' un problema di DATI, non di modello.

## La risposta alla domanda "come lo aumentiamo"

| strada | guadagno atteso |
|---|---|
| ottimizzare la combinazione (pesi, gate, modelli) | **+5,6 punti al massimo** (soffitto 45,9%) |
| **il valore dei voti** (co-amato) | da misurare — primo test in corso |
| le serie (teacher Trakt) | il medium e' al 12,5%: margine ampio, ma serve la fonte esterna |
| i classici | serve copertura dati (voti), non modello |
| lo strumento (piu' sorgenti di nicchia) | non alza il numero: rende MISURABILE cio' che oggi non lo e' |

**Il 40% non e' un fallimento del metodo: e' il limite dell'informazione che diamo al metodo.**
Per salire serve informazione nuova — e le due fonti in casa sono il valore dei voti (in test) e i
metadati dei film classici; l'unica fonte esterna disponibile resta Trakt.
