# Co-visione con diluizione per cronologia utente

k è il numero di item distinti grezzi della cronologia, prima del mapping al canone. Per ogni utente: w=1 per alpha=0; w=1/sqrt(k-1) per alpha=0.5; w=1/(k-1) per alpha=1 (k<=1 resta w=1; k=0 pesa 0).
NPMI usa conteggi e marginali pesati in modo coerente; i pesi sono riscalati a media 1 per fonte (U_eff resta il numero di utenti attivi). Cw è supporto effettivo, non necessariamente intero. Nessuna matrice item×item completa e nessuna fusione tra fonti.
Limite noto: Trakt è stato scaricato con PAGES=3 per medium, quindi al massimo 300 film + 300 serie; per i profili al tetto, k osservato sottostima la cronologia reale.

## MovieLens (timestamp rating)
α=0: U_eff=200948.0 (k mediana/p90/max 73/364/33332; w med/p90/max 1/1/1); α=0.5: U_eff=200948.0 (k mediana/p90/max 73/364/33332; w med/p90/max 0.954/1.65/1.86); α=1: U_eff=200948.0 (k mediana/p90/max 73/364/33332; w med/p90/max 0.756/2.27/2.87)

### Barbie — movie:346698
- α=0, NPMI×log(1+Cw): Oppenheimer [Cw=471] · Glass Onion - Knives Out [Cw=495] · Spider-Man: Across the Spider-Verse [Cw=378] · Guardiani della Galassia Vol. 3 [Cw=332] · Everything Everywhere All at Once [Cw=616] · The Menu [Cw=403]
- α=0.5, NPMI×log(1+Cw): Oppenheimer [Cw=208.035] · Spider-Man: Across the Spider-Verse [Cw=175.802] · Glass Onion - Knives Out [Cw=184.975] · Guardiani della Galassia Vol. 3 [Cw=126.371] · The Menu [Cw=146.717] · Everything Everywhere All at Once [Cw=228.089]
- α=1, NPMI×log(1+Cw): Oppenheimer [Cw=109.982] · Spider-Man: Across the Spider-Verse [Cw=103.361] · Glass Onion - Knives Out [Cw=81.617] · Guardiani della Galassia Vol. 3 [Cw=59.948] · Il gatto con gli stivali 2 - L'ultimo desiderio [Cw=77.8649] · The Menu [Cw=62.4233]
- overlap top-10 α0/α1: 7/13 Jaccard=0.54

### Oppenheimer — movie:872585
- α=0, NPMI×log(1+Cw): Barbie [Cw=471] · Spider-Man: Across the Spider-Verse [Cw=440] · Glass Onion - Knives Out [Cw=488] · Everything Everywhere All at Once [Cw=640] · Mission: Impossible - Dead Reckoning Parte uno [Cw=240] · Guardiani della Galassia Vol. 3 [Cw=335]
- α=0.5, NPMI×log(1+Cw): Barbie [Cw=208.035] · Spider-Man: Across the Spider-Verse [Cw=236.011] · Mission: Impossible - Dead Reckoning Parte uno [Cw=114] · Glass Onion - Knives Out [Cw=190.422] · Guardiani della Galassia Vol. 3 [Cw=140.415] · Everything Everywhere All at Once [Cw=253.335]
- α=1, NPMI×log(1+Cw): Spider-Man: Across the Spider-Verse [Cw=155.378] · Barbie [Cw=109.982] · Mission: Impossible - Dead Reckoning Parte uno [Cw=70.7481] · Guardiani della Galassia Vol. 3 [Cw=71.623] · Il gatto con gli stivali 2 - L'ultimo desiderio [Cw=93.3517] · Glass Onion - Knives Out [Cw=83.4016]
- overlap top-10 α0/α1: 7/13 Jaccard=0.54

### Parasite — movie:496243
- α=0, NPMI×log(1+Cw): Joker [Cw=7350] · Cena con delitto - Knives Out [Cw=6822] · C'era una volta a… Hollywood [Cw=4943] · Jojo Rabbit [Cw=4477] · 1917 [Cw=4734] · Scappa - Get Out [Cw=5795]
- α=0.5, NPMI×log(1+Cw): Joker [Cw=4230.79] · Cena con delitto - Knives Out [Cw=3837.5] · Jojo Rabbit [Cw=2389.72] · C'era una volta a… Hollywood [Cw=2461.19] · 1917 [Cw=2543.09] · Midsommar - Il villaggio dei dannati [Cw=1744.72]
- α=1, NPMI×log(1+Cw): Joker [Cw=2713.91] · Cena con delitto - Knives Out [Cw=2410.96] · Jojo Rabbit [Cw=1446.15] · 1917 [Cw=1535.39] · C'era una volta a… Hollywood [Cw=1356.31] · Midsommar - Il villaggio dei dannati [Cw=1016.18]
- overlap top-10 α0/α1: 10/10 Jaccard=1.00

