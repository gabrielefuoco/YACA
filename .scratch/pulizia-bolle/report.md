# Pulizia delle bolle e vicinato di Spider-Man — le misure

**Data**: 21/10/2026 · **Artefatti**: `services/graph/data/` (partizione V10 `bolle-eterogeneo-subvoti`,
triangolo `bolle-eterogeneo-V10-p1.0-triangolo.npz`, `bolle.json`, `metadati-canone.npz`).
**Canone**: 66.259 titoli = 49.709 film + 16.550 serie · 3.497 bolle (mediana 11 membri).

---

## 1. I 100 vicini di Spider-Man (2002)

### Che cosa vuol dire "vicino"

Il grafo dei suggerimenti è la miscela simmetrica dei dieci componenti (CF, keyword, cast, regia,
collezioni, trama, Trakt-liste…): ogni arco ha un **peso**, e la camminata lo normalizza per riga.
Per un **seme singolo** l'ordine per peso è identico a quello della riga di transizione — la
normalizzazione è una costante — quindi "i 100 più vicini" = i 100 archi di peso maggiore.

Due precisazioni:

- il grafo **potato** che usa la camminata tiene solo il top-16 per riga (più gli archi inversi):
  da Spider-Man escono **28** archi, non 100. Per arrivare a 100 bisogna leggere il triangolo pieno
  (390 archi da quel nodo, 13,25 M nel grafo intero);
- il peso non è un coseno in [0,1]: è la somma dei componenti, e vale 259,9 per *Spider-Man 2*.
  Conta solo **relativamente**, dentro la riga.

Nodo: **`movie:557` — Spider-Man (2002, Sam Raimi)**, riga 50, bolla **2474** (5 membri: i cinque
film live-action di Spider-Man, compreso lui).

### Il numero che conta

| taglio | bolle distinte | bolle con ≥2 membri | quota di peso della riga | ultimo peso | % del massimo |
|---:|---:|---:|---:|---:|---:|
| 4 | **1** | 1 | 77,5% | 24,8739 | 9,571% |
| 8 | 4 | 2 | 84,3% | 5,0792 | 1,954% |
| 16 | 7 | 5 | 88,8% | 2,8542 | 1,098% |
| **20** | **8** | 5 | 90,3% | 2,5254 | 0,972% |
| **50** | **20** | 10 | **96,7%** | 0,6646 | **0,256%** |
| **100** | **53** | 18 | **99,1%** | 0,1573 | **0,061%** |

**Risposta**: i **50** più vicini stanno in **20 bolle**; i **100** in **53 bolle**. Ma il numero
racconta soprattutto che il vicinato è **piccolo e gerarchico**: i primi 4 (tutti nella bolla di
Spider-Man) valgono il 77,5% del peso, i primi 16 l'88,8%, e l'ultimo dei 100 vale lo **0,06%** del
primo. Oltre il rango ~40 la lista smette di essere un quartiere e diventa il rumore dei hub di
co-visione: *Peter Pan*, *Shrek*, *Pirati dei Caraibi*.

### Il vicinato, letto

| bolla | nel top 100 | che mondo è | voti mediani |
|---|---:|---|---:|
| **1634** | 10 | Marvel pre-MCU "scuro": Daredevil, Punisher, Ghost Rider, Elektra, Spawn | 2.760 |
| **1825** | 9 | X-Men della Fox (2000-2017) | 11.585 |
| **3161** | 6 | Spider-Man animato (Spectacular, Ultimate, 2017, 2025) | 396 |
| **2474** | 4 | Spider-Man live-action (Raimi + Webb) | 16.995 |
| **2187** | 4 | Fantastici 4 / Hulk (2003-2015) | 6.551 |
| **2527** | 4 | Spider-Man MCU + animazione Sony | 17.823 |
| **1474** | 4 | famiglia/avventura Spielberg (Hook, Peter Pan, Tintin) | 2.594 |
| **2649** | 3 | Blade | 5.426 |
| **1244** | 3 | Spider-Man TV anni '60-'80 | 86 |
| 44 altre | 1-2 | ognuna | — |

