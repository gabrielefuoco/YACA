# 71 — Le bolle, lette una per una: il verdetto

**Il mandato**: giudicare le bolle. Il giudizio è mio, e l'ho fatto leggendo i titoli — non una metrica, una lettura. Quattro grafi a confronto, **24 bolle lette per variante** (delle ~1.000 di ciascuna, campione casuale).

**L'esito**: **il grafo del comportamento da solo produce le bolle migliori** — circa metà sono buone, e quelle buone sono *ottime*: profonde, specifiche, riconoscibili. **Aggiungere il contenuto o la curatela le peggiora.** La tua intuizione «tutto fa brodo» **non è confermata**: per le bolle, come per il recupero, meno è meglio.

Script: `bolle.py` · `leggi-bolle.py`. Partizioni salvate in `.cache/movielens/bolle-A/B/C/D.npy`.

---

## 1. Il criterio che ho usato

**Una bolla è buona se ha un filo comune che si può NOMINARE.** Non "sono tutti drama" — quello lo dicono i generi e non serve a nessuno. Un filo che un umano riconosce:

- un **genere con un'epoca** → «fantascienza d'azione anni 2000»
- un **franchise** → «tutto il Tarzan»
- un **formato** → «reality di sopravvivenza»
- una **nicchia** → «horror di Natale», «BL anime»

Se non riesco a nominarlo, è un minestrone — e il test è che un utente non saprebbe dire cosa sta guardando.

## 2. Le bolle del COMPORTAMENTO — le migliori

**Circa la metà sono buone, e alcune sono eccellenti.** Le migliori che ho letto:

| la bolla | i titoli |
|---|---|
| **horror di Natale** | Better Watch Out · Black Christmas · Silent Night · Anna and the Apocalypse · A Christmas Horror Story · Santa's Slay · Natale di sangue |
| **musical camp** | Rocky Horror · Pink Floyd The Wall · La piccola bottega degli orrori · Cry Baby · Priscilla · Hedwig · Hair · The Producers · Grasso è bello |
| **fantascienza d'azione anni 2000** | Terminator Salvation · Jumper · The Island · Segnali dal futuro · Cowboys & Aliens · Déjà Vu · Pitch Black · Predators · Ultimatum alla Terra |
| **animazione adulta** | Sausage Party · tutto South Park · I Simpson · Bob's Burgers · Robot Chicken · Beavis & Butt-Head · Drawn Together |
| **reality di sopravvivenza** | Survivor · Bear Grylls (tutte) · Man vs. Wild · Nudi e crudi · Alone · Dual Survival · Outlast |
| **action con la star** | Bad Boys for Life · Hobbs & Shaw · The Accountant · Tyler Rake · The Equalizer 2 · Gemini Man · Bloodshot · 6 Underground · Rambo: Last Blood |
| **tutto il Tarzan** | Tarzan e le Amazzoni · Tarzan e le sirene · Tarzan e i cacciatori bianchi · Tarzan il magnifico · … |
| **serie scolastiche giapponesi** | BOYS OVER FLOWERS · Good Morning Call · Mischievous Kiss · HANA-KIMI · 山田くんと7人の魔女 |
| **documentari di storia** | Pompei · La valle dei re · Egypt · Mankind · Human · Engineering an Empire · Maya |
| **sitcom familiari USA** | Shameless · Mom · Una mamma per amica · Il metodo Kominsky · Friday Night Dinner · Bob Hearts Abishola |

**Queste sono bolle vere.** Non "genere": **gusto**. Un utente che guarda una di queste sa cosa sta guardando, e la bolla vicina è una scelta sensata.

**E i minestroni hanno una firma**: nessun filo nominabile. «Ben 10 · Sky Fighters · Forever Strong · Cash Truck · Killer Bean Forever · Paintball · Prigione di vetro 2» — cosa lega queste cose? Niente. Idem «Child Bride · F.B.I. Squadra Omicidi · Les Pépites · National Bird · Notturno di sangue».

## 3. Il CONTENUTO — molto peggio di quanto pensassi

