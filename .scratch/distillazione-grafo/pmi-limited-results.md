# Test mirato PMI co-visione

Solo vicini seed→catalogo via prodotto sparso `X_seed.T @ X`; nessuna matrice item×item completa.
C_late è contato esattamente per i candidati emersi dai primi due ranking: entrambi gli eventi devono cadere oltre `max(release_i, release_j)+L`.
MovieLens usa il timestamp del rating come proxy; Trakt usa `last_watched_at`. AniList è solo membership: la cache non conserva lo status (completed/current/planning/etc.), quindi non è prova di visione. Serializd è una watchlist osservata ma senza timestamp affidabile.
NPMI usa `log(Cij*U/(Ci*Cj)) / -log(Cij/U)`, solo valori positivi; non c’è soglia minima di supporto. `logC` usa `log(1+Cij)`. Nessun peso tra fonti è applicato.

## Barbie — movie:346698

### MovieLens (timestamp rating)
- NPMI (sorpresa): Oppenheimer [C=471] · Asteroid City [C=199] · Spider-Man: Across the Spider-Verse [C=378] · Guardiani della Galassia Vol. 3 [C=332] · Glass Onion - Knives Out [C=495] · Dungeons & Dragons - L'onore dei ladri [C=252] · The Fabelmans [C=191] · The Menu [C=403]
- NPMI × log(1+C totale): Oppenheimer [C=471] · Glass Onion - Knives Out [C=495] · Spider-Man: Across the Spider-Verse [C=378] · Guardiani della Galassia Vol. 3 [C=332] · Everything Everywhere All at Once [C=616] · The Menu [C=403] · Asteroid City [C=199] · Avatar: La via dell'acqua [C=296]
- NPMI × log(1+C_late 180g), rerank pool: (nessuna coppia con finestra osservabile)
- NPMI × log(1+C_tot) × C_late/C_tot 180g: (nessuna coppia con finestra osservabile)
- NPMI × log(1+C_late 365g), rerank pool: (nessuna coppia con finestra osservabile)
- NPMI × log(1+C_tot) × C_late/C_tot 365g: (nessuna coppia con finestra osservabile)

### Trakt (last_watched_at)
- NPMI (sorpresa): Everything Everywhere All at Once [C=167] · Elemental [C=118] · Glass Onion - Knives Out [C=154] · Super Mario Bros. Il Film [C=191] · Fidanzata in affitto [C=116] · La sirenetta [C=78] · Povere creature! [C=108] · Oppenheimer [C=207]
- NPMI × log(1+C totale): Everything Everywhere All at Once [C=167] · Super Mario Bros. Il Film [C=191] · Oppenheimer [C=207] · Glass Onion - Knives Out [C=154] · Elemental [C=118] · Spider-Man: Across the Spider-Verse [C=155] · Fidanzata in affitto [C=116] · Dungeons & Dragons - L'onore dei ladri [C=150]
- migliori archi cross-medium per NPMI×logC: WandaVision [C=194.0] · The Good Place [C=138.0] · Loki [C=197.0] · Arcane [C=140.0] · The Last of Us [C=259.0]
- NPMI × log(1+C_late 180g), rerank pool: Super Mario Bros. Il Film [C=191.0, C180=23] · Oppenheimer [C=207.0, C180=24] · Fidanzata in affitto [C=116.0, C180=20] · Elemental [C=118.0, C180=18] · Spider-Man: Across the Spider-Verse [C=155.0, C180=17] · Guardiani della Galassia Vol. 3 [C=176.0, C180=18] · Dungeons & Dragons - L'onore dei ladri [C=150.0, C180=13] · Everything Everywhere All at Once [C=167.0, C180=9]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Fidanzata in affitto [C=116.0, C180=20] · Elemental [C=118.0, C180=18] · Super Mario Bros. Il Film [C=191.0, C180=23] · Oppenheimer [C=207.0, C180=24] · Spider-Man: Across the Spider-Verse [C=155.0, C180=17] · Guardiani della Galassia Vol. 3 [C=176.0, C180=18] · Dungeons & Dragons - L'onore dei ladri [C=150.0, C180=13] · Aftersun [C=36.0, C180=4]
- NPMI × log(1+C_late 365g), rerank pool: Super Mario Bros. Il Film [C=191.0, C365=10] · Elemental [C=118.0, C365=9] · Guardiani della Galassia Vol. 3 [C=176.0, C365=12] · Oppenheimer [C=207.0, C365=8] · Fidanzata in affitto [C=116.0, C365=7] · Dungeons & Dragons - L'onore dei ladri [C=150.0, C365=8] · Povere creature! [C=108.0, C365=7] · Spider-Man: Across the Spider-Verse [C=155.0, C365=7]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Elemental [C=118.0, C365=9] · Guardiani della Galassia Vol. 3 [C=176.0, C365=12] · Povere creature! [C=108.0, C365=7] · Fidanzata in affitto [C=116.0, C365=7] · Super Mario Bros. Il Film [C=191.0, C365=10] · Asteroid City [C=56.0, C365=4] · Dungeons & Dragons - L'onore dei ladri [C=150.0, C365=8] · Spider-Man: Across the Spider-Verse [C=155.0, C365=7]

## Oppenheimer — movie:872585

