# Fotografia di una parte del grafo

**Data**: 21/10/2026 · **Artefatto**: triangolo V10 + `bolle.json` + `metadati-canone.npz`.
**CSV**: `fotografia-grafo.csv` (l'elenco completo: 6 seed × top-20, tutte le coppie interne
della bolla 1395, gli archi Inkheart → bolla 674).

Questa non è una descrizione: è **un pezzo del grafo vero**, con i pesi e il contesto, per
decidere **come costruire i pesi** della matrice N×20. I numeri sono quelli del triangolo;
`w_norm` è il peso normalizzato sulla somma della riga, `w_pct_max` è il peso in percentuale
del massimo della riga.

---

## 1. Il grafo in una tabella

| proprietà | archi | peso |
|---|---:|---:|
| stessa bolla | 10.8% | 52.8% |
| stessa collezione (saga) | 0.2% | 17.4% |
| stesso regista | 2.9% | 15.5% |
| stesso medium (film/film, serie/serie) | 86.4% | 92.9% |
| anno entro 2 | 22.4% | 33.2% |
| anno entro 5 | 40.9% | 54.4% |
| anno entro 10 | 60.5% | 71.4% |
| anno oltre 10 | 39.5% | 28.6% |
| entrambi ≥ 50 voti | 43.5% | 53.1% |

- archi: **13,253,674** · peso: **1,929,609.6** · grado (simmetrico): mediana **175**, p90 **349**, max **1,737**
- peso per arco: mediana **0.0299**, p90 **0.580**, max **402.85**
- copertura del peso di riga con i top-k: top-10 **38.6%** · top-20 **58.5%** · top-30 **71.9%** · top-50 **86.1%** (mediane; p10 top-20 39.2%, p90 82.9%)

**Come si legge**: il 10,8% degli archi sta dentro una bolla e porta il **52,8%** del peso;
lo 0,2% degli archi è una saga e porta il **17,4%**; il **92,9%** del peso è sullo stesso medium.
Il grafo è **concentrato**: la potatura top-16 tiene l'11,5% degli archi e il 70,4% della massa
intra-bolla. Non è un grafo di similarità puro: è una miscela di co-visione, keyword, cast,
regia, collezioni, trama e liste Trakt.

---

## 2. I primi 20 vicini, in chiaro


### Spider-Man (2002) — bolla 2474 (5 membri) · kw:superhero, kw:based on comic, ge:science fiction, kw:secret identity
  grado 390 · somma pesi 697.39 · max 259.89 · top1 37.3% · top5 79.9% · top20 90.3%
  | # | peso | norma | %max | bolla | titolo | anno | voti | voto | stesso? |
  |---:|---:|---:|---:|---:|---|---:|---:|---:|---|
  | 1 | 259.894 | 37.27% | 100.0% | 2474 | Spider-Man 2 (2004) | 2004 | 17051 | 7.3 | bolla, coll, regia, medium |
  | 2 | 221.571 | 31.77% | 85.3% | 2474 | Spider-Man 3 (2007) | 2007 | 15894 | 6.5 | bolla, coll, regia, medium |
  | 3 | 34.114 | 4.89% | 13.1% | 2474 | The Amazing Spider-Man 2 - Il potere di Electro (2014) | 2014 | 14852 | 6.6 | bolla, medium |
  | 4 | 24.874 | 3.57% | 9.6% | 2474 | The Amazing Spider-Man (2012) | 2012 | 19244 | 6.8 | bolla, medium |
  | 5 | 16.776 | 2.41% | 6.5% | 1825 | X-Men 2 (2003) | 2003 | 11264 | 7.0 | medium |
  | 6 | 16.045 | 2.30% | 6.2% | 1825 | X-Men (2000) | 2000 | 12636 | 7.0 | medium |
  | 7 | 9.342 | 1.34% | 3.6% | 1634 | Daredevil (2003) | 2003 | 5638 | 5.3 | medium |
  | 8 | 5.079 | 0.73% | 2.0% | 2187 | Hulk (2003) | 2003 | 6518 | 5.6 | medium |
  | 9 | 4.690 | 0.67% | 1.8% | 2506 | Batman Begins (2005) | 2005 | 23347 | 7.7 | medium |
  | 10 | 4.500 | 0.65% | 1.7% | 1825 | X-Men - Conflitto finale (2006) | 2006 | 10739 | 6.4 | medium |
  | 11 | 4.478 | 0.64% | 1.7% | 2527 | Spider-Man: No Way Home (2021) | 2021 | 23349 | 7.9 | medium |
  | 12 | 4.332 | 0.62% | 1.7% | 1825 | X-Men: Le origini - Wolverine (2009) | 2009 | 11617 | 6.3 | medium |
  | 13 | 4.268 | 0.61% | 1.6% | 2187 | I Fantastici 4 (2005) | 2005 | 10273 | 5.8 | medium |
  | 14 | 3.342 | 0.48% | 1.3% | 2388 | Watchmen (2009) | 2009 | 10337 | 7.4 | medium |
  | 15 | 2.893 | 0.41% | 1.1% | 1634 | The Spirit (2008) | 2008 | 1097 | 4.8 | medium |
  | 16 | 2.854 | 0.41% | 1.1% | 2527 | Spider-Man: Un nuovo universo (2018) | 2018 | 18019 | 8.4 | medium |
  | 17 | 2.742 | 0.39% | 1.1% | 2187 | I Fantastici 4 e Silver Surfer (2007) | 2007 | 8624 | 5.6 | medium |
  | 18 | 2.703 | 0.39% | 1.0% | 1634 | Punisher - Zona di guerra (2008) | 2008 | 1386 | 5.9 | medium |
  | 19 | 2.646 | 0.38% | 1.0% | 1634 | Ghost Rider (2007) | 2007 | 6708 | 5.6 | medium |
  | 20 | 2.525 | 0.36% | 1.0% | 1910 | Superhero - Il più dotato fra i supereroi (2008) | 2008 | 2109 | 5.3 | medium |