Le prime **9 bolle** coprono **47 dei 100**; le altre **44 bolle** si spartiscono i restanti 53.
Il "mondo Spider-Man" non è una bolla sola: è un **arcipelago di 5-7 bolle** (Raimi/Webb, MCU,
animazione, serie TV, X-Men, Fantastici 4) tenuto insieme dal pubblico, non dalla tassonomia.

### I 100, in fila

| # | peso | % del max | bolla (n) | titolo | voti | voto | bayes |
|---:|---:|---:|---|---|---:|---:|---:|
| 1 | 259.8941 | 100.000% | b2474 (5) | Spider-Man 2 (2004) | 17051 | 7.3 | 7.32 |
| 2 | 221.5708 | 85.254% | b2474 (5) | Spider-Man 3 (2007) | 15894 | 6.5 | 6.49 |
| 3 | 34.1144 | 13.126% | b2474 (5) | The Amazing Spider-Man 2 - Il potere di Electro (2014) | 14852 | 6.6 | 6.56 |
| 4 | 24.8739 | 9.571% | b2474 (5) | The Amazing Spider-Man (2012) | 19244 | 6.8 | 6.76 |
| 5 | 16.7759 | 6.455% | b1825 (11) | X-Men 2 (2003) | 11264 | 7.0 | 7.03 |
| 6 | 16.0454 | 6.174% | b1825 (11) | X-Men (2000) | 12636 | 7.0 | 7.01 |
| 7 | 9.3423 | 3.595% | b1634 (15) | Daredevil (2003) | 5638 | 5.3 | 5.37 |
| 8 | 5.0792 | 1.954% | b2187 (7) | Hulk (2003) | 6518 | 5.6 | 5.64 |
| 9 | 4.6896 | 1.804% | b2506 (4) | Batman Begins (2005) | 23347 | 7.7 | 7.72 |
| 10 | 4.4998 | 1.731% | b1825 (11) | X-Men - Conflitto finale (2006) | 10739 | 6.4 | 6.43 |
| 11 | 4.4777 | 1.723% | b2527 (4) | Spider-Man: No Way Home (2021) | 23349 | 7.9 | 7.93 |
| 12 | 4.3322 | 1.667% | b1825 (11) | X-Men: Le origini - Wolverine (2009) | 11617 | 6.3 | 6.3 |
| 13 | 4.2680 | 1.642% | b2187 (7) | I Fantastici 4 (2005) | 10273 | 5.8 | 5.83 |
| 14 | 3.3420 | 1.286% | b2388 (5) | Watchmen (2009) | 10337 | 7.4 | 7.33 |
| 15 | 2.8928 | 1.113% | b1634 (15) | The Spirit (2008) | 1097 | 4.8 | 5.13 |
| 16 | 2.8542 | 1.098% | b2527 (4) | Spider-Man: Un nuovo universo (2018) | 18019 | 8.4 | 8.37 |
| 17 | 2.7416 | 1.055% | b2187 (7) | I Fantastici 4 e Silver Surfer (2007) | 8624 | 5.6 | 5.63 |
| 18 | 2.7031 | 1.040% | b1634 (15) | Punisher - Zona di guerra (2008) | 1386 | 5.9 | 6.01 |
| 19 | 2.6464 | 1.018% | b1634 (15) | Ghost Rider (2007) | 6708 | 5.6 | 5.64 |
| 20 | 2.5254 | 0.972% | b1910 (10) | Superhero - Il più dotato fra i supereroi (2008) | 2109 | 5.3 | 5.48 |
| 21 | 2.5152 | 0.968% | b1634 (15) | Elektra (2005) | 2773 | 5.0 | 5.19 |
| 22 | 2.5011 | 0.962% | b2527 (4) | Spider-Man: Far from Home (2019) | 17735 | 7.4 | 7.37 |
| 23 | 2.4857 | 0.956% | b1634 (15) | Spawn (1997) | 1542 | 5.5 | 5.64 |
| 24 | 2.4390 | 0.938% | b2273 (9) | Doctor Strange nel Multiverso della Follia (2022) | 10981 | 7.2 | 7.2 |
| 25 | 2.3315 | 0.897% | b2527 (4) | Spider-Man: Across the Spider-Verse (2023) | 9418 | 8.3 | 8.29 |
| 26 | 2.3263 | 0.895% | b1634 (15) | Ghost Rider - Spirito di vendetta (2011) | 4206 | 5.0 | 5.1 |
| 27 | 2.3127 | 0.890% | b2649 (3) | Blade (1998) | 7031 | 6.9 | 6.84 |
| 28 | 2.2374 | 0.861% | b1825 (11) | Wolverine - L'immortale (2013) | 10622 | 6.4 | 6.44 |
| 29 | 2.2012 | 0.847% | b732 (33) | Darkman (1990) | 1598 | 6.4 | 6.42 |
| 30 | 1.9317 | 0.743% | b2649 (3) | Blade II (2002) | 5445 | 6.6 | 6.57 |
| 31 | 1.9007 | 0.731% | b1634 (15) | The Punisher (2004) | 3313 | 6.4 | 6.4 |
| 32 | 1.6521 | 0.636% | b2649 (3) | Blade: Trinity (2004) | 4495 | 5.9 | 5.9 |
| 33 | 1.5935 | 0.613% | b2245 (6) | Transformers (2007) | 12623 | 6.8 | 6.84 |
| 34 | 1.4490 | 0.558% | b2722 (3) | Men in Black II (2002) | 10976 | 6.4 | 6.4 |
| 35 | 1.3444 | 0.517% | b2696 (3) | Ant-Man (2015) | 21350 | 7.1 | 7.06 |
| 36 | 1.2788 | 0.492% | b1244 (20) | L'Uomo Ragno (1967) | 243 | 7.9 | 7.11 |
| 37 | 1.1986 | 0.461% | b1634 (15) | R.I.P.D. - Poliziotti dall'aldilà (2013) | 4421 | 5.9 | 5.9 |
| 38 | 1.1658 | 0.449% | b3161 (6) | Spider-Man (2017) | 399 | 7.5 | 7.07 |
| 39 | 1.0252 | 0.394% | b1822 (11) | Minority Report (2002) | 10017 | 7.4 | 7.33 |
| 40 | 0.9821 | 0.378% | b2567 (4) | L'incredibile Hulk (2008) | 13223 | 6.3 | 6.3 |
| 41 | 0.8557 | 0.329% | b3161 (6) | The Spectacular Spider-Man (2008) | 947 | 8.6 | 8.09 |
| 42 | 0.8555 | 0.329% | b3161 (6) | Ultimate Spider-Man (2012) | 1062 | 7.7 | 7.44 |
| 43 | 0.7903 | 0.304% | b1177 (24) | Superman (1996) | 392 | 7.7 | 7.17 |
| 44 | 0.7876 | 0.303% | b2187 (7) | Fantastic 4 - I fantastici quattro (2015) | 6581 | 4.4 | 4.49 |
| 45 | 0.7733 | 0.298% | b2567 (4) | Iron Man 2 (2010) | 23028 | 6.9 | 6.85 |
| 46 | 0.7505 | 0.289% | b2505 (4) | Gli Incredibili - Una "normale" famiglia di supereroi (2004) | 19416 | 7.7 | 7.71 |
| 47 | 0.6999 | 0.269% | b1244 (20) | Spider-Man (Supaidāman) (1978) | 127 | 7.4 | 6.77 |
| 48 | 0.6836 | 0.263% | b3161 (6) | Il vostro amichevole Spider-Man di quartiere (2025) | 306 | 7.8 | 7.16 |
| 49 | 0.6750 | 0.260% | b2696 (3) | Ant-Man and the Wasp (2018) | 14598 | 6.9 | 6.89 |
| 50 | 0.6646 | 0.256% | b3161 (6) | Spider-Man: The New Animated Series (2003) | 394 | 7.2 | 6.91 |
| 51 | 0.6169 | 0.237% | b1291 (22) | Solomon Kane (2009) | 1593 | 6.0 | 6.12 |
| 52 | 0.6152 | 0.237% | b2443 (7) | La maledizione della prima luna (2003) | 22943 | 7.8 | 7.82 |
| 53 | 0.5782 | 0.222% | b1174 (21) | L'uomo ragno (1977) | 218 | 6.3 | 6.42 |
| 54 | 0.5719 | 0.220% | b1825 (11) | X-Men - L'inizio (2011) | 13946 | 7.3 | 7.29 |
| 55 | 0.5656 | 0.218% | b2309 (6) | Shrek (2001) | 19463 | 7.8 | 7.76 |
| 56 | 0.5648 | 0.217% | b2754 (2) | G.I. Joe - La nascita dei Cobra (2009) | 5044 | 5.8 | 5.82 |
| 57 | 0.5628 | 0.217% | b2528 (5) | Deadpool (2016) | 33456 | 7.6 | 7.62 |
| 58 | 0.5619 | 0.216% | b1891 (8) | Scott Pilgrim vs. the World (2010) | 8951 | 7.5 | 7.45 |
| 59 | 0.5531 | 0.213% | b2717 (3) | Hellboy: The Golden Army (2008) | 5787 | 6.8 | 6.79 |
| 60 | 0.5161 | 0.199% | b2943 (10) | Power Rangers: Una volta e per sempre (2023) | 304 | 6.5 | 6.5 |
| 61 | 0.4924 | 0.189% | b1474 (18) | Hook - Capitan Uncino (1991) | 5901 | 6.8 | 6.79 |
| 62 | 0.4826 | 0.186% | b1825 (11) | X-Men - Apocalisse (2016) | 14197 | 6.5 | 6.53 |
| 63 | 0.4686 | 0.180% | b1888 (13) | Monsters & Co. (2001) | 20409 | 7.9 | 7.84 |
| 64 | 0.4547 | 0.175% | b3161 (6) | Spider-Man Unlimited (1999) | 261 | 7.6 | 7.01 |
| 65 | 0.4469 | 0.172% | b1825 (11) | Logan - The Wolverine (2017) | 20973 | 7.8 | 7.8 |
| 66 | 0.4103 | 0.158% | b1825 (11) | X-Men - Giorni di un futuro passato (2014) | 16797 | 7.5 | 7.52 |
| 67 | 0.3915 | 0.151% | b1696 (12) | LEGO Marvel Spider-Man: Vexed by Venom (2019) | 44 | 6.1 | 6.45 |
| 68 | 0.3640 | 0.140% | b1474 (18) | Pan - Viaggio sull'isola che non c'è (2015) | 2886 | 6.0 | 6.01 |
| 69 | 0.3535 | 0.136% | b2345 (7) | Marvel Rising - Initation (2018) | 35 | 6.7 | 6.52 |
| 70 | 0.3478 | 0.134% | b2388 (5) | V per Vendetta (2006) | 16074 | 7.9 | 7.87 |
| 71 | 0.3173 | 0.122% | b186 (61) | M.A.N.T.I.S. (1994) | 13 | 5.0 | 6.44 |
| 72 | 0.3145 | 0.121% | b1634 (15) | Il vendicatore (1989) | 720 | 5.8 | 6.01 |
| 73 | 0.2995 | 0.115% | b3388 (4) | The Mask: Da zero a mito (1994) | 11648 | 7.0 | 6.98 |
| 74 | 0.2970 | 0.114% | b1888 (13) | Alla ricerca di Nemo (2003) | 21080 | 7.8 | 7.78 |
| 75 | 0.2943 | 0.113% | b2506 (4) | Il cavaliere oscuro (2008) | 37009 | 8.5 | 8.52 |
| 76 | 0.2905 | 0.112% | b1405 (17) | Pronti a morire (1995) | 2069 | 6.6 | 6.56 |
| 77 | 0.2850 | 0.110% | b1474 (18) | Peter Pan (2003) | 2812 | 7.1 | 7.07 |
| 78 | 0.2743 | 0.106% | b2936 (22) | 50 States of Fright (2020) | 104 | 7.2 | 6.68 |
| 79 | 0.2729 | 0.105% | b1414 (7) | INVINCIBLE (2021) | 6119 | 8.6 | 8.53 |
| 80 | 0.2652 | 0.102% | b1486 (8) | Neverland - La vera storia di Peter Pan (2011) | 215 | 6.2 | 6.36 |
| 81 | 0.2603 | 0.100% | b1244 (20) | L'Uomo Ragno (1981) | 86 | 7.3 | 6.68 |
| 82 | 0.2523 | 0.097% | b1174 (21) | L'uomo ragno colpisce ancora (1978) | 86 | 5.8 | 6.34 |
| 83 | 0.2462 | 0.095% | b3491 (2) | Sin City (2005) | 9070 | 7.5 | 7.43 |
| 84 | 0.2411 | 0.093% | b1474 (18) | Peter Pan & Wendy (2023) | 788 | 5.4 | 5.7 |
| 85 | 0.2374 | 0.091% | b1982 (8) | Drag Me to Hell (2009) | 4260 | 6.5 | 6.49 |
| 86 | 0.2358 | 0.091% | b2671 (3) | Power Rangers - Il film (1995) | 799 | 5.9 | 6.06 |
| 87 | 0.2203 | 0.085% | b1791 (14) | Star Wars: Episodio II - L'attacco dei cloni (2002) | 14805 | 6.6 | 6.6 |
| 88 | 0.2201 | 0.085% | b2608 (4) | Austin Powers - La spia che ci provava (1999) | 3835 | 6.3 | 6.31 |
| 89 | 0.2159 | 0.083% | b593 (17) | Marvel's The Punisher (2017) | 3402 | 8.2 | 8.03 |
| 90 | 0.1984 | 0.076% | b1453 (16) | Le avventure di Peter Pan (1953) | 5861 | 7.2 | 7.17 |
| 91 | 0.1975 | 0.076% | b990 (25) | Cobweb (2023) | 1146 | 6.4 | 6.45 |
| 92 | 0.1908 | 0.073% | b2443 (7) | Pirati dei Caraibi - La maledizione del forziere fantasma (2006) | 17708 | 7.4 | 7.38 |
| 93 | 0.1901 | 0.073% | b1822 (11) | Io, robot (2004) | 13095 | 7.0 | 6.96 |
| 94 | 0.1880 | 0.072% | b2251 (6) | Pantaloncini a tutto gas (2002) | 94 | 3.5 | 5.78 |
| 95 | 0.1799 | 0.069% | b2551 (4) | Matrix Reloaded (2003) | 12435 | 7.1 | 7.07 |
| 96 | 0.1787 | 0.069% | b1153 (23) | Dragon's World: A Fantasy Made Real (2004) | 28 | 7.9 | 6.62 |
| 97 | 0.1773 | 0.068% | b641 (32) | Peter va sulla luna (1990) | 16 | 7.2 | 6.54 |
| 98 | 0.1673 | 0.064% | b701 (20) | Antboy (2013) | 153 | 5.6 | 6.2 |
| 99 | 0.1617 | 0.062% | b2421 (6) | Peter senza coda (1981) | 31 | 6.4 | 6.49 |
| 100 | 0.1573 | 0.061% | b2309 (6) | Shrek 2 (2004) | 13865 | 7.3 | 7.31 |

