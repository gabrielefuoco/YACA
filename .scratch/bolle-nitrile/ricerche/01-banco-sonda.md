# Ticket 01 — il banco sonda

**Script**: `sonda.py` · **Riferimento**: `bolle2-E.npy` (la partizione della fase precedente)
**Data**: 14/10/2026

## Cos'è, e perché è il primo ticket

Gli indicatori aggregati — modularità, λ₂, purezza, conteggio delle bolle, intruder test — ci hanno
tradito **quattro volte su quattro**: ognuno ha premiato una partizione che, leggendo i titoli, era
peggiore. Il ticket 08 di `grafo-servibile` è il caso da manuale: **+12,6% di bolle utilizzabili**
ottenuto **rompendo bolle buone**.

Il banco sonda non è un indicatore in più: è **la lettura resa ripetibile**. 20 titoli fissi, i loro
compagni di bolla, `+`/`-` rispetto a una partizione di riferimento.

## I 20 titoli sentinella

| gruppo | titolo | perché è lì |
|---|---|---|
| minestrone | **Le jene di Chicago** | bolla 217: 35 titoli di genere doppiato anni '50-'70 |
| minestrone | **Garfield - Il Supergatto** | bolla 1270: Garfield + Boxcar Children + Spawn + Sansone |
| minestrone | **Gidget a Roma** | bolla 1267: film TV americani vecchi |
| minestrone | **La storia infinita** | bolla 1215: la trilogia + Rambo III + un film coi delfini |
| minestrone | **Wimbledon** | bolla 1288: drammi generici per adulti |
| nicchia | **Banana Fish** | seinen anime (con Kaiji, 91 Days, Akudama Drive) |
| nicchia | **Barakamon** | iyashikei (con Senko-san, Aria, Flying Witch) |
| nicchia | **Watamote** | slice-of-life comico (con Bakuman, Kakushigoto) |
| nicchia | **Boys Over Flowers** | romance asiatico live-action |
| nicchia | **Flying Witch** | iyashikei puro |
| autore | **Il matrimonio di Maria Braun** | Fassbinder |
| autore | **I sette samurai** | Kurosawa / classici giapponesi |
| autore | **Profondo Rosso** | Argento / giallo italiano |
| autore | **Stalker** | Tarkovsky / cinema sovietico |
| autore | **Il tamburo di latta** | Schlöndorff / Nuovo cinema tedesco |
| intruso | **Into Darkness - Star Trek** | l'intruso nella bolla Star Wars (J.J. Abrams dirige entrambi) |
| intruso | **Guerre stellari** | la bolla che ha subito l'intruso |
| cross-medium | **The Mandalorian** | serie TV: sta con i film di Star Wars? |
| cross-medium | **Star Trek: Discovery** | serie TV: sta con i film di Star Trek? |
| cross-medium | **Żeby nie było śladów** | titolo polacco (la prova cross-medium del ticket 12) |

⚠️ **Tre sentinelle sono state corrette dopo il primo giro**, e vale la pena dirlo: il nome cercato
prend «il primo che capita».
- `The Bad Seed` esiste **due volte** (1956 e 2018) e l'esatto ha preso il remake TV → sostituito con
  **Gidget a Roma** (bolla 1267).
- `Star Wars` non è il titolo italiano: è **Guerre stellari** (riga 126).
- `Star Trek Into Darkness` è **Into Darkness - Star Trek** (riga 840).
- `Aria` prendeva un omonimo non-anime → sostituito con **Flying Witch** (stessa bolla iyashikei).

## Cosa dice il banco sonda sul RIFERIMENTO (`bolle2-E`)

Il criterio di chiusura era: **lo strumento deve riprodurre le letture già fatte a mano.** Le
riproduce, tutte.

### Le 5 minestrone — confermate, con gradazioni diverse

| sentinella | bolla | lettura |
|---|---|---|
| La storia infinita | 1215, 15 titoli | **minestrone pieno**: la trilogia + **Rambo III** + *Andre - Un amico con le pinne* + *Zeus e Roxanne* |
| Garfield - Il Supergatto | 1270, 15 titoli | **minestrone pieno**: Garfield + **Spawn** + Sansone + LEGO Elves + Boxcar Children |
| Gidget a Roma | 1267, 15 titoli | **sacco**: Gidget + The Legend of Lizzie Borden + Hell Boats + La battaglia del Mar dei Coralli |
| Wimbledon | 1288, 15 titoli | **sacco generico**: Wimbledon + Firewall + Riccardo III + I due presidenti |
| Le jene di Chicago | 217, **35** titoli | **semi-coerente**: è un mondo vero (genere americano doppiato anni '50-'70) ma con 35 titoli di generi diversissimi |

