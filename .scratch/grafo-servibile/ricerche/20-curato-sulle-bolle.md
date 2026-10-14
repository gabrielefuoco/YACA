# 20 — I legami curati proiettati sulle bolle

**Status**: `resolved` · **Ticket**: [20](../issues/20-curato-sulle-bolle.md) · **Script**: `20-curato-sulle-bolle.py` · **Log**: `log/20-curato-sulle-bolle.log` · **1 s**

## ⚠️ Prima cosa: i «3.417 legami» non sono 3.417

Il numero compare nel documento di handoff, nella specifica, nei ticket 18, 19 e 20. **Misurato: i legami di training sono 1.004, quelli di test 1.002, in totale 2.006.**

```
legami di training (sorgenti a indice pari): 1.004
legami di test    (sorgenti a indice dispari): 1.002
```

La differenza non cambia nessuna conclusione — anzi, **rende il risultato del ticket 19 più forte**: 1.004 vincoli su 9 incognite sono 111 vincoli per incognita, e il guadagno di +8,38 al @500 resta. Ma il «3.417» **non è riproducibile** e va corretto ovunque compaia, perché è il numero che giustifica l'affermazione «non può andare in overfitting».

## La proiezione

| | legami | quota | bolle o coppie |
|---|---|---|---|
| **DENTRO la stessa bolla** (appartenenza) | **31** | 3,1% | 15 bolle |
| **FRA due bolle** (adiacenza) | **973** | 96,9% | 882 coppie |

**La curatela serve quasi solo a dire «questi due mondi sono vicini», non «questi titoli stanno insieme»**: i legami interni sono il 3% e toccano 15 bolle. La bolla con più legami interni è **[37] anime · romance · slice of life** con 6.

**Controllo con bersagli casuali appaiati per popolarità**: 0 legami interni e 996 coppie distinte. La curatela **concentra** (882 coppie contro 996) e i suoi 31 legami interni sono impossibili a caso ✓ — ma la concentrazione è **debole** (12% in meno), non la firma netta che ci si aspetterebbe da 1.004 scelte deliberate.

## ⚠️ La curatela e il grafo sono in disaccordo quasi totale

```
delle 882 coppie di bolle che la curatela collega, 14 (1,6%) sono anche archi della mappa
```

**98,4% di discordanza.** Detta così sembrerebbe che la curatela dica cose che il grafo non sa — che è l'esito desiderato del ticket.

**Ma leggendo le discordanze si vede un'altra cosa:**

| legami | bolla A | bolla B |
|---|---|---|
| **10** | [82] **marvel cinematic universe** · based on comic · superhero | [140] **superhero · based on comic · marvel cinematic universe** |
| 5 | [103] anime · based on manga · suspense | [313] anime · adult animation · horror |
| 4 | [82] MCU | [1244] supernatural horror · possession · exorcism |
| 3 | [37] anime · romance · slice of life | [933] anime · japanese high school · slice of life |
| 3 | [197] anime · cyberpunk · cyborg | [1578] anime · shounen · based on manga |

**Le prime discordanze non sono «due mondi che il grafo non collega»: sono lo STESSO mondo che la partizione ha diviso in due.** [82] e [140] hanno *entrambe* «marvel cinematic universe» come keyword principale ✗. [37] e [933] sono entrambe anime slice-of-life ✗. [103] e [313] sono entrambe anime ✗.

**Quindi la discordanza non è la curatela che sa più del grafo: è la PARTIZIONE CHE È TROPPO FINE.** Un intenditore che scrive a mano «questo film è legato a quello» non sa che esistono due bolle Marvel separate: per lui è un mondo solo ✓.

## E questa è la terza volta che lo stesso fatto emerge da un ticket diverso

| ticket | come è emerso |
|---|---|
| **05** | le bolle giudicate cattive sono **piccole** (15-35 titoli), non grandi: la caccia alle chimere guarda dalla parte sbagliata |
| **11** | il grafo sparsificato ha **117 componenti connesse**: la gerarchia a 25-35 macro-mondi è impossibile |
| **20** | la curatela collega bolle che sono **lo stesso mondo diviso in due** |

**Tre misure indipendenti dicono la stessa cosa: la struttura a 5.297 bolle è troppo frammentata.** È il risultato con cui questa fase si chiude, ed è più utile dei guadagni: dice **dove** intervenire (la granularità), non solo che qualcosa non torna.

## Quanti slot reclamerebbe (dichiarato prima di applicarlo)

| | |
|---|---|
| bolle toccate dalla curatela | **647 su 5.297 (12,2%)** |
| vicini di curatela per bolla toccata | mediana **2** · 90° percentile 5 · massimo 18 |

Su 8 slot, la curatela ne reclamerebbe **2** dove arriva (5 nei casi peggiori), e lascerebbe l'**87,8% delle bolle** con gli slot decisi solo dai dati. **È un input di minoranza**: utile come conferma e come sorgente di «mondi affini» dichiarati, non come ossatura della mappa.

## I criteri del ticket

- [x] la proiezione è costruita, con il numero di legami bolla-bolla **sopravvissuti** dichiarato (973 su 882 coppie)
- [x] i legami intra-bolla e inter-bolla sono **separati**: 31 (3,1%) contro 973 (96,9%)
- [x] i «mondi affini» sono **letti** per 647 bolle toccate; il campione letto in dettaglio (12 discordanze) mostra che **le prime sono lo stesso mondo diviso**, non mondi lontani
- [x] l'effetto sulla mappa è dichiarato **prima** di applicarlo: 2 slot di 8 dove arriva, su 12,2% delle bolle
- [x] il confronto con gli archi trovati dai dati è fatto, e la discordanza (**98,4%**) è riportata — ed è la parte più informativa
- [x] **controllo con legami casuali appaiati per popolarità**: 0 legami interni (contro 31), 996 coppie distinte (contro 882)

## Limiti dichiarati

1. **Il controllo appaiato per popolarità non è stretto**: ho appaiato sulla banda di popolarità del titolo sorgente, non sulla coppia. Un appaiamento più fine darebbe un controllo più severo, e la concentrazione della curatela (12%) potrebbe sparire.
2. **La discordanza del 98,4% include sia «la partizione è troppo fine» sia «la curatela sa qualcosa»**: le ho distinte leggendo le prime 12, non con una misura. Una misura esisterebbe (la coerenza interna delle due bolle legate) e non è stata fatta.
3. **I legami usati sono i 1.004 di training** (le sorgenti pari), perché sono quelli che stanno già nel grafo: i 1.002 di test sono il banco del ticket 19 e non vanno mischiati.
4. **Le proiezioni non sono state validate sul prodotto**: «mondi affini» è un giudizio di lettura, non una misura.