---

## 2. Pulire le bolle con la coda bassa del punteggio

### 2.1 La proposta letterale

Per ogni bolla (almeno 5 membri) si prende il **voto bayesiano** già in uso
(`canon.voto_bayesiano`: `m=300`, `C=6.5`, cioè `(voti·voto + 300·6.5)/(voti+300)`), la sua media e
la sua deviazione standard, e si eliminano i membri sotto `media − k·σ`. Solo la coda **negativa**.

| k | titoli persi | % del canone | film | serie | bolle toccate |
|---:|---:|---:|---:|---:|---:|
| 1,0 | 7.600 | 11,47% | 6.576 | 1.024 | 2.566 |
| 1,5 | 3.309 | 4,99% | 3.098 | 211 | 1.684 |
| 2,0 | 1.478 | 2,23% | 1.418 | 60 | 965 |
| **2,5** | **715** | **1,08%** | **694** | **21** | **543** |
| 3,0 | 346 | 0,52% | 336 | 10 | 297 |

**La risposta secca**: con la regola come l'hai scritta, a **2,5σ** perdi **715 titoli (694 film,
l'1,4% dei film)**; a 2σ ne perdi 1.478 (1.418 film). A 1σ ne perdi 7.600 — ma 1σ non è "troppo":
è la deviazione **tipica**, e infatti taglia l'11,5%.