### Inkheart (2008) — bolla 1395 (22 membri) · ge:fantasy, ge:family, ge:adventure, kw:based on young adult novel
  grado 444 · somma pesi 123.68 · max 12.32 · top1 10.0% · top5 37.2% · top20 82.9%
  | # | peso | norma | %max | bolla | titolo | anno | voti | voto | stesso? |
  |---:|---:|---:|---:|---:|---|---:|---:|---:|---|
  | 1 | 12.320 | 9.96% | 100.0% | 1395 | Spiderwick - Le cronache (2008) | 2008 | 2965 | 6.7 | bolla, medium |
  | 2 | 9.601 | 7.76% | 77.9% | 1291 | L'apprendista stregone (2010) | 2010 | 5424 | 6.1 | medium |
  | 3 | 8.336 | 6.74% | 67.7% | 1395 | Un ponte per Terabithia (2007) | 2007 | 5494 | 7.4 | bolla, medium |
  | 4 | 8.317 | 6.72% | 67.5% | 1395 | La bussola d'oro (2007) | 2007 | 4964 | 6.1 | bolla, medium |
  | 5 | 7.473 | 6.04% | 60.7% | 1395 | Stardust (2007) | 2007 | 4620 | 7.3 | bolla, medium |
  | 6 | 6.672 | 5.39% | 54.2% | 1395 | Nanny McPhee - Tata Matilda (2005) | 2005 | 3297 | 6.7 | bolla, medium |
  | 7 | 6.574 | 5.32% | 53.4% | 2734 | Percy Jackson e gli dei dell'Olimpo - Il ladro di fulmini (2010) | 2010 | 7982 | 6.2 | medium |
  | 8 | 5.470 | 4.42% | 44.4% | 1395 | Eragon (2006) | 2006 | 3530 | 5.1 | bolla, medium |
  | 9 | 5.319 | 4.30% | 43.2% | 1395 | Water Horse - La leggenda degli abissi (2007) | 2007 | 1187 | 6.6 | bolla, medium |
  | 10 | 5.019 | 4.06% | 40.7% | 1395 | Mr. Magorium e la bottega delle meraviglie (2007) | 2007 | 1343 | 6.3 | bolla, medium |
  | 11 | 3.439 | 2.78% | 27.9% | 1797 | Viaggio al centro della Terra (2008) | 2008 | 5326 | 6.1 | medium |
  | 12 | 3.334 | 2.70% | 27.1% | 2636 | Le cronache di Narnia - Il principe Caspian (2008) | 2008 | 6967 | 6.6 | medium |
  | 13 | 3.242 | 2.62% | 26.3% | 1474 | Pan - Viaggio sull'isola che non c'è (2015) | 2015 | 2886 | 6.0 | medium |
  | 14 | 3.156 | 2.55% | 25.6% | 2093 | Biancaneve (2012) | 2012 | 3326 | 5.9 | medium |
  | 15 | 3.119 | 2.52% | 25.3% | 2636 | Le cronache di Narnia - Il viaggio del veliero (2010) | 2010 | 6050 | 6.4 | medium |
  | 16 | 2.853 | 2.31% | 23.2% | 1395 | Ember - Il mistero della città di luce (2008) | 2008 | 1968 | 6.4 | bolla, medium |
  | 17 | 2.532 | 2.05% | 20.5% | 2711 | The Librarian 3 - La maledizione del calice di Giuda (2008) | 2008 | 544 | 6.3 | medium |
  | 18 | 2.235 | 1.81% | 18.1% | 1395 | Alla ricerca dell'isola di Nim (2008) | 2008 | 1218 | 5.9 | bolla, medium |
  | 19 | 1.862 | 1.51% | 15.1% | 1797 | Corsa a Witch Mountain (2009) | 2009 | 1877 | 5.8 | medium |
  | 20 | 1.621 | 1.31% | 13.2% | 2734 | Percy Jackson e gli Dei dell'Olimpo - Il mare dei mostri (2013) | 2013 | 5481 | 6.0 | medium |

