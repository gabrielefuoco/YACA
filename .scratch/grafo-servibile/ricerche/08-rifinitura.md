# 08 — La risoluzione adattiva, riorientata dal ticket 05

**Status**: `resolved` · **Ticket**: [08](../issues/08-risoluzione-adattiva.md) · **Script**: `08-rifinitura.py` · **Log**: `log/08-rifinitura.log` · **119 s**
**Partizione di partenza**: `bolle2-E` — **la stessa letta nel report 74**, così il confronto prima/dopo è sulle stesse bolle.

## Cosa è stato costruito — quattro passi, non tre

Il ticket ne prevedeva tre. Il ticket 05 ne ha reso necessario un quarto, perché ha misurato che **lo split delle chimere non copre la popolazione malata** (le bolle che l'occhio giudica cattive hanno 15-35 titoli e purezza *normale*, mentre la caccia ne guarda >35).

| | passo | criterio |
|---|---|---|
| **A** | split delle chimere | >35 titoli, taglio spettrale a 2 vie, si divide se la densità fra le metà è sotto ¼ dell'interna |
| **B** | **dissoluzione delle pattumiere** ← nuovo | ≤35 titoli e purezza media nel decile più basso: ogni membro va alla bolla vicina con cui ha più peso |
| **C** | assorbimento delle briciole | 1-3 titoli, non franchise chiusi |
| **D** | multi-appartenenza dei film-portale | purezza primaria alta + legame secondario con ≥3 nodi accoglienti |

## ✅ I numeri migliorano, e di molto

| | bolle | **≥15 titoli** | 1-3 titoli | mediana |
|---|---|---|---|---|
| **PRIMA** (`bolle2-E`) | 5.297 | 1.293 | 215 | 9 |
| **DOPO** (rifinita) | 5.442 | **1.456** | **121** | 9 |

- **Bolle utilizzabili: +12,6%** (1.293 → 1.456)
- **Micro-bolle dimezzate** (215 → 121) — il criterio «nessuna esplosione in micro-bolle» è rispettato: la mediana resta 9 ✓
- **145 delle 215 bolle grandi sono state divise** — un intervento enorme
- **487 pattumiere dissolte, 3.930 titoli spostati**
- **235 briciole assorbite, 638 titoli spostati**
- **12,4% dei titoli ha cambiato bolla**
- **I film-portale ci sono** ✓: *La sirenetta* (primario in [63], ospite in [5336]), *Ant-Man* e *Ant-Man and the Wasp* (primari in [140], ospiti in [5391]), *Il libro della giungla* (primario in [5336], ospite in [63]), *Halloween* (primario in [170], ospite in [5412])

Sul metro del ticket, **tutti i criteri strutturali sono soddisfatti.**

---

## ❌ E la lettura dice che è un disastro

Ho letto le bolle toccate. **Otto divisioni, sei dissoluzioni.**

### Le divisioni spezzano mondi coerenti

| bolla | la metà rimasta | la metà staccata |
|---|---|---|
| **[2]** 142 → 84+58 | Ted Bundy · MINDHUNTER · Tiger King · Making a Murderer · Manhunt · Unsolved Mysteries · Wild Wild Country | McMillion$ · La scomparsa di Maddie McCann · I Love You Now Die · I crimini di Jimmy Savile · I AM A KILLER |
| **[3]** 107 → 47+60 | Marimar · Amores verdaderos · La Doña · Luis Miguel · Soy tu dueña · María la del Barrio | Teresa · Lo Que La Vida Me Robó · Mi corazón es tuyo · Amor Real · Rubí · La fea más bella |
| **[7]** 117 → 50+67 | L'arte di sciare · Pippo e la pesca · Il campione olimpico · Il gioco del football | La leggenda della Valle Adalbert · L'albero di Natale di Pluto · Cip & Ciop · La guerra dei popcorn |
| **[8]** 113 → 56+57 | I tre porcellini · Tutti in scena! · Il vecchio mulino · La lepre e la tartaruga | Ferdinando il toro · Fiori e alberi · La roulotte di Topolino · Topolino e i fantasmi |

**Tutte e quattro sono mondi coerenti divisi in due dallo stesso mondo.** True crime spezzato in due true crime. Telenovelas in due telenovelas. Corti Disney in due corti Disney. **Non un errore su quattro: quattro su quattro.**

E le densità giustificavano il taglio: la densità fra le metà è 0,002, quella interna 0,01-0,017 — **un quinto, un ottavo**. Il criterio numerico era rispettato e la conclusione semantica è sbagliata.

### Le dissoluzioni distruggono mondi veri

| bolla | purezza | che cos'è (letto) |
|---|---|---|
| **[291]** 31 titoli | 0,096 | Banana Fish · Terror in Resonance · Inuyashiki · Moriarty the Patriot · Kaiji · Tomodachi Game → **anime thriller/seinen** |
| **[387]** 27 titoli | 0,101 | Watamote · Bakuman · Hitoribocchi · Kakushigoto · Kotaro abita da solo → **slice-of-life comico giapponese** |
| **[412]** 26 titoli | 0,102 | Boys over Flowers · Girl from Nowhere · Playful Kiss · Move to Heaven → **romance asiatico live-action** |
| **[422]** 26 titoli | 0,095 | Blend S · Wotakoi · Recovery of an MMO Junkie · NEW GAME! → **romance da ufficio / otaku** |
| **[473]** 25 titoli | 0,077 | (titoli giapponesi) → **dorama giapponesi** |
| **[499]** 24 titoli | 0,093 | The Helpful Fox Senko-san · Barakamon · Flying Witch · Is the order a rabbit? · Aria → **iyashikei, il genere «curativo»** |

**Sei su sei sono mondi nominabili, e la dissoluzione li ha sparsi.**

Il motivo è chiaro: la purezza misura **quanta parte del peso di un titolo resta nella sua bolla**. Un anime ha legami con altri anime per studio, attori, autore — quindi la sua «purezza» è bassa **anche quando il mondo è strettissimo**. La soglia del decile (0,102) è un criterio statistico che non ha niente a che vedere con la coerenza.

---

## Il risultato che conta

> **Tutti gli indicatori strutturali migliorano (+12,6% di bolle utilizzabili, micro-bolle dimezzate, 145 chimere risolte) e la lettura dice che le bolle sono PEGGIORI.**

È la **quarta volta** in questa sessione che un indicatore strutturale premia qualcosa che l'occhio condanna:

1. la **modularità** — tre misure concordi, mai correlata con la qualità (report 71-73);
2. **λ₂ e la purezza** — non riconoscono le bolle che la lettura aveva giudicato cattive (ticket 05);
3. il **conteggio delle bolle** — +19,9% nel ticket 07 con il giudice che diceva il contrario;
4. ora il **conteggio, di nuovo** — +12,6% ottenuto distruggendo mondi.

E questa volta il meccanismo è **visibile**: il +12,6% viene **dall'aver rotto bolle buone**. Non è un'ipotesi sul perché i due indicatori divergono: è la spiegazione, letta titolo per titolo.

**Conseguenza diretta per il ticket 07**: il suo +19,9% di bolle utilizzabili, che la lettura non aveva verificato, va ora guardato con **sospetto attivo**. Un aumento di quella taglia si ottiene anche rompendo i mondi — e finché nessuno legge le bolle di F, non si sa da quale delle due cause viene.

## Cosa tenere e cosa buttare

| passo | verdetto |
|---|---|
| **A — split delle chimere** | ❌ **da non applicare**. 4 su 4 divisioni lette spezzano un mondo coerente. Il criterio della densità non distingue «due mondi fusi» da «un mondo grande» |
| **B — dissoluzione delle pattumiere** | ❌ **da non applicare**. 6 su 6 distruggono mondi nominabili. La purezza non misura la coerenza |
| **C — assorbimento delle briciole** | ✅ innocuo e utile: una bolla di 1-3 titoli non è un mondo da navigare, e riassegnarla al vicino non toglie niente |
| **D — film-portale** | ✅ **da tenere**: i portali ci sono e sono sensati (*Ant-Man* è sia Marvel sia… quello che è; *La sirenetta* sia Disney classico sia il live-action) |

**Raccomandazione**: tenere C e D, **buttare A e B**. E per qualunque rifinitura futura: **si valida leggendo, non contando.**

## I criteri del ticket

- [ ] ❌ **il conteggio delle bolle sciolte scende da ~12 a sotto 5**: non misurato su 100 bolle, ma le 10 bolle lette sono **peggiorate** (4 divisioni di mondi coerenti, 6 dissoluzioni di mondi veri)
- [x] la caccia alle chimere rifatta: le bolle segnalate **spariscono** ✓ — 145 su 215 divise. È il criterio rispettato e **il risultato sbagliato**: spariscono perché sono state tagliate, non perché fossero rotte
- [x] **i film-portale compaiono come ospiti in ≥2 bolle** ✓ e sono riconoscibili a mano (*Ant-Man*, *La sirenetta*, *Halloween*)
- [x] la distribuzione delle taglie prima/dopo è stampata: **nessuna esplosione** (5.297 → 5.442, mediana 9, micro-bolle 215 → 121)
- [ ] ⚠️ **il giudice automatico (06) migliora**: non eseguito, di proposito — il ticket 06 ha stabilito che con 200 bolle non risolve differenze sotto i 5 punti
- [x] un titolo ospite non è contato due volte: la purezza si calcola sulla bolla **primaria** ✓

## Limiti dichiarati

1. **Ho letto 14 bolle toccate, non 100.** È un campione piccolo e non casuale (è quello che i passi A e B hanno toccato): non esclude che altrove la rifinitura abbia fatto bene. Ma **14 su 14 contro** è una direzione netta.
2. **La soglia della dissoluzione (il decile della purezza) è arbitrale.** Con un decile più stretto, meno bolle distrutte — ma il meccanismo è sbagliato in principio, non nella soglia: *nessuna* soglia di purezza separa un anime stretto da una bolla larga.
3. **Il taglio spettrale usa il segno del vettore di Fiedler**: una scelta standard, ma il taglio ottimo per conducibilità è un altro (e su 145 divisioni la differenza non è stata misurata).
4. **La partizione di partenza è `bolle2-E`**, non una delle nuove del ticket 07: i passi vanno riprovati se la base cambia — ma visti i verdetti, non c'è ragione di riprovarli.
5. **I portali non sono stati validati sul recupero**: «è sia Marvel sia altro» è un giudizio di lettura, non una misura.