### 2.2 Perché il bayesiano `m=300` non è il punteggio giusto per questo

Il bayesiano è fatto per **ordinare**, non per **misurare uno scarto**. Con `m=300` e un canone in cui
il `vote_count` mediano è **51**, tre titoli su quattro vengono tirati verso 6,5:

- il **76,2%** del canone sta entro ±0,25 dal 6,5; σ = 0,332, MAD = 0,136 (il voto grezzo ha σ = 1,064);
- un film da **2,0** con 42 voti vale **5,95**; uno da 1,8 con 10 voti vale **6,35**; uno da 4,5 con
  500 voti vale **5,25**.

Quindi la regola non premia "il film brutto", premia **il film brutto che ha abbastanza voti per
essere misurato**. I 715 rimossi a 2,5σ hanno `vote_count` mediano **149** (contro 51 del canone),
`vote_average` mediano **4,76**, e solo 9 stanno sopra 6. Va benissimo se la "schifezza" che vedi è
quella nota; dei 32.555 titoli sotto i 50 voti (metà del canone) ne tocca solo **104** (0,3%).

C'è anche un difetto strutturale: la σ della bolla **cresce** proprio nelle bolle eterogenee (i
"contenitori"), e una σ grande **protegge** gli intrusi. Misurato: nell'ultimo decile di σ la regola
rimuove lo 0,47% dei titoli, nei decili centrali l'1,2-1,4%. Le 238 bolle con mediana grezza sotto
5,5 (5.423 titoli) perdono solo **104** titoli (1,9%): le bolle interamente brutte restano intatte,
perché lì nessuno è "sotto la media".