### MovieLens (timestamp rating)
- NPMI (sorpresa): Barbie [C=471] · Spider-Man: Across the Spider-Verse [C=440] · Mission: Impossible - Dead Reckoning Parte uno [C=240] · Guardiani della Galassia Vol. 3 [C=335] · Asteroid City [C=169] · Glass Onion - Knives Out [C=488] · Gli spiriti dell'isola [C=403] · Avatar: La via dell'acqua [C=298]
- NPMI × log(1+C totale): Barbie [C=471] · Spider-Man: Across the Spider-Verse [C=440] · Glass Onion - Knives Out [C=488] · Everything Everywhere All at Once [C=640] · Mission: Impossible - Dead Reckoning Parte uno [C=240] · Guardiani della Galassia Vol. 3 [C=335] · Gli spiriti dell'isola [C=403] · The Menu [C=389]
- NPMI × log(1+C_late 180g), rerank pool: (nessuna coppia con finestra osservabile)
- NPMI × log(1+C_tot) × C_late/C_tot 180g: (nessuna coppia con finestra osservabile)
- NPMI × log(1+C_late 365g), rerank pool: (nessuna coppia con finestra osservabile)
- NPMI × log(1+C_tot) × C_late/C_tot 365g: (nessuna coppia con finestra osservabile)

### Trakt (last_watched_at)
- NPMI (sorpresa): Killers of the Flower Moon [C=129] · Niente di nuovo sul fronte occidentale [C=94] · John Wick 4 [C=190] · The Menu [C=163] · Barbie [C=207] · Avatar: La via dell'acqua [C=196] · Povere creature! [C=118] · The Creator [C=139]
- NPMI × log(1+C totale): Killers of the Flower Moon [C=129] · John Wick 4 [C=190] · Barbie [C=207] · Avatar: La via dell'acqua [C=196] · The Menu [C=163] · Guardiani della Galassia Vol. 3 [C=200] · Dune [C=239] · Glass Onion - Knives Out [C=163]
- migliori archi cross-medium per NPMI×logC: Chernobyl [C=240.0] · Peaky Blinders [C=185.0] · Shōgun [C=174.0] · The Last of Us [C=307.0] · House of the Dragon [C=267.0]
- NPMI × log(1+C_late 180g), rerank pool: Dune [C=239.0, C180=61] · John Wick 4 [C=190.0, C180=31] · Avatar: La via dell'acqua [C=196.0, C180=31] · Mission: Impossible - Dead Reckoning Parte uno [C=176.0, C180=38] · Barbie [C=207.0, C180=24] · Guardiani della Galassia Vol. 3 [C=200.0, C180=26] · Top Gun: Maverick [C=195.0, C180=27] · The Menu [C=163.0, C180=19]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Dune [C=239.0, C180=61] · Mission: Impossible - Dead Reckoning Parte uno [C=176.0, C180=38] · John Wick 4 [C=190.0, C180=31] · Avatar: La via dell'acqua [C=196.0, C180=31] · Past Lives [C=78.0, C180=14] · Top Gun: Maverick [C=195.0, C180=27] · Guardiani della Galassia Vol. 3 [C=200.0, C180=26] · Barbie [C=207.0, C180=24]
- NPMI × log(1+C_late 365g), rerank pool: Avatar: La via dell'acqua [C=196.0, C365=19] · Dune [C=239.0, C365=24] · Guardiani della Galassia Vol. 3 [C=200.0, C365=15] · John Wick 4 [C=190.0, C365=12] · Mission: Impossible - Dead Reckoning Parte uno [C=176.0, C365=15] · Killers of the Flower Moon [C=129.0, C365=7] · Top Gun: Maverick [C=195.0, C365=13] · Glass Onion - Knives Out [C=163.0, C365=9]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Avatar: La via dell'acqua [C=196.0, C365=19] · Dune [C=239.0, C365=24] · Mission: Impossible - Dead Reckoning Parte uno [C=176.0, C365=15] · Guardiani della Galassia Vol. 3 [C=200.0, C365=15] · John Wick 4 [C=190.0, C365=12] · Top Gun: Maverick [C=195.0, C365=13] · Killers of the Flower Moon [C=129.0, C365=7] · Niente di nuovo sul fronte occidentale [C=94.0, C365=6]

## Breaking Bad — tv:1396

### Trakt (last_watched_at)
- NPMI (sorpresa): Better Call Saul [C=360] · Il Trono di Spade [C=523] · Dexter [C=294] · House of Cards [C=224] · Narcos [C=230] · How I Met Your Mother [C=265] · Lost [C=264] · Sherlock [C=301]
- NPMI × log(1+C totale): Il Trono di Spade [C=523] · Better Call Saul [C=360] · Dexter [C=294] · Chernobyl [C=359] · House of Cards [C=224] · Sherlock [C=301] · How I Met Your Mother [C=265] · Lost [C=264]
- migliori archi cross-medium per NPMI×logC: El Camino: Il film di Breaking Bad [C=103.0] · C'era una volta a… Hollywood [C=138.0] · Il Signore degli Anelli - La Compagnia dell'Anello [C=201.0] · Pulp Fiction [C=152.0] · Seven [C=124.0]
- NPMI × log(1+C_late 180g), rerank pool: Il Trono di Spade [C=523.0, C180=515] · Better Call Saul [C=360.0, C180=284] · Dexter [C=294.0, C180=288] · House of Cards [C=224.0, C180=217] · Sherlock [C=301.0, C180=293] · How I Met Your Mother [C=265.0, C180=255] · Lost [C=264.0, C180=259] · The Office (US) [C=315.0, C180=312]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Il Trono di Spade [C=523.0, C180=515] · Dexter [C=294.0, C180=288] · Better Call Saul [C=360.0, C180=284] · House of Cards [C=224.0, C180=217] · Sherlock [C=301.0, C180=293] · Lost [C=264.0, C180=259] · How I Met Your Mother [C=265.0, C180=255] · The Office (US) [C=315.0, C180=312]
- NPMI × log(1+C_late 365g), rerank pool: Il Trono di Spade [C=523.0, C365=515] · Better Call Saul [C=360.0, C365=266] · Dexter [C=294.0, C365=288] · Sherlock [C=301.0, C365=293] · How I Met Your Mother [C=265.0, C365=255] · Lost [C=264.0, C365=259] · House of Cards [C=224.0, C365=180] · The Office (US) [C=315.0, C365=312]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Il Trono di Spade [C=523.0, C365=515] · Dexter [C=294.0, C365=288] · Sherlock [C=301.0, C365=293] · Lost [C=264.0, C365=259] · How I Met Your Mother [C=265.0, C365=255] · The Office (US) [C=315.0, C365=312] · Better Call Saul [C=360.0, C365=266] · The Walking Dead [C=370.0, C365=364]