### Titanic — movie:597
- α=0, NPMI×log(1+Cw): Men in Black [Cw=27229] · Tutti pazzi per Mary [Cw=18582] · The Truman Show [Cw=23685] · Star Wars: Episodio I - La minaccia fantasma [Cw=21386] · Edward mani di forbice [Cw=17273] · The Sixth Sense - Il sesto senso [Cw=27471]
- α=0.5, NPMI×log(1+Cw): Men in Black [Cw=13691.5] · Tutti pazzi per Mary [Cw=8888.23] · Star Wars: Episodio I - La minaccia fantasma [Cw=10338.5] · The Truman Show [Cw=11407.7] · The Sixth Sense - Il sesto senso [Cw=14293.1] · Edward mani di forbice [Cw=7687.67]
- α=1, NPMI×log(1+Cw): Men in Black [Cw=7077.73] · Tutti pazzi per Mary [Cw=4427.94] · Star Wars: Episodio I - La minaccia fantasma [Cw=5256.82] · The Sixth Sense - Il sesto senso [Cw=7773.05] · The Truman Show [Cw=5655.04] · Qualcosa è cambiato [Cw=3987.8]
- overlap top-10 α0/α1: 7/13 Jaccard=0.54

### Coda Trakt (C_i=3) — movie:45722
- α=0, NPMI×log(1+Cw): Q [Cw=5] · The Principles of Lust [Cw=3] · Anoche soñé contigo [Cw=3] · Два в одном [Cw=3] · The Horribly Slow Murderer with the Extremely Inefficient Weapon [Cw=5] · Sta' fermo, muori e resuscita [Cw=3]
- α=0.5, NPMI×log(1+Cw): Q [Cw=2.88461] · 9 Songs [Cw=3.84751] · Il sesso secondo lei [Cw=2.83335] · Antares [Cw=2.06226] · Lucía y el sexo [Cw=4.21161] · Daisy Diamond [Cw=1.7657]
- α=1, NPMI×log(1+Cw): Antares [Cw=2.64687] · Daisy Diamond [Cw=2.59234] · Q [Cw=2.97444] · Il sesso secondo lei [Cw=2.93165] · 9 Songs [Cw=3.3627] · Love [Cw=2.81868]
- overlap top-10 α0/α1: 2/18 Jaccard=0.11

## Trakt (last_watched_at)
α=0: U_eff=1855.0 (k mediana/p90/max 487/600/600; w med/p90/max 1/1/1); α=0.5: U_eff=1855.0 (k mediana/p90/max 487/600/600; w med/p90/max 0.62/1.36/13.7); α=1: U_eff=1855.0 (k mediana/p90/max 487/600/600; w med/p90/max 0.112/0.535/54.2)

