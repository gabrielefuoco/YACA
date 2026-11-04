# Update generator and run complete automated check
import sys
sys.path.insert(0, '.')
import json
import collections
from pathlib import Path
import pandas as pd
from services.graph_dense import config as C

dm = pd.read_parquet(C.TMDB / 'movies.parquet')
dt = pd.read_parquet(C.TMDB / 'tv.parquet')

dm['year'] = dm['release_date'].fillna('').str[:4].apply(lambda x: int(x) if x.isdigit() else 0)
dt['year'] = dt['first_air_date'].fillna('').str[:4].apply(lambda x: int(x) if x.isdigit() else 0)

data = [
    # 1. movie:121986 — Frances Ha (2013)
    {
        "seed": "movie:121986",
        "suggerimenti": [
            {"titolo": "Cléo de 5 à 7", "anno": 1962, "perche": "Flânerie parigina leggera, ansia esistenziale celata sotto il fascino."},
            {"titolo": "Le Rayon vert", "anno": 1986, "perche": "Solitudine estiva, goffaggine relazionale e malinconico candore quotidiano."},
            {"titolo": "Verdens verste menneske", "anno": 2021, "perche": "Indecisione generazionale, freschezza vitale e smarrimento affettivo agrodolce."},
            {"titolo": "Oh Boy", "anno": 2012, "perche": "Vagabondaggio urbano in bianco e nero, dolce disorientamento giovanile."},
            {"titolo": "Girlfriends", "anno": 1978, "perche": "Complicità femminile, separazioni dolorose e ricerca d'identità newyorkese."},
            {"titolo": "Muriel's Wedding", "anno": 1994, "perche": "Balorda insicurezza, fantasie stravaganti e solitudine mascherata da sorrisi."},
            {"titolo": "Happy-Go-Lucky", "anno": 2008, "perche": "Vitalità radiosa, candida stravaganza e vulnerabilità contro il cinismo."},
            {"titolo": "Mistress America", "anno": 2015, "perche": "Fervore aspirazionale newyorkese, esuberanza goffa e amara disillusione."},
            {"titolo": "Tiny Furniture", "anno": 2010, "perche": "Impaccio post-universitario, narcisismo fragile e comica deriva quotidiana."},
            {"titolo": "Funny Ha Ha", "anno": 2002, "perche": "Realismo mumblecore dimesso, esitazioni balbettate e sentimenti inespressi."},
            {"titolo": "Metropolitan", "anno": 1990, "perche": "Arguzia verbale malinconica, borghesia decadente e ansia per il futuro."},
            {"titolo": "Lost in Translation", "anno": 2003, "perche": "Sradicamento metropolitano, intesa effimera e sospensione emotiva malinconica."},
            {"titolo": "Le Fabuleux Destin d'Amélie Poulain", "anno": 2001, "perche": "Solitudine poetica, timidezza urbana e giocosa idealizzazione dei legami."},
            {"titolo": "Fish Tank", "anno": 2009, "perche": "Spavalderia ferita, danza liberatoria e ricerca vulnerabile di calore."},
            {"titolo": "Gregory's Girl", "anno": 1981, "perche": "Dolcezza goffa, innocente timidezza adolescenziale e disarmante leggerezza."},
            {"titolo": "Céline et Julie vont en bateau", "anno": 1974, "perche": "Giocosa complicità femminile, fantasia teatrale e libertà anarchica contagiosa."},
            {"titolo": "Un divan à New York", "anno": 1996, "perche": "Commedia romantica svagata, malintesi urbani e grazia nevrotica poetica."},
            {"titolo": "Sommarnattens leende", "anno": 1955, "perche": "Schermaglie amorose scintillanti, malinconia dorata e grazia teatrale leggera."},
            {"titolo": "Linda Linda Linda", "anno": 2005, "perche": "Indolenza estiva adolescenziale, legami spontanei e gioia senza pretese."},
            {"titolo": "Cousin, cousine", "anno": 1975, "perche": "Farsa familiare gioiosa, scandalo borghese leggero e passione contagiosa."}
        ]
    },
    # 2. tv:73481 — Ecomoda (2001)
    {
        "seed": "tv:73481",
        "suggerimenti": [
            {"titolo": "Jane the Virgin", "anno": 2014, "perche": "Camp teatrale, ritmo da telenovela e comica celebrazione melodrammatica."},
            {"titolo": "Ugly Betty", "anno": 2006, "perche": "Farsa aziendale sfavillante, intrighi grotteschi e calore umano irresistibile."},
            {"titolo": "Mujeres al borde de un ataque de nervios", "anno": 1988, "perche": "Isteria farsesca, passione melodrammatica esasperata ed esilarante coralità ritmata."},
            {"titolo": "Smash", "anno": 2012, "perche": "Teatralità esagerata, rivalità professionali infuocate e melodramma da backstage."},
            {"titolo": "Los Serrano", "anno": 2003, "perche": "Caos familiare e lavorativo spassoso, equivoci comici quotidiani ed esuberanza travolgente."},
            {"titolo": "Nine to Five", "anno": 1980, "perche": "Vendetta d'ufficio grottesca, complicità farsesca femminile e satira lavorativa."},
            {"titolo": "Soap", "anno": 1977, "perche": "Parodia scatenata del melodramma soap, assurdi intrighi ed esagerazione teatrale."},
            {"titolo": "La casa de las flores", "anno": 2018, "perche": "Satira altoborghese kitsch, segreti stravaganti e melodramma telenovela moderno."},
            {"titolo": "L'Arnacœur", "anno": 2010, "perche": "Manovre romantiche truffaldine, farsa brillante ed effervescenza ritmica spudorata."},
            {"titolo": "Dix pour cent", "anno": 2015, "perche": "Caos d'agenzia nevrotico, ego spropositati e affettuosa isteria professionale."},
            {"titolo": "Fantozzi", "anno": 1975, "perche": "Alienazione impiegatizia iperbolica, gerarchie mostruose e catastrofi farsesche continue."},
            {"titolo": "Il paradiso delle signore", "anno": 2015, "perche": "Ambizioni sartoriali, melodramma romantico d'ufficio e scintillante gossip quotidiano."},
            {"titolo": "Boris", "anno": 2007, "perche": "Satira farsesca dietro le quinte, nevrosi lavorative e comicità irresistibile."},
            {"titolo": "Coffee Prince", "anno": 2007, "perche": "Equivoci d'identità sul lavoro, commedia romantica vivace e calore esuberante."},
            {"titolo": "Kinky Boots", "anno": 2005, "perche": "Salvataggio aziendale kitsch, eccentricità teatrale e trascinante energia comunitaria."},
            {"titolo": "Fawlty Towers", "anno": 1975, "perche": "Panico gestionale nevrotico, farsa d'albergo frenetica e catastrofi continue."},
            {"titolo": "Potiche", "anno": 2010, "perche": "Farsa aziendale rétro, camp coloratissimo e rivalsa femminile spigliata."},
            {"titolo": "Los simuladores", "anno": 2002, "perche": "Truffe d'ingegno geniali, teatralità farsesca ed esilarante inganno risolutivo."},
            {"titolo": "Ladies in Black", "anno": 2018, "perche": "Moda elegante, fermento di grandi magazzini e speranze romantiche luminose."},
            {"titolo": "Aquí no hay quien viva", "anno": 2003, "perche": "Farsa condominiale travolgente, pettegolezzi isterici e ritmo comico vertiginoso."}
        ]
    },
    # 3. movie:10139 — Milk (2008)
    {
        "seed": "movie:10139",
        "suggerimenti": [
            {"titolo": "Norma Rae", "anno": 1979, "perche": "Tenace dignità operaia, fervore sindacale e calore umano di riscatto."},
            {"titolo": "Pride", "anno": 2014, "perche": "Solidarietà comunitaria travolgente, ottimismo militante e commovente fratellanza civile."},
            {"titolo": "Il caso Mattei", "anno": 1972, "perche": "Fervore politico visionario, solitudine del pioniere e presagio di martirio."},
            {"titolo": "Selma", "anno": 2014, "perche": "Mobilizzazione civile solenne, carisma morale e marcia instancabile verso giustizia."},
            {"titolo": "120 battements par minute", "anno": 2017, "perche": "Lotta politica viscerale, urgenza vitale giovanile e lutto collettivo straziante."},
            {"titolo": "Matewan", "anno": 1987, "perche": "Lotta civile fraterna, idealismo corale sotto assedio e nobiltà tragica."},
            {"titolo": "Gandhi", "anno": 1982, "perche": "Fermezza morale serena, resistenza pacifica di popolo ed epica trascinante."},
            {"titolo": "Z", "anno": 1969, "perche": "Tensione politica martellante, integrità civile intransigente e denuncia del potere."},
            {"titolo": "Philadelphia", "anno": 1993, "perche": "Dolcezza straziante, rivendicazione di dignità e calore affettivo tra lacrime."},
            {"titolo": "Good Night, and Good Luck.", "anno": 2005, "perche": "Sobrietà morale incrollabile, integrità giornalistica e compostezza civile contro paura."},
            {"titolo": "I compagni", "anno": 1963, "perche": "Umanità calda e cenciosa, risveglio della coscienza operaia e speranza."},
            {"titolo": "Dallas Buyers Club", "anno": 2013, "perche": "Riscatto disperato, solidarietà pragmatica tra emarginati ed energia ribelle vitale."},
            {"titolo": "No", "anno": 2012, "perche": "Campagna civile radiosa, ottimismo contagioso e liberazione collettiva dalla paura."},
            {"titolo": "Made in Dagenham", "anno": 2010, "perche": "Vitalità operaia solare, coraggio femminile spontaneo e trionfo di dignità."},
            {"titolo": "Sacco e Vanzetti", "anno": 1971, "perche": "Martirio civile dignitoso, ingiustizia straziante e fratellanza umana indissolubile."},
            {"titolo": "Cesar Chavez", "anno": 2014, "perche": "Determinazione pacifica nonviolenta, orgoglio comunitario e umile leadership popolare."},
            {"titolo": "Argentina, 1985", "anno": 2022, "perche": "Coraggio istituzionale sommesso, rigore civile e commossa vittoria della democrazia."},
            {"titolo": "The Wind That Shakes the Barley", "anno": 2006, "perche": "Fratellanza idealista infranta, rigore morale e tragedia della lotta civile."},
            {"titolo": "Germinal", "anno": 1993, "perche": "Fervore proletario imponente, disperazione condivisa e dignità umana inestinguibile."},
            {"titolo": "In the Name of the Father", "anno": 1993, "perche": "Battaglia civile viscerale contro l'ingiustizia, legame paterno straziante e riscatto."}
        ]
    },
    # 4. movie:483 — Cuore selvaggio (1990)
    {
        "seed": "movie:483",
        "suggerimenti": [
            {"titolo": "Blue Velvet", "anno": 1986, "perche": "Candore suburbano violato, sensualità morbosa ed estetizzante incubo noir lynchiano."},
            {"titolo": "True Romance", "anno": 1993, "perche": "Amore pulp scatenato, violenza euforica ed esaltazione romantica all'ennesima potenza."},
            {"titolo": "Natural Born Killers", "anno": 1994, "perche": "Satira mediatica allucinata, montaggio psichedelico e violenza dionisiaca incendiaria."},
            {"titolo": "Kalifornia", "anno": 1993, "perche": "Viaggio macabro on the road, rozzezza ferina e minaccia palpabile."},
            {"titolo": "Badlands", "anno": 1973, "perche": "Lirismo fiabesco glaciale, delitti impassibili e poetica deriva criminale giovanile."},
            {"titolo": "Mandy", "anno": 2018, "perche": "Vendetta psichedelica fiammeggiante, estetica heavy metal e furore allucinato lisergico."},
            {"titolo": "Perdita Durango", "anno": 1997, "perche": "Carnale violenza grottesca, humor nero spietato e folklore criminale debordante."},
            {"titolo": "Titane", "anno": 2021, "perche": "Erotismo metallico mutante, ferocia viscerale e romanticismo mostruoso perturbante."},
            {"titolo": "La bête", "anno": 1975, "perche": "Erotismo grottesco sfacciato, pulsioni selvagge e surrealismo provocatorio barocco."},
            {"titolo": "El día de la bestia", "anno": 1995, "perche": "Apocalisse satanica grottesca, comicità blasfema e caotico delirio urbano."},
            {"titolo": "Holy Motors", "anno": 2012, "perche": "Camaleontismo onirico bizzarro, follia visiva poetica ed eccesso teatrale sfrenato."},
            {"titolo": "Tokyo Fist", "anno": 1995, "perche": "Carne martoriata, rabbia urbana parossistica e violenza viscerale espressionista."},
            {"titolo": "Dobermann", "anno": 1997, "perche": "Iperviolenza cartoonesca ultravitaminica, nichilismo sfrontato ed estetica da videoclip frenetico."},
            {"titolo": "Brimstone", "anno": 2016, "perche": "Fanatismo sadico biblico, crudeltà gotica claustrofobica e terrore implacabile."},
            {"titolo": "Possession", "anno": 1981, "perche": "Delirio isterico coniugale, follia corporale parossistica e terrore emotivo lancinante."},
            {"titolo": "Santa Sangre", "anno": 1989, "perche": "Allucinazione circense sanguinaria, melodramma freudiano barocco e poesia macabra."},
            {"titolo": "Only Lovers Left Alive", "anno": 2013, "perche": "Decadenza rock-and-roll bohémien, romanticismo notturno e indolenza aristocratica magnetica."},
            {"titolo": "Bronson", "anno": 2008, "perche": "Narcisismo violento teatrale, umorismo da vaudeville grottesco e follia stilizzata."},
            {"titolo": "The Cook, the Thief, His Wife & Her Lover", "anno": 1989, "perche": "Teatralità barocca decadente, violenza sontuosa e disgusto estetico sublime."},
            {"titolo": "Dellamorte Dellamore", "anno": 1994, "perche": "Romanticismo necrofilo beffardo, surreale umorismo macabro ed estetica gotica pop."}
        ]
    },
    # 5. movie:376290 — Miss Sloane - Giochi di potere (2016)
    {
        "seed": "movie:376290",
        "suggerimenti": [
            {"titolo": "Margin Call", "anno": 2011, "perche": "Tensione finanziaria glaciale, cinismo manageriale sussurrato e lucida amoralità pragmatica."},
            {"titolo": "Michael Clayton", "anno": 2007, "perche": "Rigore morale logorato, cinismo corporativo viscido e solitudine professionale soffocante."},
            {"titolo": "Sweet Smell of Success", "anno": 1957, "perche": "Veleno verbale tagliente, opportunismo spietato ed eleganza notturna affilata."},
            {"titolo": "Glengarry Glen Ross", "anno": 1992, "perche": "Aggressività verbale disperata, darwinismo sociale e ferocia competitiva claustrofobica."},
            {"titolo": "State of Play", "anno": 2003, "perche": "Intrigo politico-giornalistico affilato, cospirazione di potere e tensione investigativa implacabile."},
            {"titolo": "Wall Street", "anno": 1987, "perche": "Avidità predatoria seducente, spregiudicatezza finanziaria e dinamismo arrogante irresistibile."},
            {"titolo": "L'Adversaire", "anno": 2002, "perche": "Borghese impostura agghiacciante, freddezza manipolatoria e vuoto morale distruttivo."},
            {"titolo": "Il capitale umano", "anno": 2013, "perche": "Avidità opportunista meschina, cinismo sociale e gelida speculazione umana."},
            {"titolo": "La Fille coupée en deux", "anno": 2007, "perche": "Cinismo borghese perverso, manipolazione intellettuale sottile e freddezza sentimentale."},
            {"titolo": "L'Appartement", "anno": 1996, "perche": "Intrigo calcolato ossessivo, architettura di menzogne e tensione sofisticata."},
            {"titolo": "Conspiracy - Soluzione finale", "anno": 2001, "perche": "Freddezza burocratica disumana, calcolo razionale spietato e macabra efficienza logica."},
            {"titolo": "In the Loop", "anno": 2009, "perche": "Frenesia diplomatica isterica, insulti taglienti e cinismo burocratico parossistico."},
            {"titolo": "The Ghost Writer", "anno": 2010, "perche": "Paranoia politica raffinata, isolamento freddo e calcolo di potere mortale."},
            {"titolo": "I... come Icaro", "anno": 1979, "perche": "Macchinazione di potere scientifica, indagine metodica glaciale e fatalismo politico."},
            {"titolo": "Quai d’Orsay", "anno": 2013, "perche": "Ritmo vertiginoso da commedia diplomatica, logorrea ministeriale e machiavellismo vanitoso."},
            {"titolo": "Locke", "anno": 2013, "perche": "Tensione metodica al telefono, crollo manageriale calcolato e lucidità disperata."},
            {"titolo": "The Debt", "anno": 2010, "perche": "Segreti di stato dolorosi, menzogna storica e trattenuta tensione etica."},
            {"titolo": "Hodejegerne", "anno": 2011, "perche": "Avidità aziendale spietata, arroganza punita ed adrenalinica caccia all'uomo."},
            {"titolo": "The Constant Gardener", "anno": 2005, "perche": "Intrigo corporativo letale, cinismo farmaceutico globale e dolorosa perdita personale."},
            {"titolo": "Festen", "anno": 1998, "perche": "Ipocrisia borghese smascherata, tensione claustrofobica implacabile e shock della verità."}
        ]
    },
    # 6. tv:90461 — Monsters & Co. La serie - Lavori in corso! (2021)
    {
        "seed": "tv:90461",
        "suggerimenti": [
            {"titolo": "The IT Crowd", "anno": 2006, "perche": "Demenzialità d'ufficio seminterrato, goffaggine nerd e slapstick comico irresistibile."},
            {"titolo": "Superstore", "anno": 2015, "perche": "Solidarietà proletaria scanzonata, pasticci aziendali quotidiani ed empatia corale calorosa."},
            {"titolo": "Parks and Recreation", "anno": 2009, "perche": "Ottimismo instancabile, burocrazia strampalata e affetto sincero tra colleghi bizzarri."},
            {"titolo": "Better Off Ted", "anno": 2009, "perche": "Satira aziendale assurda, invenzioni demenziali e farsa d'ufficio a ritmo serrato."},
            {"titolo": "Taxi", "anno": 1978, "perche": "Cameratismo da rimessa, battute bonarie e calore umano tra lavoratori sfortunati."},
            {"titolo": "Modern Times", "anno": 1936, "perche": "Catena di montaggio comica, slapstick operaio geniale e trionfo dell'umanità."},
            {"titolo": "Police Academy", "anno": 1984, "perche": "Reclute scalcinate, pasticci slapstick demenziali e allegra cooperazione di reietti."},
            {"titolo": "Camera Café", "anno": 2003, "perche": "Farsa da macchinetta del caffè, meschinità esilaranti e cazzeggio impiegatizio continuo."},
            {"titolo": "L'Aile ou la cuisse", "anno": 1976, "perche": "Comicità visiva scoppiettante, pasticci industriali burleschi e slapstick culinario goloso."},
            {"titolo": "Le Gendarme de Saint-Tropez", "anno": 1964, "perche": "Slapstick esagitato, disciplina grottesca continuamente sabotata da incompetenza gioviale."},
            {"titolo": "A Shaun the Sheep Movie: Farmageddon", "anno": 2019, "perche": "Slapstick muto ingegnoso, tenerezza aliena e caos bucolico spensierato."},
            {"titolo": "Wallace & Gromit: The Curse of the Were-Rabbit", "anno": 2005, "perche": "Invenzioni sgangherate fai-da-te, eccentrico calore britannico e slapstick irresistibile."},
            {"titolo": "Totò, Peppino e i fuorilegge", "anno": 1956, "perche": "Pasticci farseschi travolgenti, comicità d'incompetenza e complicità scalcinata verace."},
            {"titolo": "Non ci resta che piangere", "anno": 1984, "perche": "Smarrimento comico surreale, battute improvvisate e ingenua disperazione bonaria."},
            {"titolo": "Asterix & Obelix - Missione Cleopatra", "anno": 2002, "perche": "Cantiere faraonico demenziale, anacronismi esilaranti e allegra follia corale."},
            {"titolo": "I soliti ignoti", "anno": 1958, "perche": "Pasticcioni di buon cuore, piano infallibile fallimentare e comica solidarietà proletaria."},
            {"titolo": "Ernest et Célestine", "anno": 2012, "perche": "Dolcezza ribelle, amicizia innocente contro le convenzioni e candido umorismo."},
            {"titolo": "Klaus", "anno": 2019, "perche": "Postino svogliato, cooperazione comunitaria operosa e generosità che riscalda i cuori."},
            {"titolo": "The Red Green Show", "anno": 1991, "perche": "Lavori manuali improvvisati con nastro adesivo, umorismo bonario e cameratismo."},
            {"titolo": "Chicken Run", "anno": 2000, "perche": "Fuga industriale cooperativa, slapstick d'invenzione e coraggio travolgente di pennuti."}
        ]
    },
    # 7. movie:37799 — The Social Network (2010)
    {
        "seed": "movie:37799",
        "suggerimenti": [
            {"titolo": "Steve Jobs", "anno": 2015, "perche": "Ritmo teatrale implacabile, genialità narcisistica glaciale e isolamento emotivo ossessivo."},
            {"titolo": "Zodiac", "anno": 2007, "perche": "Ossessione metodica estenuante, freddezza investigativa chirurgica e alienazione cupa."},
            {"titolo": "All the President's Men", "anno": 1976, "perche": "Frenesia d'inchiesta claustrofobica, rigore analitico e tensione ritmica incalzante."},
            {"titolo": "Succession", "anno": 2018, "perche": "Veleno shakespeariano elitario, cinismo brillante spietato e voragine affettiva disperata."},
            {"titolo": "Network", "anno": 1976, "perche": "Isteria mediatica profetica, cinismo aziendale ferocissimo e logorrea corrosiva brillante."},
            {"titolo": "Moneyball", "anno": 2011, "perche": "Riforma razionale ostinata, solitudine statistica e quieta malinconia del pioniere."},
            {"titolo": "L'Ivresse du pouvoir", "anno": 2006, "perche": "Anatomia clinica dell'ambizione, freddezza dell'apparato e corruzione sottile."},
            {"titolo": "Il divo", "anno": 2008, "perche": "Monumentale cinismo del potere, enigmatico rigore stilizzato ed elettrizzante geometria."},
            {"titolo": "L'Enfer", "anno": 1994, "perche": "Discesa paranoica metodica, gelosia razionalizzata e distruzione psichica gelida."},
            {"titolo": "Le mani sulla città", "anno": 1963, "perche": "Furore speculativo chirurgico, collusione di palazzo e rigore documentario affilato."},
            {"titolo": "Indagine su un cittadino al di sopra di ogni sospetto", "anno": 1970, "perche": "Delirio di onnipotenza kafkiano, nevrosi del potere e freddo sarcasmo."},
            {"titolo": "Ex Machina", "anno": 2014, "perche": "Manipolazione intellettuale claustrofobica, paranoia algoritmica e freddezza tagliente asettica."},
            {"titolo": "BlackBerry", "anno": 2023, "perche": "Ascesa e disintegrazione tecnologica frenetica, arroganza nerd e panico operativo."},
            {"titolo": "Burning - L'amore brucia", "anno": 2018, "perche": "Alienazione giovanile rarefatta, rabbia di classe muta e gelido enigma."},
            {"titolo": "Tinker Tailor Soldier Spy", "anno": 2011, "perche": "Silenziosa paranoia burocratica, scacchi cerebrali e malinconia glaciale asfissiante."},
            {"titolo": "Anatomia di un rapimento", "anno": 1963, "perche": "Rigore procedurale implacabile, tensione morale geometrica e precisione d'indagine."},
            {"titolo": "Suburra", "anno": 2015, "perche": "Inesorabile declino metropolitano, ambizioni criminali fameliche e tragico fatalismo plumbeo."},
            {"titolo": "Carlos", "anno": 2010, "perche": "Narcisismo ideologico vorace, geopolitica frenetica e disillusione storica tagliente."},
            {"titolo": "Das Leben der Anderen", "anno": 2006, "perche": "Osservazione clinica ossessiva, asettico controllo statale e intimo risveglio morale."},
            {"titolo": "Amores perros", "anno": 2000, "perche": "Collisione urbana frenetica, fatalità destrutturata e disperata sete di rivalsa."}
        ]
    },
    # 8. tv:100883 — Non ho mai... (2020)
    {
        "seed": "tv:100883",
        "suggerimenti": [
            {"titolo": "The Edge of Seventeen", "anno": 2016, "perche": "Nevrosi adolescenziale furiosa, disperato egoismo giovanile e commovente autoironia vulnerabile."},
            {"titolo": "Lady Bird", "anno": 2017, "perche": "Scontri materni turbolenti, presunzione provinciale e nostalgia autentica del nido."},
            {"titolo": "Booksmart", "anno": 2019, "perche": "Euforia comica frenetica, ansia da prestazione scolastica e complicità travolgente."},
            {"titolo": "Clueless", "anno": 1995, "perche": "Frivolezza scintillante affettuosa, ottimismo vanitoso ed irresistibile satira bonaria."},
            {"titolo": "Awkward.", "anno": 2011, "perche": "Goffaggine liceale caustica, umiliazioni a raffica ed esuberanza narrativa confessionale."},
            {"titolo": "PEN15", "anno": 2019, "perche": "Raccapricciante realismo puberale, vergogna esilarante e tenerezza disarmante tra amiche."},
            {"titolo": "Derry Girls", "anno": 2018, "perche": "Caos adolescenziale sfacciato, isteria corale ed umorismo travolgente contagioso."},
            {"titolo": "Sex Education", "anno": 2019, "perche": "Ansia emotivo-sessuale tenera, eccentricità calorosa e franchezza disinibita liberatoria."},
            {"titolo": "La Boum", "anno": 1980, "perche": "Turbamenti romantici ingenui, ribellioni familiari garbate e dolcezza nostalgica pop."},
            {"titolo": "Heartbreak High", "anno": 2022, "perche": "Caos ormonale sfacciato, dinamiche queer vivaci e vulnerabilità adolescenziale vibrante."},
            {"titolo": "Skam", "anno": 2015, "perche": "Autenticità giovanile disarmante, ansie sociali contemporanee e profonda empatia generazionale."},
            {"titolo": "Sing Street", "anno": 2016, "perche": "Fuga musicale giovanile, romanticismo sfacciato e ottimismo ribelle contagioso."},
            {"titolo": "Incompresa", "anno": 2014, "perche": "Solitudine infantile ribelle, disperato bisogno d'amore e vivace caos familiare."},
            {"titolo": "Notte prima degli esami", "anno": 2006, "perche": "Rito di passaggio goliardico, ansia pre-maturità e calorosa nostalgia corale."},
            {"titolo": "Ovosodo", "anno": 1997, "perche": "Ironia amara toscana, crescita tra sfortune quotidiane e vitalismo malinconico."},
            {"titolo": "Submarine", "anno": 2010, "perche": "Arroganza intellettuale acerba, fobie sentimentali e comica malinconia stilizzata."},
            {"titolo": "Vi är bäst!", "anno": 2013, "perche": "Ribellione punk sgangherata, complicità femminile indomita e pura allegria vitale."},
            {"titolo": "Diabolo menthe", "anno": 1977, "perche": "Innocenza scolastica complice, primi amori acerbi e garbata ribellione adolescenziale."},
            {"titolo": "The Inbetweeners", "anno": 2008, "perche": "Goffaggine ormonale catastrofica, umiliazioni scolastiche grottesche e disperato cameratismo."},
            {"titolo": "Skins", "anno": 2007, "perche": "Eccessi giovanili sregolati, ferite emotive nascoste e viscerale solidarietà ribelle."}
        ]
    },
    # 9. movie:599 — Viale del tramonto (1950)
    {
        "seed": "movie:599",
        "suggerimenti": [
            {"titolo": "All About Eve", "anno": 1950, "perche": "Ambizione teatrale famelica, cinismo scintillante e velenosa crudeltà tra primedonne."},
            {"titolo": "What Ever Happened to Baby Jane?", "anno": 1962, "perche": "Macabra demenza claustrofobica, odio fraterno senile e grottesco declino divistico."},
            {"titolo": "Mulholland Drive", "anno": 2001, "perche": "Incubo losangelino allucinato, illusioni spezzate del cinema e disintegrazione identitaria."},
            {"titolo": "The Player", "anno": 1992, "perche": "Cinismo spietato hollywoodiano, amoralità compiaciuta e satira brillante dell'industria cinematografica."},
            {"titolo": "The Bad and the Beautiful", "anno": 1952, "perche": "Manipolazione mefistofelica affascinante, opportunismo sfrenato e grandezza tragica del cinema."},
            {"titolo": "Ace in the Hole", "anno": 1951, "perche": "Sciacallaggio mediatico implacabile, cinismo velenoso e feroce disprezzo morale wilderiano."},
            {"titolo": "Bellissima", "anno": 1951, "perche": "Illusione cinematografica crudele, sfruttamento delle speranze e doloroso disincanto materno."},
            {"titolo": "La grande bellezza", "anno": 2013, "perche": "Decadenza barocca disillusa, nostalgia elegiaca e vuoto dorato della mondanità."},
            {"titolo": "Vargtimmen", "anno": 1968, "perche": "Angoscia artistica divorante, spettri aristocratici decadenti e follia allucinata notturna."},
            {"titolo": "Les Yeux sans visage", "anno": 1960, "perche": "Orrore lirico decadente, ossessione chirurgica gelida e tragica bellezza spettrale."},
            {"titolo": "La voce della luna", "anno": 1990, "perche": "Nostalgia lunare malinconica, follia visionaria poetica e tramonto delle illusioni."},
            {"titolo": "Io la conoscevo bene", "anno": 1965, "perche": "Solitudine spietata del successo effimero, vacuità del sottobosco dello spettacolo."},
            {"titolo": "La signora di tutti", "anno": 1934, "perche": "Melodramma fatale di una diva, rovina dorata e cupa maledizione."},
            {"titolo": "I vampiri", "anno": 1957, "perche": "Nobildonna ossessionata dalla giovinezza perduta, orrore gotico e macabra vanità senile."},
            {"titolo": "Lili Marleen", "anno": 1981, "perche": "Glamour decadente tossico, ascesa canora nel regime e tragica illusione dorata."},
            {"titolo": "Maps to the Stars", "anno": 2014, "perche": "Tossicità hollywoodiana delirante, fantasmi incestuosi e putrefazione morale dell'ego."},
            {"titolo": "Peeping Tom", "anno": 1960, "perche": "Morbosa fascinazione dello sguardo, solitudine assassina ed ossessione cinematografica fatale."},
            {"titolo": "The Red Shoes", "anno": 1948, "perche": "Fanatismo artistico divorante, delirio estetico sublime e sacrificio teatrale mortale."},
            {"titolo": "The Ruling Class", "anno": 1972, "perche": "Follia aristocratica grottesca, humor nero spietato e decadenza macabra velenosa."},
            {"titolo": "Irma Vep", "anno": 1996, "perche": "Caos nevrotico sul set, alienazione cinematografica e fascinazione notturna spettrale."}
        ]
    },
    # 10. tv:1621 — Boardwalk Empire - L'impero del crimine (2010)
    {
        "seed": "tv:1621",
        "suggerimenti": [
            {"titolo": "Peaky Blinders", "anno": 2013, "perche": "Ambizione criminale viscerale, fumo industriale, ferocia stilizzata e tormento tragico."},
            {"titolo": "The Sopranos", "anno": 1999, "perche": "Cupa decadenza morale, violenza mafiosa quotidiana e pesante fatalismo esistenziale."},
            {"titolo": "Miller's Crossing", "anno": 1990, "perche": "Etica malavitosa labirintica, cinismo elegante e fatalismo plumbeo tra boschi."},
            {"titolo": "Deadwood", "anno": 2004, "perche": "Eloquenza shakespeariana brutale, fondazione sanguinosa della legge e fango morale ferino."},
            {"titolo": "The Godfather", "anno": 1972, "perche": "Solennità operatica funerea, corruzione dinastica inesorabile e maestosa liturgia mafiosa."},
            {"titolo": "Gangs of New York", "anno": 2002, "perche": "Carniceria primordiale tribale, corruzione politica sfacciata e violenza barbara teatrale."},
            {"titolo": "C'era una volta in America", "anno": 1984, "perche": "Elegia nostalgica straziante, tradimento fraterno e marcescenza del sogno americano."},
            {"titolo": "Gomorra - La serie", "anno": 2014, "perche": "Nichilismo criminale asfissiante, ferocia belluina senza redenzione e claustrofobia plumbea."},
            {"titolo": "Romanzo criminale - La serie", "anno": 2008, "perche": "Sete di potere travolgente, ascesa spietata e tragico disfacimento fraterno."},
            {"titolo": "Il conformista", "anno": 1970, "perche": "Seduzione visiva fascista, viltà morale calcolata e decadente oppressione psicologica."},
            {"titolo": "Vallanzasca - Gli angeli del male", "anno": 2010, "perche": "Fascino malavitoso spavaldo, rapine frenetiche e parabola criminale sanguinaria."},
            {"titolo": "Babylon Berlin", "anno": 2017, "perche": "Decadenza weimariana dorata, cospirazioni nere e marciume morale pre-bellico."},
            {"titolo": "M", "anno": 1931, "perche": "Paranoia urbana soffocante, sindacato criminale all'opera e giudizio morale ferale."},
            {"titolo": "La Scoumoune", "anno": 1972, "perche": "Fatalismo noir solenne, onore criminale crepuscolare e violenza silenziosa implacabile."},
            {"titolo": "Un prophète", "anno": 2009, "perche": "Apprendistato criminale claustrofobico, ascesa spietata e realismo carcerario glaciale."},
            {"titolo": "Le Samouraï", "anno": 1967, "perche": "Rigore cerimoniale glaciale, solitudine solenne dell'assassino e fatalismo geometrico."},
            {"titolo": "Nameless Gangster", "anno": 2012, "perche": "Opportunismo mafioso viscido, collusione col potere e decadenza tragicomica."},
            {"titolo": "Taboo", "anno": 2017, "perche": "Oscurità mercantile putrida, complotti imperiali marci e violenza viscerale cupa."},
            {"titolo": "The Long Good Friday", "anno": 1980, "perche": "Superbia malavitosa brutale, crollo violento di un impero ed epilogo tragico."},
            {"titolo": "Eastern Promises", "anno": 2007, "perche": "Ritualità mafiosa russa glaciale, brutalità corporea e tormentata redenzione silenziosa."}
        ]
    },
    # 11. movie:548 — Rashomon (1950)
    {
        "seed": "movie:548",
        "suggerimenti": [
            {"titolo": "Ikiru", "anno": 1952, "perche": "Angoscia della finitezza, risveglio morale straziante e disperata ricerca di senso."},
            {"titolo": "12 Angry Men", "anno": 1957, "perche": "Dubbio morale claustrofobico, scontro psicologico furioso e ricerca ostinata della verità."},
            {"titolo": "Blow-Up", "anno": 1966, "perche": "Inafferrabilità del reale, enigma percettivo ossessivo e svanire della certezza oggettiva."},
            {"titolo": "L'avventura", "anno": 1960, "perche": "Sparizione inspiegabile, angoscia esistenziale rarefatta e vuoto morale dei sentimenti."},
            {"titolo": "Harakiri", "anno": 1962, "perche": "Ipocrisia feudale smascherata, disperazione feroce e rituale tragico implacabile."},
            {"titolo": "Onibaba - Le assassine", "anno": 1964, "perche": "Terrore atavico tra le canne, disperazione ferina e maschera demoniaca dell'inganno."},
            {"titolo": "Cure", "anno": 1997, "perche": "Ipnosi del male, perdita dell'identità e contagioso nichilismo psicologico agghiacciante."},
            {"titolo": "I racconti della luna pallida d'agosto", "anno": 1953, "perche": "Illusione spettrale seducente, vanità delle ambizioni umane e amaro rimorso."},
            {"titolo": "Persona", "anno": 1966, "perche": "Sdoppiamento psicologico lacerante, crollo delle maschere e tormento esistenziale abissale."},
            {"titolo": "Det sjunde inseglet", "anno": 1957, "perche": "Partita a scacchi con la morte, silenzio di Dio e terrore metafisico."},
            {"titolo": "Jeder für sich und Gott gegen alle", "anno": 1974, "perche": "Incomprensione crudele dell'innocenza, alienazione sociale e mistero imperscrutabile dell'anima."},
            {"titolo": "Stalker", "anno": 1979, "perche": "Pellegrinaggio metafisico desolato, fede vacillante e desiderio umano più recondito."},
            {"titolo": "Incendies", "anno": 2010, "perche": "Rivelazione straziante dell'orrore, mistero familiare atavico e dolorosa catarsi tragica."},
            {"titolo": "The Usual Suspects", "anno": 1995, "perche": "Inganno caleidoscopico brillante, verità manipolata e trionfo della menzogna soggettiva."},
            {"titolo": "Hero", "anno": 2002, "perche": "Versioni contraddittorie della verità, prospettive cromatiche e sublime sacrificio filosofico."},
            {"titolo": "Courage Under Fire", "anno": 1996, "perche": "Versioni discordanti del trauma bellico, indagine etica e riscatto morale tormentato."},
            {"titolo": "The Crucible", "anno": 1996, "perche": "Isteria inquisitoria collettiva, menzogne contagiose e difesa intransigente dell'onore morale."},
            {"titolo": "The Last Duel", "anno": 2021, "perche": "Tre verità soggettive inconciliabili, violenza patriarcale e tragica presunzione maschile."},
            {"titolo": "Una separazione", "anno": 2011, "perche": "Verità parziali strazianti, collasso etico relazionale e dolore morale senza colpevoli."},
            {"titolo": "La Jetée", "anno": 1962, "perche": "Memoria frammentata traumatica, vertigine del tempo e destino circolare ineluttabile."}
        ]
    },
    # 12. movie:4032 — Papà, ho trovato un amico (1991)
    {
        "seed": "movie:4032",
        "suggerimenti": [
            {"titolo": "Stand by Me", "anno": 1986, "perche": "Nostalgia estiva struggente, cameratismo infantile e precoce scoperta della perdita."},
            {"titolo": "Bridge to Terabithia", "anno": 2007, "perche": "Fantasia infantile luminosa, complicità pura e improvviso dolore lacerante dell'assenza."},
            {"titolo": "The Florida Project", "anno": 2017, "perche": "Spensieratezza infantile radiosa, ombre della precarietà ed empatia commovente universale."},
            {"titolo": "Moonrise Kingdom", "anno": 2012, "perche": "Fuga romantica precoce, innocenza eccentrica e solitudine infantile teneramente condivisa."},
            {"titolo": "To Kill a Mockingbird", "anno": 1962, "perche": "Sguardo infantile puro, perdita dell'innocenza e nobile calore protettivo paterno."},
            {"titolo": "Dead Poets Society", "anno": 1989, "perche": "Risveglio dell'anima giovanile, fervore poetico e tragico tributo alla libertà."},
            {"titolo": "Nuovo Cinema Paradiso", "anno": 1988, "perche": "Nostalgia struggente dell'infanzia, amicizia indissolubile e lacrime per il passato."},
            {"titolo": "Ponette", "anno": 1996, "perche": "Elaborazione straziante del lutto infantile, candore disperato e fede ingenua incrollabile."},
            {"titolo": "Aniki-Bóbó", "anno": 1942, "perche": "Giochi infantili per strada, primi amori innocenti e paura del pericolo."},
            {"titolo": "Jojo Rabbit", "anno": 2019, "perche": "Candore infantile grottesco, tragedia della guerra e commovente risveglio etico."},
            {"titolo": "Petite Maman", "anno": 2021, "perche": "Incontro magico tra bambine, lutto sommesso e tenerezza consolatoria infinita."},
            {"titolo": "Il mio vicino Totoro", "anno": 1988, "perche": "Meraviglia infantile estiva, paura della malattia materna e conforto fiabesco protettivo."},
            {"titolo": "Billy Elliot", "anno": 2000, "perche": "Passione pura infantile, riscatto comunitario e commovente tenerezza familiare ferita."},
            {"titolo": "Whistle Down the Wind", "anno": 1961, "perche": "Innocenza ingenua dei bambini, fede commovente e disincanto inevitabile del mondo."},
            {"titolo": "Un sac de billes", "anno": 1975, "perche": "Infanzia in fuga fraterna, sguardi innocenti e tenacia affettuosa infantile."},
            {"titolo": "Io non ho paura", "anno": 2003, "perche": "Estate accecante di grano, lealtà infantile segreta e orrore degli adulti."},
            {"titolo": "My Life Without Me", "anno": 2003, "perche": "Dolcezza straziante di fronte all'addio, amore protettivo e malinconia luminosa."},
            {"titolo": "Pelle erobreren", "anno": 1987, "perche": "Legame padre-figlio indissolubile, durezza del mondo e tenerezza resiliente."},
            {"titolo": "Kes", "anno": 1969, "perche": "Fragile rifugio emotivo, amore per un falco e desolazione proletaria."},
            {"titolo": "Giochi proibiti", "anno": 1952, "perche": "Rito funebre infantile innocente, candore dinanzi alla tragedia della guerra."}
        ]
    },
    # 13. movie:1368337 — Odissea (2026)
    {
        "seed": "movie:1368337",
        "suggerimenti": [
            {"titolo": "Interstellar", "anno": 2014, "perche": "Ambizione cosmica maestosa, amore metafisico straziante ed epica sopravvivenza temporale."},
            {"titolo": "Dune", "anno": 2021, "perche": "Monumentalità mistica solenne, fatalismo messianico opprimente e respiro visivo titanico."},
            {"titolo": "2001: A Space Odyssey", "anno": 1968, "perche": "Enigma cosmico glaciale, solennità filosofica primordiale ed estasi visiva trascendente."},
            {"titolo": "The Right Stuff", "anno": 1983, "perche": "Eroismo pionieristico travolgente, sfida all'ignoto e vertigine stoica del superamento."},
            {"titolo": "Lawrence of Arabia", "anno": 1962, "perche": "Epica desertica titanica, delirio di onnipotenza e tormento esistenziale smisurato."},
            {"titolo": "Ran", "anno": 1985, "perche": "Furia apocalittica maestosa, follia dinastica e disperato silenzio degli dèi."},
            {"titolo": "Kagemusha", "anno": 1980, "perche": "Tragedia regale imponente, destino ineluttabile e dissoluzione epica di un sogno."},
            {"titolo": "Aguirre, der Zorn Gottes", "anno": 1972, "perche": "Folle spedizione fluviale allucinata, megalomania distruttiva e grandezza disperata nella giungla."},
            {"titolo": "Solaris", "anno": 1972, "perche": "Tormento della memoria cosmica, oceano senziente e lutto metafisico inaccessibile."},
            {"titolo": "Apocalypse Now", "anno": 1979, "perche": "Viaggio dantesco nell'abisso, grandiosità wagneriana e discesa nell'orrore primordiale."},
            {"titolo": "The Tree of Life", "anno": 2011, "perche": "Lirismo cosmogonico vertiginoso, grazia spirituale e silenziosa preghiera dell'uomo finito."},
            {"titolo": "Master and Commander: The Far Side of the World", "anno": 2003, "perche": "Cameratismo navale stoico, rigore marittimo implacabile e tenacia scientifico-militare sublime."},
            {"titolo": "Il ritorno", "anno": 2003, "perche": "Severità paterna arcaica, rito di passaggio mitico e mistero doloroso."},
            {"titolo": "Fitzcarraldo", "anno": 1982, "perche": "Sfida titanica all'impossibile, opera lirica nella foresta e trionfo d'ostinazione visionaria."},
            {"titolo": "La Grande Illusion", "anno": 1937, "perche": "Nobiltà d'animo al crepuscolo, fratellanza tragica e dignità stoica tra rovine."},
            {"titolo": "1917", "anno": 2019, "perche": "Corsa contro il tempo viscerale, missione disperata ininterrotta e pietà bellica."},
            {"titolo": "Le Grand Bleu", "anno": 1988, "perche": "Attrazione mistica dell'abisso marino, isolamento contemplativo e resa all'infinito."},
            {"titolo": "Nausicaä della Valle del vento", "anno": 1984, "perche": "Catastrofe ecologica titanica, misticismo sacrificale e determinazione messianica solenne."},
            {"titolo": "Il vangelo secondo Matteo", "anno": 1964, "perche": "Sacralità arcaica scabbra, severità morale intransigente ed epica biblica rivoluzionaria."},
            {"titolo": "Aleksandr Nevskij", "anno": 1938, "perche": "Epica titanica patriottica, solennità corale maestosa e scontro campale mitologico."}
        ]
    },
    # 14. movie:937287 — Challengers (2024)
    {
        "seed": "movie:937287",
        "suggerimenti": [
            {"titolo": "Call Me by Your Name", "anno": 2017, "perche": "Sensualità estiva travolgente, desiderio palpitante e languida malinconia carnale."},
            {"titolo": "Uncut Gems", "anno": 2019, "perche": "Tachicardia adrenalinica incessante, azzardo autodistruttivo frenetico e tensione febbrile parossistica."},
            {"titolo": "Whiplash", "anno": 2014, "perche": "Perfezionismo sadico brutale, ritmo jazz sincopato e duello psicologico spietato."},
            {"titolo": "Cruel Intentions", "anno": 1999, "perche": "Cinismo seduttivo spregiudicato, scommesse amorose crudeli e sensualità pop decadente."},
            {"titolo": "Black Swan", "anno": 2010, "perche": "Ossessione fisica paranoica, estasi performativa autodistruttiva e sensualità oscura viscerale."},
            {"titolo": "Drive", "anno": 2011, "perche": "Sintetizzatori ipnotici notturni, romanticismo laconico ed esplosioni improvvise di violenza stilizzata."},
            {"titolo": "Baby Driver", "anno": 2017, "perche": "Cinetismo musicale coreografico, adrenalina al volante e ritmo cardiaco incalzante."},
            {"titolo": "La Pianiste", "anno": 2001, "perche": "Repressione sessuale perversa, duello carnale sadomasochista e gelida frenesia punitiva."},
            {"titolo": "Climax", "anno": 2018, "perche": "Delirio coreografico lisergico, trance collettiva dionisiaca e caos ritmico claustrofobico."},
            {"titolo": "Passages", "anno": 2023, "perche": "Narcisismo sentimentale tossico, attrito erotico compulsivo e instabilità passionale cruda."},
            {"titolo": "Mad Max: Fury Road", "anno": 2015, "perche": "Moto perpetuo cinetico, energia visiva incendiaria e adrenalina operistica travolgente."},
            {"titolo": "Mademoiselle", "anno": 2016, "perche": "Erotismo barocco raffinato, doppi giochi seduttivi e tensione sensuale ipnotica."},
            {"titolo": "Lola rennt", "anno": 1998, "perche": "Corsa techno al cardiopalma, fatalismo cinetico pulsante e montaggio al fulmicotone."},
            {"titolo": "Jules et Jim", "anno": 1962, "perche": "Triangolo amoroso vorticoso, giovinezza impetuosa e tirannia affascinante della passione."},
            {"titolo": "Swimming Pool", "anno": 2003, "perche": "Seducente indolenza estiva, mistero erotico perturbante e rivalità psicologica sottile."},
            {"titolo": "Y tu mamá también", "anno": 2001, "perche": "Erotismo giovanile sfrenato, rivalità fraterna complice e pulsione vitale malinconica."},
            {"titolo": "Angeli perduti", "anno": 1995, "perche": "Neon ipnotici allucinati, solitudine notturna ipersensuale e ritmo vertiginoso frammentato."},
            {"titolo": "Senso", "anno": 1954, "perche": "Melodramma carnale febbrile, tradimento patriottico per bramosia e passione distruttiva."},
            {"titolo": "La Reine Margot", "anno": 1994, "perche": "Furia sanguinaria sensuale, intrigo politico viscerale ed estetizzazione carnale della morte."},
            {"titolo": "Victoria", "anno": 2015, "perche": "Piano sequenza al cardiopalma, notte berlinese euforica e adrenalina pura."}
        ]
    },
    # 15. movie:7305 — Alive - Sopravvissuti (1993)
    {
        "seed": "movie:7305",
        "suggerimenti": [
            {"titolo": "127 Hours", "anno": 2010, "perche": "Agonia fisica allucinata, tenacia disperata e catartica liberazione dell'istinto vitale."},
            {"titolo": "Cast Away", "anno": 2000, "perche": "Solitudine oceanica ascetica, sopravvivenza muta e doloroso attaccamento alla speranza."},
            {"titolo": "All Is Lost", "anno": 2013, "perche": "Naufragio stoico silenzioso, lotta implacabile contro elementi e dignità terminale."},
            {"titolo": "The Flight of the Phoenix", "anno": 1965, "perche": "Disperazione nel deserto, attriti psicologici tra naufraghi e caparbia ingegneria."},
            {"titolo": "The Grey", "anno": 2011, "perche": "Freddo polare spietato, fatalismo filosofico e sfida fiera alla morte ineluttabile."},
            {"titolo": "Deliverance", "anno": 1972, "perche": "Regressione primordiale feroce, incubo fluviale e trauma indelebile della sopravvivenza."},
            {"titolo": "Arctic", "anno": 2018, "perche": "Solitudine artica glaciale, ostinata resistenza fisica e disperata lotta per la vita."},
            {"titolo": "Das Boot", "anno": 1981, "perche": "Terrore claustrofobico sottomarino, logorio dei nervi ed estenuante agonia d'acciaio."},
            {"titolo": "Il deserto dei Tartari", "anno": 1976, "perche": "Attesa metafisica solenne, austerità militare e inesorabile scorrere del tempo."},
            {"titolo": "Dersu Uzala", "anno": 1975, "perche": "Comunione spirituale con la taiga, fratellanza umile e rispetto della natura."},
            {"titolo": "Kon-Tiki", "anno": 2012, "perche": "Odissea oceanica coraggiosa, fede nell'ignoto ed epica navigazione su tronchi."},
            {"titolo": "Kapringen", "anno": 2012, "perche": "Tensione psicologica estenuante, agonia dell'attesa e logorio morale asfissiante."},
            {"titolo": "Un condamné à mort s'est échappé", "anno": 1956, "perche": "Ascetismo metodico della fuga, rigore spirituale assoluto e tensione dell'anima."},
            {"titolo": "Le Trou", "anno": 1960, "perche": "Fratellanza carceraria meticolosa, sforzo fisico estenuante e tensione millimetrica."},
            {"titolo": "Nordwand", "anno": 2008, "perche": "Gelida agonia sulla parete dell'Eiger, disperazione verticale e morte implacabile."},
            {"titolo": "The Naked Prey", "anno": 1965, "perche": "Inseguimento primordiale implacabile, sopravvivenza nuda e resistenza fisica pura."},
            {"titolo": "Sanctum", "anno": 2011, "perche": "Claustrofobia speleologica brutale, decisioni estreme per vivere e abisso sommerso."},
            {"titolo": "Il grande silenzio", "anno": 1968, "perche": "Neve ostile crudele, fatalismo gelido e disperazione senza redenzione morale."},
            {"titolo": "The Way Back", "anno": 2010, "perche": "Cammino titanico verso la libertà, logorio fisico e stoica solidarietà umana."},
            {"titolo": "Everest", "anno": 2015, "perche": "Bufera mortale d'alta quota, hubris umana punita e tragico congelamento."}
        ]
    },
    # 16. movie:9394 — Lo chiamavano Trinità... (1970)
    {
        "seed": "movie:9394",
        "suggerimenti": [
            {"titolo": "I due superpiedi quasi piatti", "anno": 1977, "perche": "Rissa scanzonata irresistibile, scazzottate bonarie e cameratismo sgangherato solare."},
            {"titolo": "...altrimenti ci arrabbiamo!", "anno": 1974, "perche": "Schiaffoni corali leggendari, ostinazione fanciullesca per una dune buggy e spasso."},
            {"titolo": "Butch Cassidy and the Sundance Kid", "anno": 1969, "perche": "Ironia picaresca brillante, complicità sorniona tra fuorilegge e irresistibile leggerezza."},
            {"titolo": "Blazing Saddles", "anno": 1974, "perche": "Burlesque western anarchico, parodia demenziale e caotico divertimento dissacrante."},
            {"titolo": "Support Your Local Sheriff!", "anno": 1969, "perche": "Svogliatezza geniale, disinvoltura pigra nel West e comicità rilassata bonaria."},
            {"titolo": "Maverick", "anno": 1994, "perche": "Baro fascinoso sornione, avventure western rilassate e umorismo brillante sfacciato."},
            {"titolo": "Il mio nome è Nessuno", "anno": 1973, "perche": "Beffarda riverenza al mito western, umorismo picaresco e allegre sparatorie."},
            {"titolo": "I pompieri", "anno": 1985, "perche": "Pasticci farseschi corali, cialtroneria affettuosa e comicità slapstick all'italiana."},
            {"titolo": "Amici miei", "anno": 1975, "perche": "Zingarate goliardiche beffarde, sberleffo spensierato e cameratismo contro la malinconia."},
            {"titolo": "Attila flagello di Dio", "anno": 1982, "perche": "Barbarie farsesca demenziale, comicità cialtrona verace e irresistibile idiozia slapstick."},
            {"titolo": "O Brother, Where Art Thou?", "anno": 2000, "perche": "Odissea picaresca scanzonata, furbastri canterini e scanzonato folklore rurale."},
            {"titolo": "The Frisco Kid", "anno": 1979, "perche": "Amicizia improbabile nel West, candore yiddish bonario e complicità da bisticcio."},
            {"titolo": "Les Charlots font l'Espagne", "anno": 1972, "perche": "Disastri comici vacanzieri, comicità da villaggio turistico e slapstick sguaiato."},
            {"titolo": "Le Corniaud", "anno": 1965, "perche": "Candido allocco raggirato, farsa transalpina spigliata e risate in viaggio."},
            {"titolo": "I picari", "anno": 1987, "perche": "Vagabondaggio picaresco straccione, fame atavica e risate di sopravvivenza."},
            {"titolo": "The Guard", "anno": 2011, "perche": "Poliziotto irlandese pigro e scorretto, humour caustico e bonaria disillusione."},
            {"titolo": "Il buono, il matto, il cattivo", "anno": 2008, "perche": "Farsa d'azione pirotecnica, inseguimenti folli nel deserto e buffoneria scatenata."},
            {"titolo": "Le Magnifique", "anno": 1973, "perche": "Parodia spionistica spassosa, goffaggine dello scrittore e vanterie comiche."},
            {"titolo": "Kung Fusion", "anno": 2004, "perche": "Cartoonesca esagerazione marziale, slapstick travolgente e candido cuore da fumetto."},
            {"titolo": "The Dish", "anno": 2000, "perche": "Calore provinciale rilassato, incompetenza bonaria e genuina simpatia comunitaria."}
        ]
    },
    # 17. tv:21510 — White Collar - Fascino criminale (2009)
    {
        "seed": "tv:21510",
        "suggerimenti": [
            {"titolo": "Catch Me If You Can", "anno": 2002, "perche": "Truffe sfolgoranti con sorriso, eleganza Anni Sessanta e affettuoso inseguimento tra gentiluomini."},
            {"titolo": "Ocean's Eleven", "anno": 2001, "perche": "Fascino sornione corale, rapina sofisticata impeccabile e brio sfavillante irresistibile."},
            {"titolo": "The Thomas Crown Affair", "anno": 1999, "perche": "Seduzione ad alto bordo, furti d'arte audaci ed erotico duello intellettuale."},
            {"titolo": "To Catch a Thief", "anno": 1955, "perche": "Fascino sulla Costa Azzurra, ironia aristocratica e ladro gentiluomo impeccabile."},
            {"titolo": "The Art of the Steal", "anno": 2013, "perche": "Furtivo colpo d'arte geniale, doppi giochi fraterni e spigliata commedia truffaldina."},
            {"titolo": "Suits", "anno": 2011, "perche": "Eleganza sartoriale impeccabile, schermaglie legali brillanti e complicità da maestri del bluff."},
            {"titolo": "Lupin", "anno": 2021, "perche": "Ladro gentiluomo moderno, travestimenti ingegnosi e vendetta con classe parigina."},
            {"titolo": "Hustle", "anno": 2004, "perche": "Truffe sofisticate contro i corrotti, regia scintillante e fascino londinese disinvolto."},
            {"titolo": "Sherlock Holmes", "anno": 2009, "perche": "Deduzione brillante scattante, cameratismo eccentrico e azione d'epoca con ritmo."},
            {"titolo": "Lupin III - Il castello di Cagliostro", "anno": 1979, "perche": "Cavalleria romantica guascona, furti mirabolanti e pura gioia dell'avventura."},
            {"titolo": "Du rififi chez les hommes", "anno": 1955, "perche": "Eleganza criminale leggendaria, colpo perfetto millimetrico e stile noir compassato."},
            {"titolo": "I tartassati", "anno": 1959, "perche": "Schermaglie garbate tra evasore e finanziere, duello comico di reciproca stima."},
            {"titolo": "Operazione San Gennaro", "anno": 1966, "perche": "Furto del tesoro scanzonato, furbizia partenopea e brio comico irresistibile."},
            {"titolo": "L'Incorrigible", "anno": 1975, "perche": "Guasconeria seducente inarrestabile, furti di quadri e fascino sbarazzino di Belmondo."},
            {"titolo": "The Italian Job", "anno": 1969, "perche": "Eleganza pop Anni Sessanta, colpo infallibile a Torino e stile sbarazzino."},
            {"titolo": "The Thieves", "anno": 2012, "perche": "Rapina al casinò pirotecnica, fascino glamour asiatico e doppi giochi acrobatici."},
            {"titolo": "Bob le flambeur", "anno": 1956, "perche": "Charme da casinò notturno, eleganza disillusa e rapina sofisticata."},
            {"titolo": "Guardie e ladri", "anno": 1951, "perche": "Duello bonario tra inseguitore e truffatore, simpatia umana reciproca."},
            {"titolo": "La casa de papel", "anno": 2017, "perche": "Rapina spettacolare ingegnosa, piano millimetrico brillante e fascino del Professore."},
            {"titolo": "Arsène Lupin", "anno": 2004, "perche": "Fascino aristocratico d'epoca, ladro gentiluomo spericolato e avventura spigliata."}
        ]
    },
    # 18. movie:330459 — Rogue One: A Star Wars Story (2016)
    {
        "seed": "movie:330459",
        "suggerimenti": [
            {"titolo": "The Dirty Dozen", "anno": 1967, "perche": "Missione suicida di reprobi, cameratismo aspro e sacrificio militare implacabile."},
            {"titolo": "Black Hawk Down", "anno": 2001, "perche": "Realismo bellico claustrofobico, polvere soffocante e solidarietà disperata sotto assedio."},
            {"titolo": "Dunkirk", "anno": 2017, "perche": "Urgenza temporale martellante, sopravvivenza disperata su spiagge desolate e dignità collettiva."},
            {"titolo": "Saving Private Ryan", "anno": 1998, "perche": "Brutalità tattile dello sbarco, solennità del dovere e nobiltà del sacrificio."},
            {"titolo": "Fury", "anno": 2014, "perche": "Fango claustrofobico di un carro armato, disillusione bellica e ultima resistenza stoica."},
            {"titolo": "Lone Survivor", "anno": 2013, "perche": "Fratellanza sotto fuoco incrociato, agonia montuosa e tenacia militare estenuante."},
            {"titolo": "Monsters", "anno": 2010, "perche": "Paesaggio alieno desolato, tensione sommessa intima e fatalismo poetico di viaggio."},
            {"titolo": "Va' e vedi", "anno": 1985, "perche": "Incubo sensoriale allucinante della guerra, orrore bellico e perdita dell'anima."},
            {"titolo": "La battaglia di Algeri", "anno": 1966, "perche": "Guerriglia urbana febbrile, rigore insurrezionale e tragica fatalità storica dello scontro."},
            {"titolo": "The Heroes of Telemark", "anno": 1965, "perche": "Sabotaggio partigiano sui ghiacci, missione cruciale sotto copertura e tensione solenne."},
            {"titolo": "The Bridge on the River Kwai", "anno": 1957, "perche": "Follia del dovere militare, ossessione morale e distruzione tragica finale."},
            {"titolo": "Capitaine Conan", "anno": 1996, "perche": "Furia guerriera ancestrale nel fango, ferocia primordiale e vuoto del dopoguerra."},
            {"titolo": "Lebanon", "anno": 2009, "perche": "Terrore claustrofobico dentro una torretta, fumo asfissiante e angoscia viscerale."},
            {"titolo": "L'Armée des ombres", "anno": 1969, "perche": "Resistenza clandestina tragica, solitudine gelida e sacrificio muto senza gloria."},
            {"titolo": "The Beast of War", "anno": 1988, "perche": "Caccia nel deserto afghano, claustrofobia d'acciaio e follia bellica implacabile."},
            {"titolo": "Sotto due bandiere", "anno": 2004, "perche": "Furore fraterno nella trincea, devastazione sanguinosa e martirio bellico straziante."},
            {"titolo": "9th Company", "anno": 2005, "perche": "Fratellanza di giovani reclute nel calvario afghano, sacrificio disperato dimenticato."},
            {"titolo": "Under sandet", "anno": 2015, "perche": "Sminamento forzato di giovani prigionieri, tensione costante e dolorosa pietà umana."},
            {"titolo": "Gallipoli", "anno": 1981, "perche": "Idealismo giovanile sacrificato nel fango, cameratismo fraterno e massacro assurdo."},
            {"titolo": "Stalingrad", "anno": 1993, "perche": "Inverno spietato nella neve, disumanizzazione bellica e disperazione mortale."}
        ]
    },
    # 19. movie:198375 — Il giardino delle parole (2013)
    {
        "seed": "movie:198375",
        "suggerimenti": [
            {"titolo": "5 cm al secondo", "anno": 2007, "perche": "Distanza incolmabile malinconica, tempo che scorre e dolorosa poesia dei petali."},
            {"titolo": "In the Mood for Love", "anno": 2000, "perche": "Desiderio soffocato tra le ombre, sensualità trattenuta e straziante nostalgia."},
            {"titolo": "Past Lives", "anno": 2023, "perche": "Destino mancato sussurrato, sguardi carichi di rimpianto e struggente intesa silenziosa."},
            {"titolo": "Viaggio a Tokyo", "anno": 1953, "perche": "Malinconia rarefatta domestica, rassegnazione gentile e muta solitudine della vecchiaia."},
            {"titolo": "Brief Encounter", "anno": 1945, "perche": "Amore proibito trattenuto con strazio, compostezza borghese e lacrime alla stazione."},
            {"titolo": "Portrait de la jeune fille en feu", "anno": 2019, "perche": "Sguardi ardenti trattenuti, pittura dei sentimenti e bellezza fugace incancellabile."},
            {"titolo": "La Forma della Voce", "anno": 2016, "perche": "Espiazione dolorosa silenziosa, redenzione emotiva e timida vulnerabilità giovanile."},
            {"titolo": "Pioggia di ricordi", "anno": 1991, "perche": "Nostalgia estiva rurale, ricordi d'infanzia riemersi e quieta riscoperta di sé."},
            {"titolo": "Drive My Car", "anno": 2021, "perche": "Lutto elaborato al volante, conversazioni intime sussurrate e catarsi silenziosa."},
            {"titolo": "Hiroshima mon amour", "anno": 1959, "perche": "Memoria traumatica lacerante, lirismo poetico della perdita e amore doloroso."},
            {"titolo": "La double vie de Véronique", "anno": 1991, "perche": "Intuizione metafisica misteriosa, solitudine melodica e lirica grazia sospesa."},
            {"titolo": "Zimna wojna", "anno": 2018, "perche": "Passione tormentata dalla storia, fredda eleganza musicale e destino romantico fatale."},
            {"titolo": "Brokeback Mountain", "anno": 2005, "perche": "Amore clandestino straziante, silenzi del paesaggio e segreta devozione disperata."},
            {"titolo": "Paterson", "anno": 2016, "perche": "Poesia della routine quotidiana, serenità contemplativa e sguardo incantato sulle piccole cose."},
            {"titolo": "Carol", "anno": 2015, "perche": "Sguardi vellutati d'inverno, passione trattenuta sotto la pelliccia e nobile pudore."},
            {"titolo": "Before Sunrise", "anno": 1995, "perche": "Notte viennese effimera, conversazioni filosofiche intime e presagio della fine."},
            {"titolo": "Der Himmel über Berlin", "anno": 1987, "perche": "Sguardo angelico benevolo sul mondo, poesia urbana e struggente bisogno d'umanità."},
            {"titolo": "Höstsonaten", "anno": 1978, "perche": "Rancori familiari notturni, confronto intimo doloroso e fredda confessione dell'anima."},
            {"titolo": "Il postino", "anno": 1994, "perche": "Timidezza poetica sull'isola, risveglio sentimentale gentile e commovente candore dell'amicizia."},
            {"titolo": "Yi Yi", "anno": 2000, "perche": "Serenità filosofica quotidiana, fragilità delle relazioni umane e sguardo infantile limpido."}
        ]
    },
    # 20. tv:80240 — La regina del flow (2018)
    {
        "seed": "tv:80240",
        "suggerimenti": [
            {"titolo": "Revenge", "anno": 2011, "perche": "Fredda vendetta altoborghese calcolata, melodramma sfarzoso e complotto implacabile senza tregua."},
            {"titolo": "Empire", "anno": 2015, "perche": "Dinastia hip-hop spietata, faide familiari fiammeggianti e melodramma musicale debordante."},
            {"titolo": "Nashville", "anno": 2012, "perche": "Rivalità canore senza scrupoli, tradimenti sentimentali e melodramma da palcoscenico luccicante."},
            {"titolo": "Selena", "anno": 1997, "perche": "Passione musicale travolgente, ascesa latina calorosa e tragica fatalità sanguinosa."},
            {"titolo": "8 Mile", "anno": 2002, "perche": "Riscatto rabbioso al microfono, rivalità urbana cruda ed energia musicale viscerale."},
            {"titolo": "Hustle & Flow", "anno": 2005, "perche": "Urgenza creativa dal basso, sudore del riscatto e fuoco melodico viscerale."},
            {"titolo": "La reina del sur", "anno": 2011, "perche": "Ascesa criminale femminile implacabile, vendetta passionale e fiero riscatto latino."},
            {"titolo": "Pasión de gavilanes", "anno": 2003, "perche": "Odio che diventa passione bruciante, faida terriera melodrammatica e cavalcate teatrali."},
            {"titolo": "Sin senos no hay paraíso", "anno": 2008, "perche": "Melodramma criminale crudo, ambizione fatale e conseguenze devastanti della vanità."},
            {"titolo": "Café con aroma de mujer", "anno": 1994, "perche": "Passione travolgente nei campi di caffè, orgoglio di classe e melodramma verace."},
            {"titolo": "Rosario Tijeras", "anno": 2005, "perche": "Bellezza armata fatale, passione sanguinaria nei barrios ed esasperato melodramma urbano."},
            {"titolo": "Monarca", "anno": 2019, "perche": "Faida dinastica della tequila, tradimenti familiari sfarzosi e corruzione vendicativa implacabile."},
            {"titolo": "Rubí", "anno": 2004, "perche": "Ambizione femminile spietata, seduzione velenosa e melodramma da telenovela ad altissima tensione."},
            {"titolo": "Vis a vis", "anno": 2015, "perche": "Ferocia carceraria femminile, vendetta disperata e tensione narrativa al cardiopalma."},
            {"titolo": "Élite", "anno": 2018, "perche": "Intrighi giovanili velenosi, segreti scandalosi e melodramma sensuale ad alto voltaggio."},
            {"titolo": "Carmen", "anno": 1983, "perche": "Passione flamenca incendiaria, gelosia omicida e fusione ossessiva tra musica e sangue."},
            {"titolo": "Marisa la civetta", "anno": 1957, "perche": "Passione verace da stazione, orgoglio femminile popolare e bisticci sentimentali canori."},
            {"titolo": "Carosello napoletano", "anno": 1954, "perche": "Melodramma canoro passionale, passioni popolari scatenate ed esuberanza musicale teatrale."},
            {"titolo": "La vita davanti a sé", "anno": 2020, "perche": "Riscatto urbano travolgente, affetto viscerale e calore empatico senza compromessi."},
            {"titolo": "Blood & Water", "anno": 2020, "perche": "Intrigo liceale passionale, segreti di famiglia sconvolgenti e vendetta ostinata."}
        ]
    }
]

with open('.scratch/test_candidates.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Saved updated .scratch/test_candidates.json successfully.")