### Serializd (watched list)
- NPMI (sorpresa): Better Call Saul [C=65] · I Soprano [C=45] · Mr. Robot [C=40] · The Wire [C=26] · True Detective [C=41] · Dexter [C=56] · Prison Break [C=45] · Il Trono di Spade [C=67]
- NPMI × log(1+C totale): Better Call Saul [C=65] · I Soprano [C=45] · Mr. Robot [C=40] · Dexter [C=56] · True Detective [C=41] · Il Trono di Spade [C=67] · Prison Break [C=45] · The Wire [C=26]

## Narcos — tv:63351

### Trakt (last_watched_at)
- NPMI (sorpresa): Narcos: Messico [C=100] · House of Cards [C=151] · La casa di carta [C=153] · Mr. Robot [C=198] · El Chapo [C=29] · The Night of - Cosa è successo quella notte? [C=90] · MINDHUNTER [C=139] · Taboo [C=79]
- NPMI × log(1+C totale): Narcos: Messico [C=100] · House of Cards [C=151] · Mr. Robot [C=198] · La casa di carta [C=153] · Better Call Saul [C=194] · MINDHUNTER [C=139] · Breaking Bad [C=230] · Ozark [C=162]
- migliori archi cross-medium per NPMI×logC: Revenant - Redivivo [C=62.0] · La grande scommessa [C=57.0] · Don't Look Up [C=91.0] · Bright [C=38.0] · Sicario [C=56.0]
- NPMI × log(1+C_late 180g), rerank pool: House of Cards [C=151.0, C180=124] · Mr. Robot [C=198.0, C180=170] · Narcos: Messico [C=100.0, C180=41] · Better Call Saul [C=194.0, C180=180] · La casa di carta [C=153.0, C180=97] · Breaking Bad [C=230.0, C180=155] · Peaky Blinders [C=158.0, C180=151] · MINDHUNTER [C=139.0, C180=67]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: House of Cards [C=151.0, C180=124] · Mr. Robot [C=198.0, C180=170] · Better Call Saul [C=194.0, C180=180] · Peaky Blinders [C=158.0, C180=151] · L'uomo nell'alto castello [C=99.0, C180=83] · The Wire [C=113.0, C180=90] · La casa di carta [C=153.0, C180=97] · Breaking Bad [C=230.0, C180=155]
- NPMI × log(1+C_late 365g), rerank pool: House of Cards [C=151.0, C365=113] · Mr. Robot [C=198.0, C365=150] · Narcos: Messico [C=100.0, C365=38] · Better Call Saul [C=194.0, C365=175] · La casa di carta [C=153.0, C365=84] · Breaking Bad [C=230.0, C365=147] · Peaky Blinders [C=158.0, C365=147] · Ozark [C=162.0, C365=85]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Better Call Saul [C=194.0, C365=175] · House of Cards [C=151.0, C365=113] · Mr. Robot [C=198.0, C365=150] · Peaky Blinders [C=158.0, C365=147] · L'uomo nell'alto castello [C=99.0, C365=80] · The Wire [C=113.0, C365=88] · Breaking Bad [C=230.0, C365=147] · La casa di carta [C=153.0, C365=84]

### Serializd (watched list)
- NPMI (sorpresa): Narcos: Messico [C=3] · Narco-Saints [C=2] · Overflow [C=1] · 24 [C=1] · FBI [C=1] · Kuruluş Osman [C=1] · Longmire [C=1] · Fate/stay night [C=1]
- NPMI × log(1+C totale): Vikings [C=7] · Band of Brothers - Fratelli al fronte [C=7] · Fallout [C=11] · Marvel's The Punisher [C=9] · Narcos: Messico [C=3] · Peaky Blinders [C=9] · The Last Kingdom [C=5] · Chernobyl [C=8]

## Game of Thrones — tv:1399

### Trakt (last_watched_at)
- NPMI (sorpresa): Chernobyl [C=460] · Breaking Bad [C=523] · Westworld - Dove tutto è concesso [C=457] · Vikings [C=341] · Sherlock [C=361] · The Walking Dead [C=466] · Mr. Robot [C=379] · Narcos [C=264]
- NPMI × log(1+C totale): Breaking Bad [C=523] · Chernobyl [C=460] · Westworld - Dove tutto è concesso [C=457] · The Walking Dead [C=466] · Sherlock [C=361] · Vikings [C=341] · Mr. Robot [C=379] · Narcos [C=264]
- migliori archi cross-medium per NPMI×logC: Joker [C=262.0] · Dune [C=344.0] · Tenet [C=210.0] · Avengers: Infinity War [C=277.0] · Sopravvissuto - The Martian [C=199.0]
- NPMI × log(1+C_late 180g), rerank pool: Breaking Bad [C=523.0, C180=515] · Westworld - Dove tutto è concesso [C=457.0, C180=400] · Chernobyl [C=460.0, C180=159] · The Walking Dead [C=466.0, C180=465] · Sherlock [C=361.0, C180=356] · Vikings [C=341.0, C180=334] · Mr. Robot [C=379.0, C180=343] · Narcos [C=264.0, C180=246]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Breaking Bad [C=523.0, C180=515] · Westworld - Dove tutto è concesso [C=457.0, C180=400] · The Walking Dead [C=466.0, C180=465] · Sherlock [C=361.0, C180=356] · Vikings [C=341.0, C180=334] · Mr. Robot [C=379.0, C180=343] · Narcos [C=264.0, C180=246] · House of Cards [C=246.0, C180=244]
- NPMI × log(1+C_late 365g), rerank pool: Breaking Bad [C=523.0, C365=515] · Westworld - Dove tutto è concesso [C=457.0, C365=382] · Chernobyl [C=460.0, C365=139] · The Walking Dead [C=466.0, C365=463] · Sherlock [C=361.0, C365=354] · Vikings [C=341.0, C365=334] · Mr. Robot [C=379.0, C365=338] · Narcos [C=264.0, C365=238]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Breaking Bad [C=523.0, C365=515] · The Walking Dead [C=466.0, C365=463] · Westworld - Dove tutto è concesso [C=457.0, C365=382] · Sherlock [C=361.0, C365=354] · Vikings [C=341.0, C365=334] · Mr. Robot [C=379.0, C365=338] · House of Cards [C=246.0, C365=243] · Narcos [C=264.0, C365=238]