### Un ponte per Terabithia (2007) — bolla 1395 (22 membri) · ge:fantasy, ge:family, ge:adventure, kw:based on young adult novel
  grado 426 · somma pesi 89.13 · max 9.05 · top1 10.2% · top5 37.8% · top20 81.9%
  | # | peso | norma | %max | bolla | titolo | anno | voti | voto | stesso? |
  |---:|---:|---:|---:|---:|---|---:|---:|---:|---|
  | 1 | 9.055 | 10.16% | 100.0% | 1395 | Spiderwick - Le cronache (2008) | 2008 | 2965 | 6.7 | bolla, medium |
  | 2 | 8.336 | 9.35% | 92.1% | 1395 | Inkheart - La leggenda di cuore d'inchiostro (2008) | 2008 | 2342 | 6.3 | bolla, medium |
  | 3 | 6.007 | 6.74% | 66.3% | 1395 | Water Horse - La leggenda degli abissi (2007) | 2007 | 1187 | 6.6 | bolla, medium |
  | 4 | 5.787 | 6.49% | 63.9% | 1395 | La bussola d'oro (2007) | 2007 | 4964 | 6.1 | bolla, medium |
  | 5 | 4.494 | 5.04% | 49.6% | 1474 | Peter Pan (2003) | 2003 | 2812 | 7.1 | medium |
  | 6 | 4.237 | 4.75% | 46.8% | 1395 | Mr. Magorium e la bottega delle meraviglie (2007) | 2007 | 1343 | 6.3 | bolla, medium |
  | 7 | 4.189 | 4.70% | 46.3% | 1395 | Zathura - Un'avventura spaziale (2005) | 2005 | 3727 | 6.5 | bolla, medium |
  | 8 | 3.970 | 4.45% | 43.8% | 1395 | Nanny McPhee - Tata Matilda (2005) | 2005 | 3297 | 6.7 | bolla, medium |
  | 9 | 3.376 | 3.79% | 37.3% | 1395 | Eragon (2006) | 2006 | 3530 | 5.1 | bolla, medium |
  | 10 | 2.927 | 3.28% | 32.3% | 1395 | Mimzy - Il segreto dell'universo (2007) | 2007 | 503 | 6.3 | bolla, medium |
  | 11 | 2.831 | 3.18% | 31.3% | 2636 | Le cronache di Narnia - Il principe Caspian (2008) | 2008 | 6967 | 6.6 | medium |
  | 12 | 2.740 | 3.07% | 30.3% | 124 | Moonacre - I segreti dell'ultima luna (2009) | 2009 | 516 | 6.6 | regia, medium |
  | 13 | 2.504 | 2.81% | 27.7% | 1395 | Ember - Il mistero della città di luce (2008) | 2008 | 1968 | 6.4 | bolla, medium |
  | 14 | 2.242 | 2.51% | 24.8% | 1395 | Stardust (2007) | 2007 | 4620 | 7.3 | bolla, medium |
  | 15 | 2.220 | 2.49% | 24.5% | 1304 | La tela di Carlotta (2006) | 2006 | 1503 | 6.2 | medium |
  | 16 | 2.210 | 2.48% | 24.4% | 1797 | Viaggio al centro della Terra (2008) | 2008 | 5326 | 6.1 | medium |
  | 17 | 1.711 | 1.92% | 18.9% | 1395 | Alla ricerca dell'isola di Nim (2008) | 2008 | 1218 | 5.9 | bolla, medium |
  | 18 | 1.656 | 1.86% | 18.3% | 961 | Lemony Snicket - Una serie di sfortunati eventi (2004) | 2004 | 5401 | 6.8 | medium |
  | 19 | 1.410 | 1.58% | 15.6% | 2386 | Happy Feet (2006) | 2006 | 5618 | 6.2 | medium |
  | 20 | 1.101 | 1.24% | 12.2% | 1535 | Monster House (2006) | 2006 | 4517 | 6.7 | medium |