### Barbie — movie:346698
- α=0, NPMI×log(1+Cw): Everything Everywhere All at Once [Cw=167] · Super Mario Bros. Il Film [Cw=191] · Oppenheimer [Cw=207] · Glass Onion - Knives Out [Cw=154] · Elemental [Cw=118] · Spider-Man: Across the Spider-Verse [Cw=155]
- α=0.5, NPMI×log(1+Cw): Oppenheimer [Cw=130.192] · Super Mario Bros. Il Film [Cw=119.835] · Everything Everywhere All at Once [Cw=102.265] · Glass Onion - Knives Out [Cw=93.1526] · Spider-Man: Across the Spider-Verse [Cw=97.9335] · Guardiani della Galassia Vol. 3 [Cw=109.019]
- α=1, NPMI×log(1+Cw): Oppenheimer [Cw=24.9997] · Super Mario Bros. Il Film [Cw=22.9395] · Spider-Man: Across the Spider-Verse [Cw=18.9459] · Stranger Things [Cw=33.5821] · WandaVision [Cw=21.4182] · Guardiani della Galassia Vol. 3 [Cw=20.448]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### Oppenheimer — movie:872585
- α=0, NPMI×log(1+Cw): Killers of the Flower Moon [Cw=129] · John Wick 4 [Cw=190] · Barbie [Cw=207] · Avatar: La via dell'acqua [Cw=196] · The Menu [Cw=163] · Guardiani della Galassia Vol. 3 [Cw=200]
- α=0.5, NPMI×log(1+Cw): Killers of the Flower Moon [Cw=79.4334] · Barbie [Cw=130.192] · Dune [Cw=152.853] · John Wick 4 [Cw=118.933] · Avatar: La via dell'acqua [Cw=122.18] · Guardiani della Galassia Vol. 3 [Cw=124.296]
- α=1, NPMI×log(1+Cw): The Last of Us [Cw=35.6423] · Dune [Cw=29.6157] · Il Trono di Spade [Cw=39.3137] · Barbie [Cw=24.9997] · Chernobyl [Cw=28.7034] · House of the Dragon [Cw=30.9076]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### Breaking Bad — tv:1396
- α=0, NPMI×log(1+Cw): Il Trono di Spade [Cw=523] · Better Call Saul [Cw=360] · Dexter [Cw=294] · Chernobyl [Cw=359] · House of Cards [Cw=224] · Sherlock [Cw=301]
- α=0.5, NPMI×log(1+Cw): Il Trono di Spade [Cw=359.36] · Better Call Saul [Cw=243.678] · Chernobyl [Cw=239.182] · Dexter [Cw=201.579] · Black Mirror [Cw=284.06] · The Office (US) [Cw=205.622]
- α=1, NPMI×log(1+Cw): Il Trono di Spade [Cw=82.4983] · Better Call Saul [Cw=52.6751] · Chernobyl [Cw=49.9681] · Stranger Things [Cw=68.8789] · Black Mirror [Cw=58.6272] · The Walking Dead [Cw=54.8862]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### Narcos — tv:63351
- α=0, NPMI×log(1+Cw): Narcos: Messico [Cw=100] · House of Cards [Cw=151] · Mr. Robot [Cw=198] · La casa di carta [Cw=153] · Better Call Saul [Cw=194] · MINDHUNTER [Cw=139]
- α=0.5, NPMI×log(1+Cw): Narcos: Messico [Cw=62.1544] · House of Cards [Cw=92.9881] · Mr. Robot [Cw=126.457] · Better Call Saul [Cw=124.166] · La casa di carta [Cw=96.9948] · MINDHUNTER [Cw=89.9636]
- α=1, NPMI×log(1+Cw): Il Trono di Spade [Cw=34.4614] · Better Call Saul [Cw=24.4657] · Chernobyl [Cw=25.3799] · MINDHUNTER [Cw=18.2714] · True Detective [Cw=22.7229] · Dark [Cw=20.9136]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### Game of Thrones — tv:1399
- α=0, NPMI×log(1+Cw): Breaking Bad [Cw=523] · Chernobyl [Cw=460] · Westworld - Dove tutto è concesso [Cw=457] · The Walking Dead [Cw=466] · Sherlock [Cw=361] · Vikings [Cw=341]
- α=0.5, NPMI×log(1+Cw): Chernobyl [Cw=301.735] · Breaking Bad [Cw=359.36] · Westworld - Dove tutto è concesso [Cw=296.362] · Stranger Things [Cw=419.962] · The Walking Dead [Cw=302.488] · Vikings [Cw=221.128]
- α=1, NPMI×log(1+Cw): Stranger Things [Cw=90.3497] · Chernobyl [Cw=61.5543] · Westworld - Dove tutto è concesso [Cw=61.4278] · House of the Dragon [Cw=61.8464] · Breaking Bad [Cw=82.4983] · Black Mirror [Cw=64.9439]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### L’attacco dei giganti — tv:1429
- α=0, NPMI×log(1+Cw): Demon Slayer: Kimetsu no Yaiba [Cw=170] · One-Punch Man [Cw=172] · Death Note [Cw=156] · Jujutsu Kaisen [Cw=160] · My Hero Academia [Cw=134] · Solo Leveling [Cw=132]
- α=0.5, NPMI×log(1+Cw): One-Punch Man [Cw=106.938] · Demon Slayer: Kimetsu no Yaiba [Cw=103.212] · Death Note [Cw=100.33] · Jujutsu Kaisen [Cw=101.275] · My Hero Academia [Cw=83.3417] · Solo Leveling [Cw=81.808]
- α=1, NPMI×log(1+Cw): Death Note [Cw=19.89] · One-Punch Man [Cw=19.8441] · Demon Slayer: Kimetsu no Yaiba [Cw=18.5589] · Jujutsu Kaisen [Cw=19.8974] · Rick and Morty [Cw=29.479] · Squid Game [Cw=28.6752]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### Parasite — movie:496243
- α=0, NPMI×log(1+Cw): Joker [Cw=181] · Cena con delitto - Knives Out [Cw=151] · C'era una volta a… Hollywood [Cw=102] · Storia di un matrimonio [Cw=54] · Dune [Cw=176] · Midsommar - Il villaggio dei dannati [Cw=81]
- α=0.5, NPMI×log(1+Cw): Joker [Cw=119.347] · Cena con delitto - Knives Out [Cw=95.8894] · C'era una volta a… Hollywood [Cw=64.8089] · Dune [Cw=115.467] · Tenet [Cw=75.9521] · Storia di un matrimonio [Cw=34.0635]
- α=1, NPMI×log(1+Cw): Dune [Cw=23.342] · Cena con delitto - Knives Out [Cw=18.0094] · Black Mirror [Cw=26.6529] · Joker [Cw=23.6729] · Il Trono di Spade [Cw=27.5632] · Stranger Things [Cw=27.6538]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### Titanic — movie:597
- α=0, NPMI×log(1+Cw): Forrest Gump [Cw=64] · Il re leone [Cw=58] · Harry Potter e il calice di fuoco [Cw=69] · La maledizione della prima luna [Cw=58] · Harry Potter e il principe mezzosangue [Cw=64] · Mamma, ho perso l'aereo [Cw=78]
- α=0.5, NPMI×log(1+Cw): Harry Potter e il calice di fuoco [Cw=46.1451] · Harry Potter e la camera dei segreti [Cw=49.2865] · Il re leone [Cw=38.2539] · Mamma, ho perso l'aereo [Cw=50.8249] · La maledizione della prima luna [Cw=38.1172] · Forrest Gump [Cw=42.4326]
- α=1, NPMI×log(1+Cw): Harry Potter e la camera dei segreti [Cw=10.0404] · Mamma, ho perso l'aereo [Cw=9.90539] · Harry Potter e il calice di fuoco [Cw=9.18335] · Avatar [Cw=10.3966] · Il Trono di Spade [Cw=15.8283] · Toy Story - Il mondo dei giocattoli [Cw=8.54687]
- overlap top-10 α0/α1: 6/14 Jaccard=0.43