Il dettaglio conta: **la 217 non è un minestrone come gli altri** — è un mondo reale, troppo grande.
Le tre peggiori (1215, 1270, 1288) sono invece mondi che non esistono.

### Le 4 nicchie delicate — NON sono rotte. Sono perfette.

Questo è il risultato che vale di più, perché **conferma con lo strumento la lettura fatta a mano
nel ticket 08**:

| sentinella | bolla | lettura |
|---|---|---|
| **Barakamon** | 499, 24 titoli | **iyashikei perfetto**: Senko-san, Flying Witch, Is the order a rabbit?, Aria, Mitsuboshi Colors, Tiny Little Life in the Woods, Slow Loop, ZatsuTabi… |
| **Watamote** | 387, 27 titoli | **commedia slice-of-life perfetta**: Bakuman, Hitoribocchi, Kakushigoto, Kotaro, WATATEN, School Rumble, Chio-chan, Comic Girls… |
| **Boys Over Flowers** | 412, 26 titoli | **romance asiatico perfetto**: Playful Kiss, Good Morning Call, Mischievous Kiss, HANA-KIMI, dorama giapponesi e coreani |
| **Banana Fish** | 291, 31 titoli | **seinen dark coerente**: Terror in Resonance, Inuyashiki, Moriarty, 91 Days, Akudama Drive, Kaiji, Tomodachi Game, Rainbow… |

**Quattro mondi su quattro, nominabili e stretti.** Il ticket 08 li aveva **dissolti** guardando la
purezza esterna («gli anime parlano con altri anime»). Il banco sonda lo dice in dieci secondi.

### Le 5 d'autore — tutte coerenti

| sentinella | bolla | lettura |
|---|---|---|
| Il matrimonio di Maria Braun | 210, 36 titoli | Fassbinder completo (Petra von Kant, Querelle, Veronika Voss, Lola, Lili Marleen, Martha…) |
| I sette samurai | 148, 41 titoli | classici giapponesi: Rashomon, Ran, Harakiri, Il trono di sangue, Kagemusha, Kwaidan, Cane randagio |
| Profondo Rosso | 439, 26 titoli | Argento + horror italiano: Suspiria, Phenomena, Tenebre, Inferno, Opera, La chiesa, Deliria |
| Stalker | 1569, 13 titoli | Tarkovsky + sovietico: Va' e vedi, Solaris, Lo specchio, Andrej Rublëv, Nostalghia |
| Il tamburo di latta | 1102, 16 titoli | Nuovo cinema tedesco + riduzioni letterarie: Il caso Katharina Blum, I turbamenti del giovane Törless, Homo Faber |

### Gli intrusi e il cross-medium — **due patologie nuove, non documentate prima**

| sentinella | bolla | lettura |
|---|---|---|
| **The Mandalorian** | **1820, 12 titoli** | ❌ **MINESTRONE**: Il re leone, Il libro della giungla, Cowboys & Aliens, Elf, Chef - La ricetta perfetta, Zathura, The Book of Boba Fett |
| **Star Trek: Discovery** | **1057, 16 titoli** | ⚠️ **semi**: Star Trek: Picard, Strange New Worlds, Short Treks ✓ **ma anche** La mummia, Fringe, Hawaii Five-0, Sleepy Hollow, MacGyver, Magnum P.I., Clarice |
| Guerre stellari / Into Darkness | — | da leggere sul giro completo |

**La bolla di The Mandalorian è una scoperta di questo ticket**: il *Mandalorian* sta con *Il re
leone*, *Elf* e *Chef*. È il caso **cross-medium** che il prodotto dichiara di volere, ed è rotto.
E *Star Trek: Discovery* mescola le serie di Star Trek con i reboot procedurali — un secondo caso
dello stesso tipo, che nessuno aveva segnalato.

## Verdetto del ticket 01

✅ **Lo strumento funziona**: riproduce le letture a mano, e ne ha trovate **due nuove** che i numeri
non avevano mai mostrato (Mandalorian e Star Trek: Discovery).

✅ **Il riferimento da battere è più debole di quanto pensassimo su un punto e più forte su un
altro**: le nicchie delicate **non vanno toccate** (sono già perfette: qualunque intervento che le
smonti è un peggioramento), mentre le bolle cross-medium sono rotte e **nessuno se n'era accorto**.

**Le tre domande, da qui in avanti, per ogni variante**: la bolla è un mondo nominabile? l'intruso
se n'è andato? la nicchia è rimasta intera?
