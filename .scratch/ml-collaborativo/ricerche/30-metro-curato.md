# 30 — Il metro curato: la fusione e' validata, il resto chiede DATI

**Data**: 08/10/2026 · 18 sorgenti agganciate (su 19), 87 collegamenti, 18 falsi amici
Calibrazione sui 9 dispari, verifica sui 9 pari (mai usati per calibrare).

## Il risultato

| spazio | p3@10 | p2@20 | falsi in top10 | punteggio |
|---|---|---|---|---|
| contenuto appreso (Pc) | 50,0% | 18,6% | 11% | 57,5 |
| comportamento appreso (Pb) | 36,8% | 7,0% | 0% | 43,8 |
| **fusione 0,7 contenuto + 0,3 comportamento** | **57,9%** | **25,6%** | **6%** | **77,9** |
| *verifica sui pari (mai usati)* | **61,9%** | **27,8%** | 11% | **78,6** |

**+24% su p3@10 e +37% sul punteggio, validati su sorgenti mai usate.** La fusione non e' un
artefatto della calibrazione: tiene (e migliora) sulla meta' tenuta fuori.

## Per tipo (verifica)

| tipo | quota | lettura |
|---|---|---|
| **franchise** | **100% (9/9)** | le saghe sono gia' perfette |
| mainstream | 43,8% (7/16) | il consiglio ovvio c'e' a meta' |
| niche | 18,2% (2/11) | il consiglio da intenditore e' il piu' debole |
| era | 0% (0/4) | **dati mancanti**, non modello |
| medium | 0% (0/2) | **dati mancanti**, non modello |

## Cosa ho provato e NON funziona (tutto misurato, niente lasciato a intuito)

- **TF-IDF grezzo come terza componente**: peggiora (44,7% contro 57,9%). Il Ridge con alpha=30
  *shrink-a* i segnali specifici (stesso attore, stessa keyword), ma la similarita' grezza delle
  feature e' peggiore del segnale appreso.
- **TF-IDF condizionato ai soli titoli freddi** (<200 voti): neutro o negativo.
- **Prossimita' d'anno** (per i legami "era"): peggiora (35,3%).
- **Boost saga** (stessa collezione): neutro a 0,7/0,3, perche' i franchise sono gia' al 100%.
- **Centratura per medium**: neutra sul totale (ma necessaria: senza, le serie danno 0/0).

## Perche' "era" e "medium" falliscono (diagnosi, non ipotesi)

**era** — Il gabinetto del dottor Caligari ha **57 voti**. Il teacher (MovieLens) non ha dati per il
cinema del 1920 -> il bersaglio e' rumore -> le coordinate apprese sono rumore: Pc +0,093 con
Nosferatu, **-0,165** con Metropolis. E le feature grezze coprono male il muto (TF-IDF +0,025/+0,055).
**Non e' il modello: sono i dati.**

**medium** — Le serie hanno **zero comportamento** (Pb=0) e le loro coordinate di contenuto sono
un'estrapolazione dai film. Breaking Bad -> El Camino ha Pc **+0,536** (alto!) ma finisce **@819**:
il resto della lista lo batte. La calibrazione fra i due medium non regge, e per le serie manca
qualsiasi segnale comportamentale.

**Il limite del metro** — Per una sorgente con 7 collegamenti, i primi 10 posti si riempiono anche di
risposte *sensate che non ho scritto io*: LOTR -> Willow @45 e Conan @64 sono legami veri, fuori dai
primi 20 perche' altre posizioni sono occupate da film altrettanto plausibili. **Il metro misura
l'accordo col mio gusto, non la verita'.**

## Conclusione

1. **La fusione e' la direzione**, ed e' validata: contenuto 0,7 + comportamento 0,3.
2. **Due buchi sono di DATI, non di modello**: i metadati del cinema muto/classico (i film con <200
   voti hanno il bersaglio rumoroso) e un segnale comportamentale per le serie (il teacher Trakt).
3. **I falsi amici restano l'11%** sulla verifica (1 su 9): il comportamento li abbatte (0% da solo,
   6% sul set intero) ma non li elimina.
4. Il metro curato **e' utilizzabile** e ha gia' fatto il suo lavoro: ha bocciato quattro idee che
   sembravano buone (TF-IDF, anno, saga, condizionato) e ha validato la fusione.