### Coda Trakt (C_i=3) — movie:45722
- α=0, NPMI×log(1+Cw): Malizia [Cw=2] · American College [Cw=2] · Il sesso secondo lei [Cw=2] · Milf [Cw=2] · In the Name of the King [Cw=2] · Miranda [Cw=2]
- α=0.5, NPMI×log(1+Cw): Malizia [Cw=1.44978] · American College [Cw=1.44167] · In the Name of the King [Cw=1.44167] · Milf [Cw=1.51271] · Il sesso secondo lei [Cw=1.44167] · Miranda [Cw=1.44978]
- α=1, NPMI×log(1+Cw): Malizia [Cw=0.30586] · American College [Cw=0.302299] · In the Name of the King [Cw=0.302299] · Milf [Cw=0.332201] · Lolita [Cw=0.302299] · Il sesso secondo lei [Cw=0.302299]
- overlap top-10 α0/α1: 10/10 Jaccard=1.00

### Coda Trakt (C_i=3) — tv:2261
- α=0, NPMI×log(1+Cw): Degrassi Junior High [Cw=2] · Degrassi High [Cw=2] · Dallas [Cw=2] · Il braccio violento della legge [Cw=2] · The Ridiculous 6 [Cw=2] · gli Octonauti [Cw=2]
- α=0.5, NPMI×log(1+Cw): Degrassi Junior High [Cw=1.3422] · Degrassi High [Cw=1.3422] · Dallas [Cw=1.3422] · The Ridiculous 6 [Cw=1.3422] · Ma guarda un po' 'sti americani! [Cw=1.3422] · The Andy Griffith Show [Cw=1.34501]
- α=1, NPMI×log(1+Cw): Degrassi Junior High [Cw=0.268901] · Degrassi High [Cw=0.268901] · Dallas [Cw=0.268901] · The Ridiculous 6 [Cw=0.268901] · Ma guarda un po' 'sti americani! [Cw=0.268901] · King of the Hill [Cw=0.360344]
- overlap top-10 α0/α1: 6/14 Jaccard=0.43