Nel primo campione (4 bolle) avevo visto un horror e un crime perfetti e l'avevo giudicato bene. **Su 24 bolle il quadro cambia**: solo ~4-5 buone.

| buone | il resto |
|---|---|
| **animazione di Natale**: Frozen Olaf · La storia di Olaf · Trolls · Winnie the Pooh · Charlie Brown | **Fargo · La febbre dell'oro · Blood Simple · Cleo dalle 5 alle 7 · Il bacio della pantera · Lost River** — cosa hanno in comune? |
| **danza**: La La Land · Dirty Dancing · Billy Elliot · Flashdance · Suspiria | **Mr. Bean · Business Proposal · Maude · On the Buses · Detectorists** — niente |
| **BL anime**: Yarichin Bitch Club · The Titan's Bride · Tadaima Okaeri · Yakuza Lover | **Pitch Perfect 3 · Creep 2 · Il posto · Sweet Home · La lupa mannara** — niente |

**E qui c'è la lezione**: il grafo del contenuto ha **modularità più alta** (0,301 contro 0,205) e **bolle peggiori**. **La modularità non è qualità.** Il contenuto trova comunità *nette* e *inutili*, perché il metadato dice "Drama/Comedy" di quasi tutto e l'SVD del TF-IDF impasta.

## 4. La curatela: no

| | bolle buone su 24 |
|---|---|
| **A) comportamento** | **~12** |
| B) contenuto | ~4 |
| **D) tutto senza curatela** | ~3 |
| **C) tutto con curatela** | ~2 |

**Aggiungere tutto peggiora**, e la curatela peggiora ancora (C peggio di D). Coerente con l'ablation, che diceva che `Kc` non serve e la curatela fa male.

**E devo correggere il mio giudizio precedente**: con 4 bolle avevo detto «D è meglio di C» e l'avevo letta come una conferma della tua idea. Con 24, **D è peggio di A** — e la curatela resta dannosa anche qui. Il campione piccolo mi aveva ingannato, nella direzione che mi aspettavo. **È lo stesso errore che ho fatto per tutta la sessione, in piccolo.**

## 5. Cosa vuol dire per il tuo piano

**La struttura a bolle funziona, ed è la strada.** Ma:

1. **Lo spazio giusto è il comportamento**, non il contenuto. `CF` (film) + `CFst` + `B` (serie). Le bolle migliori nascono lì.
2. **"Tutto fa brodo" è falso**, per le bolle come per il recupero. Il metadato diluisce: dice "Drama" di tutto e cancella i confini netti del comportamento.
3. **La granularità**: a risoluzione 100 si ottengono ~1.900 bolle con mediana 28 titoli — ed è la granularità giusta per giudicare. A risoluzione 10 sono bolle da 200 titoli e sono minestroni.
4. **Il limite**: metà delle bolle è minestrone. **Nessuno le ha ancora migliorate** — il report 44-46 aveva provato a *spezzarle*, non a *costruirle meglio*.

## 6. Cosa farei adesso

1. **Costruire le bolle sul comportamento e basta** (A), a risoluzione 100. È la base.
2. **Attaccare il minestrone**: le bolle senza filo nominabile. Lì serve un segnale che oggi non c'è. **Il candidato è il dato che stiamo buttando: le 1.200 cronologie Trakt**, che coprono titoli che `CF` non tocca (le serie e la coda dei film). Non le ho mai usate per costruire il grafo.
3. **Poi la navigazione**: bolle vicine nel grafo, e dentro la bolla la scelta popolare/nicchia. Quella parte non è mai stata costruita.
4. **Il visore**: serve comunque, per leggere le bolle come ho fatto qui ma in modo ripetibile — **non per te, per me**, per poterle giudicare a ogni iterazione.

## 7. Il limite di questo report

**Ho letto 24 bolle per variante su ~1.000.** È un campione del 2,4%, preso a caso. Il verdetto è mio e motivato (il criterio è al §1), ma **non è esaustivo**: può sbagliare di qualche punto. Quello che è solido è la **direzione** (comportamento ≫ contenuto ≫ tutto) e le **bolle che ho citato**, che esistono davvero e sono come le ho descritte.