### Serializd (watched list)
- NPMI (sorpresa): House of the Dragon [C=62] · Mr. Robot [C=35] · The Last Kingdom [C=15] · A Knight of the Seven Kingdoms [C=44] · I Soprano [C=37] · True Detective [C=38] · Vikings [C=20] · Banshee - La città del male [C=15]
- NPMI × log(1+C totale): House of the Dragon [C=62] · A Knight of the Seven Kingdoms [C=44] · Breaking Bad [C=67] · Mr. Robot [C=35] · True Detective [C=38] · I Soprano [C=37] · The Boys [C=66] · Lost [C=37]

## L’attacco dei giganti — tv:1429

### Trakt (last_watched_at)
- NPMI (sorpresa): Demon Slayer: Kimetsu no Yaiba [C=170] · One-Punch Man [C=172] · Death Note [C=156] · Jujutsu Kaisen [C=160] · Hunter x Hunter [C=88] · My Hero Academia [C=134] · Chainsaw Man [C=121] · Solo Leveling [C=132]
- NPMI × log(1+C totale): Demon Slayer: Kimetsu no Yaiba [C=170] · One-Punch Man [C=172] · Death Note [C=156] · Jujutsu Kaisen [C=160] · My Hero Academia [C=134] · Solo Leveling [C=132] · Chainsaw Man [C=121] · One Piece [C=135]
- migliori archi cross-medium per NPMI×logC: Jujutsu Kaisen 0 - Il film [C=53.0] · La città incantata [C=74.0] · Demon Slayer - Il treno Mugen [C=40.0] · Suzume [C=45.0] · Spider-Man: Across the Spider-Verse [C=120.0]
- NPMI × log(1+C_late 180g), rerank pool: Demon Slayer: Kimetsu no Yaiba [C=170.0, C180=161] · One-Punch Man [C=172.0, C180=163] · Death Note [C=156.0, C180=141] · Jujutsu Kaisen [C=160.0, C180=136] · My Hero Academia [C=134.0, C180=129] · One Piece [C=135.0, C180=130] · Hunter x Hunter [C=88.0, C180=87] · Naruto [C=105.0, C180=92]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Demon Slayer: Kimetsu no Yaiba [C=170.0, C180=161] · One-Punch Man [C=172.0, C180=163] · Death Note [C=156.0, C180=141] · My Hero Academia [C=134.0, C180=129] · Hunter x Hunter [C=88.0, C180=87] · One Piece [C=135.0, C180=130] · Jujutsu Kaisen [C=160.0, C180=136] · Naruto Shippuden [C=91.0, C180=87]
- NPMI × log(1+C_late 365g), rerank pool: Demon Slayer: Kimetsu no Yaiba [C=170.0, C365=157] · One-Punch Man [C=172.0, C365=161] · Death Note [C=156.0, C365=139] · Jujutsu Kaisen [C=160.0, C365=134] · My Hero Academia [C=134.0, C365=129] · One Piece [C=135.0, C365=130] · Hunter x Hunter [C=88.0, C365=87] · Naruto [C=105.0, C365=92]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: One-Punch Man [C=172.0, C365=161] · Demon Slayer: Kimetsu no Yaiba [C=170.0, C365=157] · Death Note [C=156.0, C365=139] · My Hero Academia [C=134.0, C365=129] · Hunter x Hunter [C=88.0, C365=87] · One Piece [C=135.0, C365=130] · Jujutsu Kaisen [C=160.0, C365=134] · Naruto Shippuden [C=91.0, C365=87]

### AniList (membership; status absent)
- NPMI (sorpresa): Death Note [C=1344] · Fullmetal Alchemist: Brotherhood [C=1267] · Sword Art Online [C=1350] · Tokyo Ghoul [C=1207] · Steins;Gate [C=1240] · One-Punch Man [C=1220] · Hunter x Hunter [C=1122] · Kill la Kill [C=1039]
- NPMI × log(1+C totale): Death Note [C=1344] · Fullmetal Alchemist: Brotherhood [C=1267] · Sword Art Online [C=1350] · Tokyo Ghoul [C=1207] · Steins;Gate [C=1240] · One-Punch Man [C=1220] · Hunter x Hunter [C=1122] · Code Geass: Lelouch of the Rebellion [C=1180]

### Serializd (watched list)
- NPMI (sorpresa): Naruto [C=28] · Vinland Saga [C=34] · Demon Slayer: Kimetsu no Yaiba [C=36] · Naruto Shippuden [C=23] · Death Note [C=48] · The Wire [C=22] · Jujutsu Kaisen [C=36] · The Leftovers - Svaniti nel nulla [C=25]
- NPMI × log(1+C totale): Demon Slayer: Kimetsu no Yaiba [C=36] · Vinland Saga [C=34] · Naruto [C=28] · Death Note [C=48] · Jujutsu Kaisen [C=36] · Mr. Robot [C=31] · One Piece [C=29] · True Detective [C=33]

## Parasite — movie:496243

