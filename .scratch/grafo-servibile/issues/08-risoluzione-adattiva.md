# 08 — La risoluzione adattiva: chimere, briciole, film-portale

**Status**: `resolved` · **Type**: `task` · **Blocked by**: 06 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/08-rifinitura.md) · ⚠️ **tutti gli indicatori migliorano e la lettura dice che le bolle sono peggiori.** I numeri: bolle utilizzabili **+12,6%** (1.293 → 1.456), micro-bolle dimezzate (215 → 121), 145 chimere su 215 divise, 487 pattumiere dissolte, i film-portale ci sono (*Ant-Man*, *La sirenetta*, *Halloween*). La lettura delle 14 bolle toccate: **4 divisioni su 4 spezzano un mondo coerente** (true crime in due true crime, telenovelas in due telenovelas, corti Disney in due corti Disney) e **6 dissoluzioni su 6 distruggono mondi nominabili** (seinen anime, slice-of-life giapponese, romance asiatico, iyashikei). **Verdetto: tenere C (briciole) e D (portale), buttare A (chimere) e B (pattumiere).** È la **quarta volta** che un indicatore strutturale premia ciò che l'occhio condanna — e questa volta il meccanismo è visibile: il +12,6% viene dall'aver rotto bolle buone.

## What to build

La risoluzione è un **unico parametro su tutto il grafo**, ma i mondi cinematografici hanno taglie
naturali diverse: la filmografia di un autore è di 15 titoli, un sottogenere di 80. Un passo di
rifinitura **dopo** la partizione, in tre mosse.

1. **Split delle chimere.** Per ogni bolla grande o con conducibilità interna bassa, un taglio spettrale a
   due vie sul **sottografo indotto**. Se la densità di archi *fra* le due metà è meno di **un quarto**
   della densità interna di ciascuna, la bolla si divide: stava insieme solo per uno o due film-ponte.
2. **Assorbimento delle briciole.** Le bolle da 1-3 titoli che non sono un franchise chiuso si
   riassegnano al vicino verso cui hanno il peso normalizzato massimo.
3. **Multi-appartenenza per i film-portale.** Un titolo con purezza alta nella propria bolla **e** un
   legame secondario netto con un'altra (almeno tre nodi accoglienti) resta primario in una ed è **ospite**
   nell'altra. *Alien* è sia fantascienza sia horror; *Ran* è sia Kurosawa sia Shakespeare. Costringerli a
   scegliere appiattisce il gusto.

## Acceptance criteria

- [ ] il conteggio delle bolle **sciolte o minestrone** in una rilettura di 100 scende (obiettivo: da ~12 a sotto 5)
- [ ] la caccia alle chimere (05) rifatta dopo: le bolle segnalate sono sparite o ridotte
- [ ] i film-portale compaiono come **ospiti** in ≥2 bolle, e almeno un caso è riconoscibile a mano (*Alien*, *Blade Runner*, *Ran*)
- [ ] distribuzione delle taglie **prima e dopo** stampata: nessuna esplosione in centinaia di micro-bolle
- [ ] il giudice automatico (06) migliora
- [ ] un titolo ospite **non** è contato due volte nel conteggio dei membri di una bolla (la purezza si calcola sul primario)

## Cautela dichiarata

Lo split è un'operazione a rischio: dividere troppo produce bolle di 4 titoli che non sono più mondi.
La soglia del quarto è il freno, e la distribuzione delle taglie è il controllo che sta funzionando.