### 2.3 Il limite matematico dello z (e perché le bolle piccole si salvano da sole)

Per n osservazioni il massimo scarto standardizzato possibile è `(n−1)/√n`. Quindi:

| n | z massimo possibile |
|---:|---:|
| 4 | 1,50 |
| 5 | 1,79 |
| 6 | 2,04 |
| 8 | 2,47 |
| 9 | 2,67 |
| 11 | 3,02 |

**Con meno di 9 membri, "2,5σ" è letteralmente impossibile**; con meno di 6 è impossibile anche
"2σ". È il motivo per cui la soglia `n≥5` non cambia quasi nulla (715 sia con `n≥5` sia con `n≥8`):
la taglia fa già da guardiano. Il rovescio: quelle bolle non vengono mai pulite.

### 2.4 La regola che consiglio

Due filtri indipendenti, perché fanno due mestieri diversi:

1. **Pavimento assoluto** — `vote_count ≥ 50` e `vote_average < 5,0`: è la schifezza **nota**,
   indipendente dalla bolla. **1.671 titoli** (2,52%): 1.643 film, 28 serie, 693 bolle. Solo 257
   stanno in bolle con mediana sotto 5,0: è un filtro sui **singoli film**, non sulle bolle intere
   (quelle si affrontano in §2.5).