### MovieLens (timestamp rating)
- NPMI (sorpresa): Joker [C=7350] · Cena con delitto - Knives Out [C=6822] · C'era una volta a… Hollywood [C=4943] · Jojo Rabbit [C=4477] · 1917 [C=4734] · Midsommar - Il villaggio dei dannati [C=3409] · Diamanti grezzi [C=2960] · Storia di un matrimonio [C=2903]
- NPMI × log(1+C totale): Joker [C=7350] · Cena con delitto - Knives Out [C=6822] · C'era una volta a… Hollywood [C=4943] · Jojo Rabbit [C=4477] · 1917 [C=4734] · Scappa - Get Out [C=5795] · Midsommar - Il villaggio dei dannati [C=3409] · Diamanti grezzi [C=2960]
- NPMI × log(1+C_late 180g), rerank pool: Joker [C=7350.0, C180=5283] · Cena con delitto - Knives Out [C=6822.0, C180=4488] · C'era una volta a… Hollywood [C=4943.0, C180=3889] · Jojo Rabbit [C=4477.0, C180=3205] · 1917 [C=4734.0, C180=2843] · Midsommar - Il villaggio dei dannati [C=3409.0, C180=2921] · Scappa - Get Out [C=5795.0, C180=4288] · Storia di un matrimonio [C=2903.0, C180=2026]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Joker [C=7350.0, C180=5283] · C'era una volta a… Hollywood [C=4943.0, C180=3889] · Midsommar - Il villaggio dei dannati [C=3409.0, C180=2921] · Cena con delitto - Knives Out [C=6822.0, C180=4488] · Jojo Rabbit [C=4477.0, C180=3205] · Scappa - Get Out [C=5795.0, C180=4288] · Hereditary - Le radici del male [C=3078.0, C180=2439] · Noi [C=2561.0, C180=2025]
- NPMI × log(1+C_late 365g), rerank pool: Joker [C=7350.0, C365=3402] · Cena con delitto - Knives Out [C=6822.0, C365=3155] · C'era una volta a… Hollywood [C=4943.0, C365=2556] · Jojo Rabbit [C=4477.0, C365=2044] · 1917 [C=4734.0, C365=1885] · Scappa - Get Out [C=5795.0, C365=3396] · Midsommar - Il villaggio dei dannati [C=3409.0, C365=2088] · Diamanti grezzi [C=2960.0, C365=1308]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Midsommar - Il villaggio dei dannati [C=3409.0, C365=2088] · Scappa - Get Out [C=5795.0, C365=3396] · Joker [C=7350.0, C365=3402] · C'era una volta a… Hollywood [C=4943.0, C365=2556] · Cena con delitto - Knives Out [C=6822.0, C365=3155] · Hereditary - Le radici del male [C=3078.0, C365=1870] · Noi [C=2561.0, C365=1488] · Jojo Rabbit [C=4477.0, C365=2044]

### Trakt (last_watched_at)
- NPMI (sorpresa): Joker [C=181] · Storia di un matrimonio [C=54] · Cena con delitto - Knives Out [C=151] · C'era una volta a… Hollywood [C=102] · Midsommar - Il villaggio dei dannati [C=81] · Jojo Rabbit [C=71] · Black Mirror: Bandersnatch [C=49] · First Man - Il primo uomo [C=43]
- NPMI × log(1+C totale): Joker [C=181] · Cena con delitto - Knives Out [C=151] · C'era una volta a… Hollywood [C=102] · Storia di un matrimonio [C=54] · Dune [C=176] · Midsommar - Il villaggio dei dannati [C=81] · Tenet [C=118] · Jojo Rabbit [C=71]
- migliori archi cross-medium per NPMI×logC: Black Mirror [C=207.0] · Mr. Robot [C=141.0] · Breaking Bad [C=179.0] · Chernobyl [C=153.0] · The End of the F***ing World [C=74.0]
- NPMI × log(1+C_late 180g), rerank pool: Joker [C=181.0, C180=58] · Cena con delitto - Knives Out [C=151.0, C180=53] · C'era una volta a… Hollywood [C=102.0, C180=43] · Midsommar - Il villaggio dei dannati [C=81.0, C180=44] · Spider-Man: Un nuovo universo [C=117.0, C180=70] · Scappa - Get Out [C=92.0, C180=45] · Blade Runner 2049 [C=95.0, C180=49] · Avengers: Endgame [C=147.0, C180=72]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Spider-Man: Un nuovo universo [C=117.0, C180=70] · Midsommar - Il villaggio dei dannati [C=81.0, C180=44] · Joker [C=181.0, C180=58] · C'era una volta a… Hollywood [C=102.0, C180=43] · Scappa - Get Out [C=92.0, C180=45] · Blade Runner 2049 [C=95.0, C180=49] · Cena con delitto - Knives Out [C=151.0, C180=53] · Avengers: Endgame [C=147.0, C180=72]
- NPMI × log(1+C_late 365g), rerank pool: Joker [C=181.0, C365=44] · Cena con delitto - Knives Out [C=151.0, C365=44] · C'era una volta a… Hollywood [C=102.0, C365=23] · Scappa - Get Out [C=92.0, C365=36] · Spider-Man: Un nuovo universo [C=117.0, C365=48] · Dune [C=176.0, C365=41] · Blade Runner 2049 [C=95.0, C365=39] · Midsommar - Il villaggio dei dannati [C=81.0, C365=22]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Joker [C=181.0, C365=44] · Cena con delitto - Knives Out [C=151.0, C365=44] · Spider-Man: Un nuovo universo [C=117.0, C365=48] · Scappa - Get Out [C=92.0, C365=36] · Blade Runner 2049 [C=95.0, C365=39] · Avengers: Endgame [C=147.0, C365=55] · Midsommar - Il villaggio dei dannati [C=81.0, C365=22] · C'era una volta a… Hollywood [C=102.0, C365=23]