### Inception (2010) — bolla 2088 (8 membri) · ge:science fiction, kw:astronaut, kw:space, kw:patisserie
  grado 509 · somma pesi 194.21 · max 24.14 · top1 12.4% · top5 47.4% · top20 80.2%
  | # | peso | norma | %max | bolla | titolo | anno | voti | voto | stesso? |
  |---:|---:|---:|---:|---:|---|---:|---:|---:|---|
  | 1 | 24.142 | 12.43% | 100.0% | 2551 | Matrix (1999) | 1999 | 28997 | 8.3 | medium |
  | 2 | 23.077 | 11.88% | 95.6% | 2088 | Interstellar (2014) | 2014 | 41553 | 8.5 | bolla, regia, medium |
  | 3 | 19.183 | 9.88% | 79.5% | 1078 | The Prestige (2006) | 2006 | 18284 | 8.2 | regia, medium |
  | 4 | 14.428 | 7.43% | 59.8% | 1078 | Memento (2000) | 2000 | 16892 | 8.2 | regia, medium |
  | 5 | 11.196 | 5.77% | 46.4% | 1078 | Fight Club (1999) | 1999 | 33054 | 8.4 | medium |
  | 6 | 9.890 | 5.09% | 41.0% | 1187 | Source Code (2011) | 2011 | 9500 | 7.3 | medium |
  | 7 | 7.728 | 3.98% | 32.0% | 2506 | Il cavaliere oscuro (2008) | 2008 | 37009 | 8.5 | regia, medium |
  | 8 | 5.326 | 2.74% | 22.1% | 1880 | Avatar (2009) | 2009 | 34870 | 7.6 | medium |
  | 9 | 4.995 | 2.57% | 20.7% | 2088 | Ex Machina (2015) | 2015 | 14648 | 7.6 | bolla, medium |
  | 10 | 4.880 | 2.51% | 20.2% | 2088 | Arrival (2016) | 2016 | 20055 | 7.6 | bolla, medium |
  | 11 | 4.401 | 2.27% | 18.2% | 2506 | Il cavaliere oscuro - Il ritorno (2012) | 2012 | 25132 | 7.8 | regia, medium |
  | 12 | 3.766 | 1.94% | 15.6% | 2103 | Donnie Darko (2001) | 2001 | 13863 | 7.8 | medium |
  | 13 | 3.739 | 1.93% | 15.5% | 3213 | Shutter Island (2010) | 2010 | 26635 | 8.2 | medium |
  | 14 | 3.261 | 1.68% | 13.5% | 745 | Tenet (2020) | 2020 | 11658 | 7.2 | regia, medium |
  | 15 | 3.191 | 1.64% | 13.2% | 1974 | I soliti sospetti (1995) | 1995 | 11841 | 8.2 | medium |
  | 16 | 3.151 | 1.62% | 13.1% | 3138 | Se mi lasci ti cancello (2004) | 2004 | 16875 | 8.1 | medium |
  | 17 | 2.802 | 1.44% | 11.6% | 3213 | Lo sciacallo - Nightcrawler (2014) | 2014 | 12175 | 7.7 | medium |
  | 18 | 2.632 | 1.36% | 10.9% | 1078 | Seven (1995) | 1995 | 24009 | 8.4 | medium |
  | 19 | 2.173 | 1.12% | 9.0% | 3213 | Il cigno nero (2010) | 2010 | 15990 | 7.7 | medium |
  | 20 | 1.886 | 0.97% | 7.8% | 907 | Old Boy (2003) | 2003 | 10301 | 8.2 | medium |