2. **Intruso relativo** — la tua idea, ma sul bayesiano `m=300`, a **2,5σ**, solo bolle con ≥5 membri:
   **715 titoli** (694 film). Insieme al pavimento: **2.057 titoli (3,10%)**, di cui **2.017 film**
   (4,1% dei film) e 40 serie; 902 bolle toccate, 9 soli titoli sopra 6, 6 bolle svuotate, 28 bolle
   che scendono sotto i 5 membri.

| variante | titoli | film | serie | bolle | sopra 6 |
|---|---:|---:|---:|---:|---:|
| solo relativo 2,5σ | 715 | 694 | 21 | 543 | 9 |
| solo pavimento | 1.671 | 1.643 | 28 | 693 | 0 |
| **unione (consigliata)** | **2.057** | **2.017** | **40** | **902** | **9** |
| unione a 2σ | 2.613 | 2.541 | 72 | 1.171 | 55 |

Se invece l'obiettivo è la **coerenza** della bolla e non solo la qualità (togliere anche un 6,2 da
una bolla che vive a 8,0), lo stesso z va fatto sul **voto grezzo**, con mediana/MAD robusti e un
distacco minimo di 1,0 punto: **1.721 titoli** (1.278 film, 443 serie); unito al pavimento fa
**3.141 titoli (4,74%)** — 2.681 film, 460 serie, 1.396 bolle, 118 sopra 6, 106 bolle che perdono
almeno un quarto dei membri. È più aggressivo e tocca le serie molto più del bayesiano.