## Titanic — movie:597

### MovieLens (timestamp rating)
- NPMI (sorpresa): Men in Black [C=27229] · Tutti pazzi per Mary [C=18582] · Star Wars: Episodio I - La minaccia fantasma [C=21386] · The Truman Show [C=23685] · Edward mani di forbice [C=17273] · American Pie [C=17374] · Armageddon - Giudizio finale [C=16060] · Qualcosa è cambiato [C=16078]
- NPMI × log(1+C totale): Men in Black [C=27229] · Tutti pazzi per Mary [C=18582] · The Truman Show [C=23685] · Star Wars: Episodio I - La minaccia fantasma [C=21386] · Edward mani di forbice [C=17273] · The Sixth Sense - Il sesto senso [C=27471] · American Pie [C=17374] · E.T. l'extra-terrestre [C=21377]
- NPMI × log(1+C_late 180g), rerank pool: Men in Black [C=27229.0, C180=26917] · Tutti pazzi per Mary [C=18582.0, C180=18217] · The Truman Show [C=23685.0, C180=23318] · Star Wars: Episodio I - La minaccia fantasma [C=21386.0, C180=20068] · Edward mani di forbice [C=17273.0, C180=17219] · The Sixth Sense - Il sesto senso [C=27471.0, C180=25499] · American Pie [C=17374.0, C180=16518] · E.T. l'extra-terrestre [C=21377.0, C180=21100]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Men in Black [C=27229.0, C180=26917] · Tutti pazzi per Mary [C=18582.0, C180=18217] · The Truman Show [C=23685.0, C180=23318] · Edward mani di forbice [C=17273.0, C180=17219] · Star Wars: Episodio I - La minaccia fantasma [C=21386.0, C180=20068] · Rain Man - L'uomo della pioggia [C=18591.0, C180=18520] · E.T. l'extra-terrestre [C=21377.0, C180=21100] · Armageddon - Giudizio finale [C=16060.0, C180=15647]
- NPMI × log(1+C_late 365g), rerank pool: Men in Black [C=27229.0, C365=26467] · Tutti pazzi per Mary [C=18582.0, C365=18075] · The Truman Show [C=23685.0, C365=23145] · Star Wars: Episodio I - La minaccia fantasma [C=21386.0, C365=18899] · Edward mani di forbice [C=17273.0, C365=17064] · The Sixth Sense - Il sesto senso [C=27471.0, C365=24714] · American Pie [C=17374.0, C365=16039] · E.T. l'extra-terrestre [C=21377.0, C365=20790]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Men in Black [C=27229.0, C365=26467] · Tutti pazzi per Mary [C=18582.0, C365=18075] · The Truman Show [C=23685.0, C365=23145] · Edward mani di forbice [C=17273.0, C365=17064] · Rain Man - L'uomo della pioggia [C=18591.0, C365=18236] · E.T. l'extra-terrestre [C=21377.0, C365=20790] · Armageddon - Giudizio finale [C=16060.0, C365=15513] · Star Wars: Episodio I - La minaccia fantasma [C=21386.0, C365=18899]

### Trakt (last_watched_at)
- NPMI (sorpresa): Edge of the Earth [C=3] · The Only Way Is Essex [C=4] · Shaggy e Scooby-Doo [C=4] · Piccolo grande eroe [C=2] · Zoe [C=2] · Kung Fu Panda - I segreti della pergamena [C=2] · SDF - Street Dance Fighters [C=2] · Doppia indagine [C=2]
- NPMI × log(1+C totale): Forrest Gump [C=64] · Il re leone [C=58] · Harry Potter e il calice di fuoco [C=69] · La maledizione della prima luna [C=58] · Harry Potter e il principe mezzosangue [C=64] · Mamma, ho perso l'aereo [C=78] · Toy Story - Il mondo dei giocattoli [C=63] · Harry Potter e la camera dei segreti [C=73]
- migliori archi cross-medium per NPMI×logC: Drake & Josh [C=13.0] · Prison Break [C=53.0] · The Only Way Is Essex [C=4.0] · Shaggy e Scooby-Doo [C=4.0] · Friends [C=79.0]
- NPMI × log(1+C_late 180g), rerank pool: Forrest Gump [C=64.0, C180=60] · Il re leone [C=58.0, C180=54] · Harry Potter e il calice di fuoco [C=69.0, C180=65] · La maledizione della prima luna [C=58.0, C180=53] · Mamma, ho perso l'aereo [C=78.0, C180=78] · Harry Potter e il principe mezzosangue [C=64.0, C180=60] · Harry Potter e la camera dei segreti [C=73.0, C180=66] · Toy Story - Il mondo dei giocattoli [C=63.0, C180=57]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Forrest Gump [C=64.0, C180=60] · Mamma, ho perso l'aereo [C=78.0, C180=78] · Il re leone [C=58.0, C180=54] · Harry Potter e il calice di fuoco [C=69.0, C180=65] · La maledizione della prima luna [C=58.0, C180=53] · Harry Potter e il principe mezzosangue [C=64.0, C180=60] · Il miglio verde [C=41.0, C180=39] · Toy Story - Il mondo dei giocattoli [C=63.0, C180=57]
- NPMI × log(1+C_late 365g), rerank pool: Forrest Gump [C=64.0, C365=60] · Il re leone [C=58.0, C365=54] · Harry Potter e il calice di fuoco [C=69.0, C365=65] · La maledizione della prima luna [C=58.0, C365=53] · Mamma, ho perso l'aereo [C=78.0, C365=78] · Harry Potter e il principe mezzosangue [C=64.0, C365=60] · Harry Potter e la camera dei segreti [C=73.0, C365=66] · Toy Story - Il mondo dei giocattoli [C=63.0, C365=57]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Forrest Gump [C=64.0, C365=60] · Mamma, ho perso l'aereo [C=78.0, C365=78] · Il re leone [C=58.0, C365=54] · Harry Potter e il calice di fuoco [C=69.0, C365=65] · La maledizione della prima luna [C=58.0, C365=53] · Harry Potter e il principe mezzosangue [C=64.0, C365=60] · Il miglio verde [C=41.0, C365=39] · Toy Story - Il mondo dei giocattoli [C=63.0, C365=57]