## AniList (membership; status absent)
α=0: U_eff=2608.0 (k mediana/p90/max 319/1237/5484; w med/p90/max 1/1/1); α=0.5: U_eff=2608.0 (k mediana/p90/max 319/1237/5484; w med/p90/max 0.484/2.04/8.64); α=1: U_eff=2608.0 (k mediana/p90/max 319/1237/5484; w med/p90/max 0.0701/1.24/22.3)

### L’attacco dei giganti — tv:1429
- α=0, NPMI×log(1+Cw): Death Note [Cw=1344] · Fullmetal Alchemist: Brotherhood [Cw=1267] · Sword Art Online [Cw=1350] · Tokyo Ghoul [Cw=1207] · Steins;Gate [Cw=1240] · One-Punch Man [Cw=1220]
- α=0.5, NPMI×log(1+Cw): Death Note [Cw=584.01] · Fullmetal Alchemist: Brotherhood [Cw=545.477] · Sword Art Online [Cw=563.924] · Steins;Gate [Cw=500.985] · Tokyo Ghoul [Cw=499.378] · Code Geass: Lelouch of the Rebellion [Cw=483.524]
- α=1, NPMI×log(1+Cw): Fullmetal Alchemist: Brotherhood [Cw=102.887] · Death Note [Cw=108.722] · Sword Art Online [Cw=94.6698] · Steins;Gate [Cw=81.9857] · Vinland Saga [Cw=68.5508] · Erased [Cw=58.3913]
- overlap top-10 α0/α1: 4/16 Jaccard=0.25

## Serializd (watched list)
α=0: U_eff=416.0 (k mediana/p90/max 63/144/144; w med/p90/max 1/1/1); α=0.5: U_eff=416.0 (k mediana/p90/max 63/144/144; w med/p90/max 0.697/1.66/5.49); α=1: U_eff=416.0 (k mediana/p90/max 63/144/144; w med/p90/max 0.253/1.43/15.7)

### Breaking Bad — tv:1396
- α=0, NPMI×log(1+Cw): Better Call Saul [Cw=65] · I Soprano [Cw=45] · Mr. Robot [Cw=40] · Dexter [Cw=56] · True Detective [Cw=41] · Il Trono di Spade [Cw=67]
- α=0.5, NPMI×log(1+Cw): Better Call Saul [Cw=50.0808] · I Soprano [Cw=33.8482] · Mr. Robot [Cw=30.2367] · Dexter [Cw=45.7358] · Prison Break [Cw=35.7145] · Succession [Cw=32.5994]
- α=1, NPMI×log(1+Cw): Better Call Saul [Cw=23.0872] · I Soprano [Cw=14.8376] · Mr. Robot [Cw=13.9454] · Succession [Cw=15.5217] · Prison Break [Cw=17.1798] · Dexter [Cw=22.1582]
- overlap top-10 α0/α1: 8/12 Jaccard=0.67

### Narcos — tv:63351
- α=0, NPMI×log(1+Cw): Vikings [Cw=7] · Band of Brothers - Fratelli al fronte [Cw=7] · Fallout [Cw=11] · Marvel's The Punisher [Cw=9] · Narcos: Messico [Cw=3] · Peaky Blinders [Cw=9]
- α=0.5, NPMI×log(1+Cw): Fallout [Cw=6.3065] · Band of Brothers - Fratelli al fronte [Cw=3.9306] · Vikings [Cw=3.86127] · Peaky Blinders [Cw=5.00683] · Narcos: Messico [Cw=1.83777] · Marvel's The Punisher [Cw=4.62773]
- α=1, NPMI×log(1+Cw): Fallout [Cw=1.9802] · Band of Brothers - Fratelli al fronte [Cw=1.20213] · The Boys [Cw=2.19081] · The Walking Dead [Cw=2.26269] · Vikings [Cw=1.15863] · Peaky Blinders [Cw=1.51333]
- overlap top-10 α0/α1: 5/15 Jaccard=0.33