### Perfetti sconosciuti (2016) — bolla 1089 (18 membri) · pa:ES, ge:thriller, ge:mystery, co:atresmedia cine
  grado 212 · somma pesi 20.41 · max 2.49 · top1 12.2% · top5 42.6% · top20 62.8%
  | # | peso | norma | %max | bolla | titolo | anno | voti | voto | stesso? |
  |---:|---:|---:|---:|---:|---|---:|---:|---:|---|
  | 1 | 2.495 | 12.22% | 100.0% | 367 | The Place (2017) | 2017 | 1262 | 7.1 | regia, medium |
  | 2 | 1.878 | 9.20% | 75.3% | 110 | (Nie)znajomi (2019) | 2019 | 40 | 6.4 | medium |
  | 3 | 1.629 | 7.98% | 65.3% | 1510 | Carnage (2011) | 2011 | 3229 | 7.2 | medium |
  | 4 | 1.563 | 7.65% | 62.6% | 1089 | Perfectos desconocidos (2017) | 2017 | 694 | 6.7 | bolla, medium |
  | 5 | 1.140 | 5.58% | 45.7% | 486 | Mr. Ove (2015) | 2015 | 1381 | 7.6 | medium |
  | 6 | 0.522 | 2.56% | 20.9% | 86 | Dio esiste e vive a Bruxelles (2015) | 2015 | 1791 | 6.7 | medium |
  | 7 | 0.469 | 2.30% | 18.8% | 1089 | Who Am I - No System Is Safe (2014) | 2014 | 1781 | 7.6 | bolla, medium |
  | 8 | 0.386 | 1.89% | 15.5% | 644 | Storie pazzesche (2014) | 2014 | 3898 | 7.9 | medium |
  | 9 | 0.379 | 1.86% | 15.2% | 1089 | Contrattempo (2017) | 2017 | 5174 | 8.1 | bolla, medium |
  | 10 | 0.337 | 1.65% | 13.5% | 1312 | Supereroi (2021) | 2021 | 228 | 7.2 | regia, medium |
  | 11 | 0.231 | 1.13% | 9.3% | 1089 | El cuerpo (2012) | 2012 | 1470 | 7.5 | bolla, medium |
  | 12 | 0.231 | 1.13% | 9.3% | 451 | 25 years of Innocence (2020) | 2020 | 46 | 7.8 | medium |
  | 13 | 0.228 | 1.11% | 9.1% | 3363 | Apri gli occhi (1997) | 1997 | 1262 | 7.5 | medium |
  | 14 | 0.221 | 1.08% | 8.9% | 1370 | Grandi bugie tra amici (2019) | 2019 | 740 | 6.7 | medium |
  | 15 | 0.204 | 1.00% | 8.2% | 3363 | Tesis (1996) | 1996 | 995 | 7.5 | medium |
  | 16 | 0.197 | 0.97% | 7.9% | 1173 | Apró mesék (2019) | 2019 | 17 | 6.8 | medium |
  | 17 | 0.191 | 0.94% | 7.7% | 2850 | Durak (2014) | 2014 | 334 | 7.8 | medium |
  | 18 | 0.181 | 0.89% | 7.2% | 2477 | Днюха! (2018) | 2018 | 12 | 5.2 | medium |
  | 19 | 0.177 | 0.87% | 7.1% | 170 | Tangerines - Mandarini (2013) | 2013 | 626 | 7.7 | medium |
  | 20 | 0.160 | 0.78% | 6.4% | 2940 | Loveless (2017) | 2017 | 841 | 7.3 | medium |