## Coda Trakt (C_i=3) — movie:45722

### MovieLens (timestamp rating)
- NPMI (sorpresa): The Principles of Lust [C=3] · Anoche soñé contigo [C=3] · Два в одном [C=3] · Acné [C=2] · Quella certa età [C=2] · きらきらひかる [C=2] · Mafalda: Il Film [C=2] · Sta' fermo, muori e resuscita [C=3]
- NPMI × log(1+C totale): Q [C=5] · The Principles of Lust [C=3] · Anoche soñé contigo [C=3] · Два в одном [C=3] · The Horribly Slow Murderer with the Extremely Inefficient Weapon [C=5] · Sta' fermo, muori e resuscita [C=3] · Lo zar e la ballerina [C=4] · Soffio al cuore [C=6]
- NPMI × log(1+C_late 180g), rerank pool: Q [C=5.0, C180=5] · The Principles of Lust [C=3.0, C180=3] · Anoche soñé contigo [C=3.0, C180=3] · Два в одном [C=3.0, C180=3] · The Horribly Slow Murderer with the Extremely Inefficient Weapon [C=5.0, C180=5] · Sta' fermo, muori e resuscita [C=3.0, C180=3] · Soffio al cuore [C=6.0, C180=6] · Второстепенные люди [C=3.0, C180=3]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Q [C=5.0, C180=5] · The Principles of Lust [C=3.0, C180=3] · Anoche soñé contigo [C=3.0, C180=3] · Два в одном [C=3.0, C180=3] · The Horribly Slow Murderer with the Extremely Inefficient Weapon [C=5.0, C180=5] · Sta' fermo, muori e resuscita [C=3.0, C180=3] · Soffio al cuore [C=6.0, C180=6] · Второстепенные люди [C=3.0, C180=3]
- NPMI × log(1+C_late 365g), rerank pool: Q [C=5.0, C365=5] · The Principles of Lust [C=3.0, C365=3] · Anoche soñé contigo [C=3.0, C365=3] · Два в одном [C=3.0, C365=3] · The Horribly Slow Murderer with the Extremely Inefficient Weapon [C=5.0, C365=5] · Sta' fermo, muori e resuscita [C=3.0, C365=3] · Soffio al cuore [C=6.0, C365=6] · Второстепенные люди [C=3.0, C365=3]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Q [C=5.0, C365=5] · The Principles of Lust [C=3.0, C365=3] · Anoche soñé contigo [C=3.0, C365=3] · Два в одном [C=3.0, C365=3] · The Horribly Slow Murderer with the Extremely Inefficient Weapon [C=5.0, C365=5] · Sta' fermo, muori e resuscita [C=3.0, C365=3] · Soffio al cuore [C=6.0, C365=6] · Второстепенные люди [C=3.0, C365=3]

### Trakt (last_watched_at)
- NPMI (sorpresa): Innocenza colposa [C=1] · Orchidea selvaggia [C=1] · Bait - L'esca [C=1] · The Watcher [C=1] · Analisi finale [C=1] · Celebrity [C=1] · The Eye - Lo sguardo [C=1] · Trappola d'amore [C=1]
- NPMI × log(1+C totale): Malizia [C=2] · American College [C=2] · Il sesso secondo lei [C=2] · Milf [C=2] · In the Name of the King [C=2] · Miranda [C=2] · Lolita [C=2] · Così fan tutte [C=2]
- migliori archi cross-medium per NPMI×logC: Xica da Silva [C=1.0] · The Last Don [C=1.0] · XIII [C=1.0] · La missione dei quattro cavalieri [C=1.0] · The Sex Education Show [C=1.0]
- NPMI × log(1+C_late 180g), rerank pool: Malizia [C=2.0, C180=2] · American College [C=2.0, C180=2] · Milf [C=2.0, C180=2] · Il sesso secondo lei [C=2.0, C180=2] · Miranda [C=2.0, C180=2] · In the Name of the King [C=2.0, C180=2] · Lolita [C=2.0, C180=2] · Così fan tutte [C=2.0, C180=2]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Malizia [C=2.0, C180=2] · American College [C=2.0, C180=2] · Milf [C=2.0, C180=2] · Il sesso secondo lei [C=2.0, C180=2] · Miranda [C=2.0, C180=2] · In the Name of the King [C=2.0, C180=2] · Lolita [C=2.0, C180=2] · Così fan tutte [C=2.0, C180=2]
- NPMI × log(1+C_late 365g), rerank pool: Malizia [C=2.0, C365=2] · American College [C=2.0, C365=2] · Milf [C=2.0, C365=2] · Il sesso secondo lei [C=2.0, C365=2] · Miranda [C=2.0, C365=2] · In the Name of the King [C=2.0, C365=2] · Lolita [C=2.0, C365=2] · Così fan tutte [C=2.0, C365=2]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Malizia [C=2.0, C365=2] · American College [C=2.0, C365=2] · Milf [C=2.0, C365=2] · Il sesso secondo lei [C=2.0, C365=2] · Miranda [C=2.0, C365=2] · In the Name of the King [C=2.0, C365=2] · Lolita [C=2.0, C365=2] · Così fan tutte [C=2.0, C365=2]

## Coda Trakt (C_i=3) — tv:2261