### 2.5 L'altra strada: togliere le bolle intere

Se il problema sono i "mondi" di schifezza, il filtro relativo è lo strumento sbagliato: quelli non
hanno intrusi, sono **tutti** intrusi. La misura, sulla mediana grezza della bolla:

| mediana `vote_average` | bolle | titoli |
|---|---:|---:|
| < 4,5 | 18 | 356 |
| < 5,0 | 69 | 1.430 |
| < 5,5 | 238 | 5.423 |

Togliere le 69 bolle sotto 5,0 costa **1.430 titoli** — meno dell'unione dei due filtri, e agisce
proprio sui contenitori. È una decisione di prodotto diversa: non "pulisco le bolle", ma "quelle
bolle non le servo".

### 2.6 Cosa questo filtro NON risolve

- **Non pulisce il grafo.** Gli archi restano: la camminata passa ancora dai titoli rimossi, e la
  loro attivazione resta. Va messa una **maschera in uscita** (o rifatta la partizione coi centroidi
  sui membri puliti); togliere righe da `bolle.json` cambia le liste ma non il cammino.
- **Non è stabile fra partizioni.** Gli id delle bolle non lo sono (mappa §9): la lista di esclusione
  va tenuta per chiave `movie:id`/`tv:id`, versionata con l'impronta dell'artefatto.
- **Non è una misura di gusto.** È un filtro di qualità: un film cult da 4,0 sparisce insieme alla
  schifezza vera. Se serve distinguere, l'unico arbitro è l'occhio su un campione, non un'altra soglia.
- **Il numero dipende da k, non dai dati.** Uno z-cut rimuove sempre una quota fissata: 1σ ≈ 11-15%,
  2σ ≈ 2-3%, 2,5σ ≈ 1%. La soglia è una scelta di prodotto; la misura dice solo **quanto costa**.

---

## Riproduzione

```bash
cd .scratch/pulizia-bolle
../../offline_graph_builder/venv/Scripts/python.exe 01-vicini.py   # top 100 + CSV
../../offline_graph_builder/venv/Scripts/python.exe 02-pulizia.py  # soglie + CSV candidati
```

File: `vicini-spiderman-100.csv` (100 righe) · `candidati-pulizia.csv` (2.057 righe, la regola
consigliata: motivo `schifezza`/`coda bayes` e numeri della bolla) · `candidati-coerenza.csv`
(3.141 righe, la variante che toglie anche gli intrusi sul voto grezzo).