### Breaking Bad (2008) — bolla 3262 (4 membri) · 
  grado 697 · somma pesi 131.82 · max 83.34 · top1 63.2% · top5 79.8% · top20 91.1%
  | # | peso | norma | %max | bolla | titolo | anno | voti | voto | stesso? |
  |---:|---:|---:|---:|---:|---|---:|---:|---:|---|
  | 1 | 83.340 | 63.22% | 100.0% | 3262 | Better Call Saul (2015) | 2015 | 6976 | 8.7 | bolla, regia, medium |
  | 2 | 8.495 | 6.44% | 10.2% | 1164 | Narcos (2015) | 2015 | 3457 | 8.1 | medium |
  | 3 | 5.049 | 3.83% | 6.1% | 1451 | Power (2014) | 2014 | 1315 | 7.7 | medium |
  | 4 | 4.280 | 3.25% | 5.1% | 1164 | El Chapo (2017) | 2017 | 1682 | 7.5 | medium |
  | 5 | 4.068 | 3.09% | 4.9% | 1274 | El Camino: Il film di Breaking Bad (2019) | 2019 | 5885 | 7.1 | regia |
  | 6 | 2.561 | 1.94% | 3.1% | 1451 | A Model Family (2022) | 2022 | 72 | 6.8 | medium |
  | 7 | 1.919 | 1.46% | 2.3% | 3263 | Chernobyl (2019) | 2019 | 8394 | 8.7 | medium |
  | 8 | 1.900 | 1.44% | 2.3% | 1393 | Prison Break (2005) | 2005 | 6217 | 8.1 | medium |
  | 9 | 1.301 | 0.99% | 1.6% | 3434 | Squid Game (2021) | 2021 | 17857 | 7.9 | medium |
  | 10 | 1.155 | 0.88% | 1.4% | 270 | Le regole del delitto perfetto (2014) | 2014 | 1822 | 7.8 | medium |
  | 11 | 0.879 | 0.67% | 1.1% | 2936 | Black Mirror (2011) | 2011 | 6599 | 8.3 | medium |
  | 12 | 0.834 | 0.63% | 1.0% | 3236 | Pluribus (2025) | 2025 | 1157 | 7.9 | regia, medium |
  | 13 | 0.736 | 0.56% | 0.9% | 1139 | Il caos dopo di te (2020) | 2020 | 297 | 6.9 | medium |
  | 14 | 0.702 | 0.53% | 0.8% | 62 | 은수 좋은 날 (2025) | 2025 | 13 | 6.6 | medium |
  | 15 | 0.607 | 0.46% | 0.7% | 3174 | The Big C (2010) | 2010 | 146 | 7.3 | medium |
  | 16 | 0.603 | 0.46% | 0.7% | 80 | Confini e dipendenze (2021) | 2021 | 404 | 6.2 |  |
  | 17 | 0.426 | 0.32% | 0.5% | 3183 | Lost (2004) | 2004 | 5408 | 8.0 | medium |
  | 18 | 0.412 | 0.31% | 0.5% | 1763 | 1992 (2015) | 2015 | 79 | 7.1 | medium |
  | 19 | 0.398 | 0.30% | 0.5% | 2015 | Stranger Things (2016) | 2016 | 21999 | 8.5 | medium |
  | 20 | 0.385 | 0.29% | 0.5% | 1763 | 1993 (2017) | 2017 | 55 | 7.0 | medium |

---

## 3. Una bolla intera: la 1395 (22 membri)

Membri: Un ponte per Terabithia · Ember - Il mistero della città di luce · Racconti incantati · I fratelli Grimm e l'incantevole strega · La bussola d'oro · Stardust · Tata Matilda e il grande botto · Zathura - Un'avventura spaziale · Nanny McPhee - Tata Matilda · Spiderwick - Le cronache · Inkheart - La leggenda di cuore d'inchiostro · Nel paese delle creature selvagge · Holes - Buchi nel deserto · Flora & Ulisse · Mr. Magorium e la bottega delle meraviglie · Alla ricerca dell'isola di Nim · Water Horse - La leggenda degli abissi · Eragon · Mimzy - Il segreto dell'universo · Guardians of Time · Mio min Mio · I'm Here

Coppie interne più pesanti (tutte nel CSV):