### Trakt (last_watched_at)
- NPMI (sorpresa): Degrassi Junior High [C=2] · Degrassi High [C=2] · La caduta degli dei [C=1] · It's Pat: The Movie [C=1] · Ultima notte a Cottonwood [C=1] · La rossa maschera del terrore [C=1] · Non torno a casa stasera [C=1] · Boon il saccheggiatore [C=1]
- NPMI × log(1+C totale): Degrassi Junior High [C=2] · Degrassi High [C=2] · Dallas [C=2] · Il braccio violento della legge [C=2] · The Ridiculous 6 [C=2] · gli Octonauti [C=2] · Ma guarda un po' 'sti americani! [C=2] · The Andy Griffith Show [C=2]
- migliori archi cross-medium per NPMI×logC: Il braccio violento della legge [C=2.0] · The Ridiculous 6 [C=2.0] · Ma guarda un po' 'sti americani! [C=2.0] · La caduta degli dei [C=1.0] · It's Pat: The Movie [C=1.0]
- NPMI × log(1+C_late 180g), rerank pool: Degrassi Junior High [C=2.0, C180=2] · Degrassi High [C=2.0, C180=2] · Dallas [C=2.0, C180=2] · Il braccio violento della legge [C=2.0, C180=2] · The Ridiculous 6 [C=2.0, C180=2] · gli Octonauti [C=2.0, C180=2] · Ma guarda un po' 'sti americani! [C=2.0, C180=2] · The Andy Griffith Show [C=2.0, C180=2]
- NPMI × log(1+C_tot) × C_late/C_tot 180g: Degrassi Junior High [C=2.0, C180=2] · Degrassi High [C=2.0, C180=2] · Dallas [C=2.0, C180=2] · Il braccio violento della legge [C=2.0, C180=2] · The Ridiculous 6 [C=2.0, C180=2] · gli Octonauti [C=2.0, C180=2] · Ma guarda un po' 'sti americani! [C=2.0, C180=2] · The Andy Griffith Show [C=2.0, C180=2]
- NPMI × log(1+C_late 365g), rerank pool: Degrassi Junior High [C=2.0, C365=2] · Degrassi High [C=2.0, C365=2] · Dallas [C=2.0, C365=2] · Il braccio violento della legge [C=2.0, C365=2] · The Ridiculous 6 [C=2.0, C365=2] · gli Octonauti [C=2.0, C365=2] · Ma guarda un po' 'sti americani! [C=2.0, C365=2] · The Andy Griffith Show [C=2.0, C365=2]
- NPMI × log(1+C_tot) × C_late/C_tot 365g: Degrassi Junior High [C=2.0, C365=2] · Degrassi High [C=2.0, C365=2] · Dallas [C=2.0, C365=2] · Il braccio violento della legge [C=2.0, C365=2] · The Ridiculous 6 [C=2.0, C365=2] · gli Octonauti [C=2.0, C365=2] · Ma guarda un po' 'sti americani! [C=2.0, C365=2] · The Andy Griffith Show [C=2.0, C365=2]

## Coppie sentinella

Supporto e persistenza misurati direttamente per le coppie diagnostiche (se presenti nel pool candidato):

### Barbie / Oppenheimer
- MovieLens (timestamp rating): C=471.0, NPMI=0.738, NPMI×log(1+C)=4.546; C180=censurato; C365=censurato
- Trakt (last_watched_at): C=207.0, NPMI=0.295, NPMI×log(1+C)=1.574; C180=24, loglate=0.949, persist=0.183; C365=8, loglate=0.648, persist=0.061

### Barbie / Super Mario
- MovieLens (timestamp rating): C=198.0, NPMI=0.631, NPMI×log(1+C)=3.339; C180=censurato; C365=censurato
- Trakt (last_watched_at): C=191.0, NPMI=0.308, NPMI×log(1+C)=1.618; C180=23, loglate=0.978, persist=0.195; C365=10, loglate=0.738, persist=0.085

### Breaking Bad / Narcos
- Trakt (last_watched_at): C=230.0, NPMI=0.298, NPMI×log(1+C)=1.620; C180=155, loglate=1.503, persist=1.092; C365=147, loglate=1.488, persist=1.036
- Serializd (watched list): C=12.0, NPMI=0.232, NPMI×log(1+C)=0.595, C_late n/d

### Breaking Bad / Game of Thrones
- Trakt (last_watched_at): C=523.0, NPMI=0.340, NPMI×log(1+C)=2.131; C180=515, loglate=2.125, persist=2.098; C365=515, loglate=2.125, persist=2.098
- Serializd (watched list): C=67.0, NPMI=0.327, NPMI×log(1+C)=1.378, C_late n/d

### Parasite / Joker
- MovieLens (timestamp rating): C=7350.0, NPMI=0.721, NPMI×log(1+C)=6.423; C180=5283, loglate=6.184, persist=4.616; C365=3402, loglate=5.867, persist=2.973
- Trakt (last_watched_at): C=181.0, NPMI=0.443, NPMI×log(1+C)=2.306; C180=58, loglate=1.807, persist=0.739; C365=44, loglate=1.687, persist=0.561

## Copertura e note

- Trakt: 4,452 chronology files; 1,855 utenti con almeno un titolo nel canone; timestamp massimo 2026-10-27.
- AniList: 2,889 profili, 1,341,604 entry grezze; mapping artifact 10,190; tra gli ID MAL scaricati 9,885/18,071 mappati e 6,109 nel canone; 799,281 coppie utente-titolo dopo dedup. Status non disponibile nella cache.
- Serializd: 417 profili, 29,798 entry grezze.
- MovieLens: 31,621,253 righe rating mappate al canone prima della deduplica user×titolo; 200,948 utenti attivi; timestamp massimo 2023-10-13.
- Le classifiche “late” sono una ri-valutazione dei candidati NPMI e NPMI×logC, non una ricerca esaustiva di candidati nuovi: non usare questo test per misurare recall o decidere pesi globali.
- La deduplica è per utente e riga TMDB; MAL di stagioni diverse dello stesso anime diventano una sola serie osservata.