### Game of Thrones — tv:1399
- α=0, NPMI×log(1+Cw): House of the Dragon [Cw=62] · A Knight of the Seven Kingdoms [Cw=44] · Breaking Bad [Cw=67] · Mr. Robot [Cw=35] · True Detective [Cw=38] · I Soprano [Cw=37]
- α=0.5, NPMI×log(1+Cw): House of the Dragon [Cw=44.0875] · A Knight of the Seven Kingdoms [Cw=30.6086] · I Soprano [Cw=28.7793] · True Detective [Cw=26.0211] · The Boys [Cw=43.0423] · Breaking Bad [Cw=46.3078]
- α=1, NPMI×log(1+Cw): House of the Dragon [Cw=19.1084] · I Soprano [Cw=13.2749] · A Knight of the Seven Kingdoms [Cw=12.8065] · True Detective [Cw=10.3438] · The Boys [Cw=15.8267] · Breaking Bad [Cw=18.603]
- overlap top-10 α0/α1: 8/12 Jaccard=0.67

### L’attacco dei giganti — tv:1429
- α=0, NPMI×log(1+Cw): Demon Slayer: Kimetsu no Yaiba [Cw=36] · Vinland Saga [Cw=34] · Naruto [Cw=28] · Death Note [Cw=48] · Jujutsu Kaisen [Cw=36] · Mr. Robot [Cw=31]
- α=0.5, NPMI×log(1+Cw): Demon Slayer: Kimetsu no Yaiba [Cw=22.8174] · Naruto [Cw=18.2994] · Vinland Saga [Cw=23.1422] · Death Note [Cw=32.7645] · Mr. Robot [Cw=22.3455] · Jujutsu Kaisen [Cw=23.1689]
- α=1, NPMI×log(1+Cw): Mr. Robot [Cw=9.52504] · Breaking Bad [Cw=15.7836] · Demon Slayer: Kimetsu no Yaiba [Cw=8.2618] · Naruto [Cw=6.66413] · Vinland Saga [Cw=8.65552] · Death Note [Cw=13.0025]
- overlap top-10 α0/α1: 8/12 Jaccard=0.67

## Coppie sentinella pesate

### Barbie / Oppenheimer
- MovieLens (timestamp rating): α=0: Cw=471, NPMI=0.738, score=4.546 | α=0.5: Cw=208.035, NPMI=0.733, score=3.915 | α=1: Cw=109.982, NPMI=0.717, score=3.378
- Trakt (last_watched_at): α=0: Cw=207, NPMI=0.295, score=1.574 | α=0.5: Cw=130.192, NPMI=0.395, score=1.926 | α=1: Cw=24.9997, NPMI=0.599, score=1.952

### Barbie / Super Mario
- MovieLens (timestamp rating): α=0: Cw=198, NPMI=0.631, score=3.339 | α=0.5: Cw=71.0452, NPMI=0.630, score=2.695 | α=1: Cw=31.5123, NPMI=0.623, score=2.169
- Trakt (last_watched_at): α=0: Cw=191, NPMI=0.308, score=1.618 | α=0.5: Cw=119.835, NPMI=0.400, score=1.918 | α=1: Cw=22.9395, NPMI=0.590, score=1.873

### Breaking Bad / Narcos
- Trakt (last_watched_at): α=0: Cw=230, NPMI=0.298, score=1.620 | α=0.5: Cw=149.733, NPMI=0.367, score=1.841 | α=1: Cw=29.9474, NPMI=0.468, score=1.608
- Serializd (watched list): α=0: Cw=12, NPMI=0.232, score=0.595 | α=0.5: Cw=7.35463, NPMI=0.267, score=0.566 | α=1: Cw=2.43205, NPMI=0.351, score=0.433

### Breaking Bad / Game of Thrones
- Trakt (last_watched_at): α=0: Cw=523, NPMI=0.340, score=2.131 | α=0.5: Cw=359.36, NPMI=0.438, score=2.579 | α=1: Cw=82.4983, NPMI=0.549, score=2.431
- Serializd (watched list): α=0: Cw=67, NPMI=0.327, score=1.378 | α=0.5: Cw=46.3078, NPMI=0.360, score=1.388 | α=1: Cw=18.603, NPMI=0.449, score=1.336

### Parasite / Joker
- MovieLens (timestamp rating): α=0: Cw=7350, NPMI=0.721, score=6.423 | α=0.5: Cw=4230.79, NPMI=0.699, score=5.840 | α=1: Cw=2713.91, NPMI=0.676, score=5.348
- Trakt (last_watched_at): α=0: Cw=181, NPMI=0.443, score=2.306 | α=0.5: Cw=119.347, NPMI=0.492, score=2.358 | α=1: Cw=23.6729, NPMI=0.504, score=1.614