| # | A | B | peso | % del max di A | stessa coll. | stesso regista | anno |
|---:|---|---|---:|---:|---|---|---:|
| 1 | Tata Matilda e il grande botto | Nanny McPhee - Tata Matilda | 59.159 | 100.0% | sì |  | 2010/2005 |
| 2 | Spiderwick - Le cronache | Inkheart - La leggenda di cuore d'inchiostro | 12.320 | 100.0% |  |  | 2008/2008 |
| 3 | La bussola d'oro | Stardust | 10.013 | 100.0% |  |  | 2007/2007 |
| 4 | Ember - Il mistero della città di luce | La bussola d'oro | 9.086 | 100.0% |  |  | 2008/2007 |
| 5 | Un ponte per Terabithia | Spiderwick - Le cronache | 9.055 | 100.0% |  |  | 2007/2008 |
| 6 | La bussola d'oro | Spiderwick - Le cronache | 8.907 | 89.0% |  |  | 2007/2008 |
| 7 | Racconti incantati | Spiderwick - Le cronache | 8.834 | 100.0% |  |  | 2008/2008 |
| 8 | Un ponte per Terabithia | Inkheart - La leggenda di cuore d'inchiostro | 8.336 | 92.1% |  |  | 2007/2008 |
| 9 | La bussola d'oro | Inkheart - La leggenda di cuore d'inchiostro | 8.317 | 83.1% |  |  | 2007/2008 |
| 10 | Stardust | Inkheart - La leggenda di cuore d'inchiostro | 7.473 | 47.2% |  |  | 2007/2008 |
| 11 | Nanny McPhee - Tata Matilda | Inkheart - La leggenda di cuore d'inchiostro | 6.672 | 11.3% |  |  | 2005/2008 |
| 12 | Spiderwick - Le cronache | Water Horse - La leggenda degli abissi | 6.553 | 53.2% |  |  | 2008/2007 |
| 13 | Spiderwick - Le cronache | Mr. Magorium e la bottega delle meraviglie | 6.443 | 52.3% |  |  | 2008/2007 |
| 14 | Un ponte per Terabithia | Water Horse - La leggenda degli abissi | 6.007 | 66.3% |  |  | 2007/2007 |
| 15 | Un ponte per Terabithia | La bussola d'oro | 5.787 | 63.9% |  |  | 2007/2007 |
| 16 | Inkheart - La leggenda di cuore d'inchiostro | Eragon | 5.470 | 44.4% |  |  | 2008/2006 |
| 17 | Zathura - Un'avventura spaziale | Spiderwick - Le cronache | 5.358 | 100.0% |  |  | 2005/2008 |
| 18 | Nanny McPhee - Tata Matilda | Spiderwick - Le cronache | 5.353 | 9.0% |  |  | 2005/2008 |
| 19 | Inkheart - La leggenda di cuore d'inchiostro | Water Horse - La leggenda degli abissi | 5.319 | 43.2% |  |  | 2008/2007 |
| 20 | Alla ricerca dell'isola di Nim | Water Horse - La leggenda degli abissi | 5.276 | 76.9% |  |  | 2008/2007 |
| 21 | Spiderwick - Le cronache | Nel paese delle creature selvagge | 5.241 | 42.5% |  |  | 2008/2009 |
| 22 | Zathura - Un'avventura spaziale | Mimzy - Il segreto dell'universo | 5.201 | 97.1% |  |  | 2005/2007 |
| 23 | La bussola d'oro | Eragon | 5.174 | 51.7% |  |  | 2007/2006 |
| 24 | Inkheart - La leggenda di cuore d'inchiostro | Mr. Magorium e la bottega delle meraviglie | 5.019 | 40.7% |  |  | 2008/2007 |
| 25 | Nanny McPhee - Tata Matilda | Mr. Magorium e la bottega delle meraviglie | 4.562 | 7.7% |  |  | 2005/2007 |

E il ponte strano: Inkheart → bolla **674** (comedy/TV tedesca), **17 archi in tutta la riga**
(11 nei primi 100), pesi 0,13-0,19
contro un massimo di 12,32. Sono l'1,0-1,5% del massimo, ma occupano i ranghi 41-58. Il CSV
li ha tutti nella sezione `inkheart_674`.

---

## 4. Le righe: quanto è concentrata una riga?

| nodo | grado | somma | max | 5° | 10° | 20° | 30° | top1 | top5 | top20 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Spider-Man (2002) | 390 | 697.4 | 259.89 | 16.78 | 4.50 | 2.53 | 1.93 | 37.3% | 79.9% | 90.3% |
| Inkheart (2008) | 444 | 123.7 | 12.32 | 7.47 | 5.02 | 1.62 | 0.52 | 10.0% | 37.2% | 82.9% |
| Un ponte per Terabithia (2007) | 426 | 89.1 | 9.05 | 4.49 | 2.93 | 1.10 | 0.36 | 10.2% | 37.8% | 81.9% |
| Inception (2010) | 509 | 194.2 | 24.14 | 11.20 | 4.88 | 1.89 | 0.86 | 12.4% | 47.4% | 80.2% |
| Perfetti sconosciuti (2016) | 212 | 20.4 | 2.49 | 1.14 | 0.34 | 0.16 | 0.11 | 12.2% | 42.6% | 62.8% |
| Breaking Bad (2008) | 697 | 131.8 | 83.34 | 4.07 | 1.16 | 0.39 | 0.24 | 63.2% | 79.8% | 91.1% |
| *campione (400 nodi)* | *179* | *37.5* | *2.21* | *1.11* | *0.81* | *0.47* | *0.33* | *7.1%* | *24.7%* | *58.5%* |

**Come si legge**: per un nodo tipico il top-20 prende il **58,5%** del peso di riga (p10
39,2%, p90 82,9%); il top-30 il **71,9%**. Per i seed-hub (Spider-Man, Breaking Bad) il top-1
da solo prende il 37-63%. Una matrice N×20 **butta via il 41% del peso** di una riga tipica: è
una scelta di sparsità, non una fotografia completa. Il 20° peso è ancora il **20,9%** del
massimo (mediana), il 30° il **14,2%**.

---

## 5. Come creare i pesi: cosa c'è sul tavolo

Il peso attuale è una **somma di 10 componenti** (CF, CFst, B, KW, TV, CAST, DIR, COLL×3,
LIST, TRAMA), già mescolata. Le opzioni che vedo, da scegliere e combinare:

| leva | cosa fa | rischio |
|---|---|---|
| **peso grezzo** | tiene la forza assoluta (Spider-Man 260, Perfetti 2,5) | righe non comparabili; gli hub dominano |
| **riga-normalizzato** | ogni riga somma 1; confrontabile | perde la forza assoluta; una riga piatta vale una riga concentrata |
| **log / sqrt** | comprime la testa (260→5,6) | perde il segnale del "molto più vicino" |
| **rank** | robusto alla scala | butta il gap 1°-2° (Spider-Man 260 vs 16) |
| **PPMI / lift** | toglie la popolarità: quanto è più probabile del caso | serve il **supporto** (co-spettatori), che il triangolo non ha |
| **supporto / confidenza** | giù gli archi con pochi voti/co-spettatori | serve il dato grezzo (CF upstream), non il triangolo |
| **stessa bolla** | bonus agli archi interni (52,8% del peso) | circolare: la bolla è già un risultato del grafo |
| **metadati** (coll, regia, medium, anno) | bonus a saga/regista/stesso medium | sono già componenti del teacher: doppio conteggio |
| **trama** (coseno) | 54% di copertura, il segnale semantico più ricco | è già il componente TRAMA: doppio conteggio |
| **appreso** | un piccolo modello impara il peso dalle feature | diventa lo studente, non il teacher |

**La domanda**: per la matrice N×20, quale combinazione? E per il **cold start**? Un titolo
nuovo non ha archi: il target può essere la **bolla** (centroide) o i vicini V3 del collocatore,
non la riga mancante. Va costruito un target che esista anche senza comportamento.

---

## 6. Cosa ti chiedo su questa fotografia

1. **Il peso**: grezzo, normalizzato, log, rank, PPMI/lift, supporto? E con quale pavimento?
2. **La simmetria**: la matrice deve essere simmetrica (top-20 per riga + trasposta) o diretta?
   Il grafo è simmetrico, ma la potatura top-16 è simmetrizzata e fa rientrare gli archi inversi.
3. **Il supporto**: il triangolo non porta il numero di co-spettatori. Vale la pena recuperarlo
   dall'upstream CF per calcolare un lift, o il peso attuale è già abbastanza?
4. **Le feature condivise**: se il peso viene da keyword/cast/regia/trama, e lo studente usa le
   stesse feature, come evito che il teacher e lo studente siano la stessa funzione?
5. **Il cold start**: per un titolo senza archi, qual è il target? La bolla? I vicini V3? Un
   centroide? E come si misura?
6. **Top-20 vs top-30**: il top-20 copre il 58,5% del peso, il top-30 il 71,9%; il 20° peso è al
   20,9% del massimo, il 30° al 14,2%. Cosa sceglieresti per il target, e con quale pavimento?

---

## 7. Il deliverable (vale per l'handoff)

Al termine delle spiegazioni, **scrivi una bozza di script** che addestra la rete partendo da
questa matrice: caricamento della N×20 (CSV/Parquet), costruzione del target, modello, training
loop, validation, salvataggio dell'embedding. Scegli tu gli **iperparametri** (dimensione,
learning rate, batch, epoche, loss, dropout, weight decay, floor, negative sampling) e
**motiva ogni scelta** con un numero o un'ipotesi. Lo script deve girare su questa macchina
(CPU, 8 GB) o su Colab; se serve una GPU, dillo e adatta il piano.

Il codice deve essere **una bozza**, non un saggio: poche centinaia di righe, commentate,
con un `if __name__ == "__main__"` e un blocco di costanti in testa. Meglio un baseline
semplice che gira e un'ablazione chiara, che un transformer che non si può addestrare.

