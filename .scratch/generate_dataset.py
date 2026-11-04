# generate_dataset.py
import sys
sys.path.insert(0, '.')
import json
from collections import Counter, defaultdict
import pandas as pd
import importlib.util

spec = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

from services.graph_dense import config as C, data as D

data = [
    # 1. movie:2062 - Ratatouille (2007)
    {
        "seed": "movie:2062",
        "suggerimenti": [
            {"titolo": "Il pranzo di Babette", "anno": 1987, "perche": "Devozione sensoriale all'arte culinaria e al calore dell'anima."},
            {"titolo": "Tampopo", "anno": 1985, "perche": "Gioiosa ossessione per la perfezione culinaria e il piacere dei sensi."},
            {"titolo": "Il favoloso mondo di Amélie", "anno": 2001, "perche": "Favolistica magia parigina, incanto sensoriale e radioso calore umano."},
            {"titolo": "Kiki - Consegne a domicilio", "anno": 1989, "perche": "Grazia gentile nella dedizione al proprio mestiere e talento creativo."},
            {"titolo": "Appuntamento a Belleville", "anno": 2003, "perche": "Eccentricità nostalgica francese, umorismo raffinato e calore artigianale."},
            {"titolo": "Il gusto delle cose", "anno": 2023, "perche": "Puro lirismo sensoriale e riverenza per la sublime arte culinaria."},
            {"titolo": "The Secret of Kells", "anno": 2009, "perche": "Luminosa bellezza artigianale e profonda devozione alla meraviglia visiva."},
            {"titolo": "Big Night", "anno": 1996, "perche": "Passione autentica per l'eccellenza culinaria e orgoglio artistico fraterno."},
            {"titolo": "Julie & Julia", "anno": 2009, "perche": "Entusiasmo contagioso per la cucina vissuta come vocazione artistica."},
            {"titolo": "Hugo Cabret", "anno": 2011, "perche": "Amore per l'artigianato meccanico, meraviglia visiva e incanto parigino."},
            {"titolo": "Il gigante di ferro", "anno": 1999, "perche": "Cuore nobilissimo, calore morale e profonda tenerezza animata."},
            {"titolo": "Midnight in Paris", "anno": 2011, "perche": "Nostalgico incanto romantico ed esaltazione della creatività parigina."},
            {"titolo": "Chocolat", "anno": 2000, "perche": "Calore sensuale che abbatte i pregiudizi attraverso la dolcezza."},
            {"titolo": "Fantastic Mr. Fox", "anno": 2009, "perche": "Arguzia raffinata, artigianato minuzioso e vibrante ironia calorosa."},
            {"titolo": "Come l'acqua per il cioccolato", "anno": 1992, "perche": "Realismo magico sensoriale travolto da viscerale passione gastronomica."},
            {"titolo": "Mangiare bere uomo donna", "anno": 1994, "perche": "Rituali gastronomici che tessono affetti familiari e rispetto generazionale."},
            {"titolo": "Wallace & Gromit - La maledizione del coniglio mannaro", "anno": 2005, "perche": "Inconfondibile brio artigianale britannico, calore ed eccentrico umorismo visivo."},
            {"titolo": "La cuoca del presidente", "anno": 2012, "perche": "Sincera passione gastronomica autentica opposta alla rigidità formale."},
            {"titolo": "La tartaruga rossa", "anno": 2016, "perche": "Poesia visiva contemplativa, delicata bellezza e profondo rispetto naturale."},
            {"titolo": "Un tocco di zenzero", "anno": 2003, "perche": "Spezie e sapori come metafora di memoria, affetto e malinconia."}
        ]
    },
    # 2. movie:369885 - Allied - Un'ombra nascosta (2016)
    {
        "seed": "movie:369885",
        "suggerimenti": [
            {"titolo": "Casablanca", "anno": 1942, "perche": "Eleganza classica, fatalismo bellico e struggente sacrificio amoroso."},
            {"titolo": "Notorious - L'amante perduta", "anno": 1946, "perche": "Tensione elegante, straziante diffidenza coniugale e pericolo spionistico."},
            {"titolo": "Black Book", "anno": 2006, "perche": "Ambiguità morale, audace sopravvivenza bellica e tragico tradimento passionale."},
            {"titolo": "Lussuria - Seduzione e tradimento", "anno": 2007, "perche": "Straziante tensione erotica, tormento spionistico e destino fatale."},
            {"titolo": "Il paziente inglese", "anno": 1996, "perche": "Melodramma passionale maestoso, struggente rimorso ed eleganza tragica."},
            {"titolo": "Espiazione", "anno": 2007, "perche": "Lirismo romantico devastante, senso di colpa ed eleganza formale."},
            {"titolo": "Il terzo uomo", "anno": 1949, "perche": "Atmosfera fatale, ombre notturne e cinico disincanto postbellico."},
            {"titolo": "L'armata delle ombre", "anno": 1969, "perche": "Rigore morale glaciale, tensione sommessa e tragica solitudine spionistica."},
            {"titolo": "Decision to Leave", "anno": 2022, "perche": "Ossessione romantica sofisticata, mistero enigmatico e struggente lacerazione emotiva."},
            {"titolo": "Il ponte delle spie", "anno": 2015, "perche": "Dignitosa compostezza classica, integrità morale e nobile tensione diplomatica."},
            {"titolo": "Il silenzio del mare", "anno": 1949, "perche": "Tensione sommessa e dignitoso pudore di un amore proibito."},
            {"titolo": "La signora scompare", "anno": 1938, "perche": "Tensione ferroviaria elegante, mistero brillante e raffinata ironia britannica."},
            {"titolo": "Quel che resta del giorno", "anno": 1993, "perche": "Dignitoso ritegno aristocratico, amore represso e struggente rimpianto."},
            {"titolo": "Il velo dipinto", "anno": 2006, "perche": "Riconciliazione dolorosa, bellezza austera e redenzione sentimentale tragica."},
            {"titolo": "Suite Francese", "anno": 2014, "perche": "Fragile intimità romantica soffocata dalla morsa dell'occupazione bellica."},
            {"titolo": "La scelta di Sophie", "anno": 1982, "perche": "Tragedia storica devastante, lacerazione morale ed eleganza dolorosa."},
            {"titolo": "La fiamma del peccato", "anno": 1944, "perche": "Cinismo fatale, seduzione pericolosa e implacabile discesa nel tradimento."},
            {"titolo": "Ascensore per il patibolo", "anno": 1958, "perche": "Disperazione notturna fatale, tensione jazzistica e destino inesorabile."},
            {"titolo": "Cold War", "anno": 2018, "perche": "Amore impossibile, sublime estetica monocroma e lacerante fatalismo storico."},
            {"titolo": "La talpa", "anno": 2011, "perche": "Paranoia burocratica soffusa, silenziosa lealtà e malinconico tradimento spionistico."}
        ]
    },
    # 3. movie:858024 - Hamnet - Nel nome del figlio (2025)
    {
        "seed": "movie:858024",
        "suggerimenti": [
            {"titolo": "The Rider - Il sogno di un cowboy", "anno": 2017, "perche": "Lirismo visivo sommesso, intimo dolore e toccante riconnessione naturale."},
            {"titolo": "The Tree of Life", "anno": 2011, "perche": "Dolore spirituale trascendente, sublime riverenza cosmica e grazia contemplativa."},
            {"titolo": "Manchester by the Sea", "anno": 2016, "perche": "Strazio genitoriale autentico, lutto incolmabile e silenziosa sofferenza umana."},
            {"titolo": "Bright Star", "anno": 2009, "perche": "Delicata grazia poetica, malinconia romantica e sensuale bellezza naturale."},
            {"titolo": "Il posto delle fragole", "anno": 1957, "perche": "Poetica contemplazione della mortalità, ricordi tattili e intima redenzione."},
            {"titolo": "Petite Maman", "anno": 2021, "perche": "Tenerissimo realismo magico, elaborazione del lutto e legame materno."},
            {"titolo": "Drive My Car", "anno": 2021, "perche": "Paziente elaborazione dell'assenza, sommessa catarsi e catartica comunione umana."},
            {"titolo": "La stanza del figlio", "anno": 2001, "perche": "Dolore familiare lacerante, disperazione silenziosa e fragile rielaborazione emotiva."},
            {"titolo": "A Ghost Story", "anno": 2017, "perche": "Meditazione cosmica sulla perdita, silenzio infinito e struggente attesa."},
            {"titolo": "Tre colori - Film blu", "anno": 1993, "perche": "Raffinata disamina sensoriale del lutto opprimente e liberazione interiore."},
            {"titolo": "The Quiet Girl", "anno": 2022, "perche": "Luminosa tenerezza rurale, silenzi accoglienti e pudico calore affettivo."},
            {"titolo": "First Reformed - La creazione a rischio", "anno": 2017, "perche": "Tormento spirituale austero, rigore morale e disperata ricerca di grazia."},
            {"titolo": "L'albero degli zoccoli", "anno": 1978, "perche": "Arcaica solennità rurale, dignità contadina e profonda comunione naturale."},
            {"titolo": "I giorni del cielo", "anno": 1978, "perche": "Lirismo pastorale struggente, luce crepuscolare e distaccata bellezza tragica."},
            {"titolo": "Ritratto della giovane in fiamme", "anno": 2019, "perche": "Sguardo pittorico raffinato, intima delicatezza tattile e memoria indelebile."},
            {"titolo": "Il cavallo di Torino", "anno": 2011, "perche": "Austerità sensoriale radicale, silenzio apocalittico e peso della mortalità."},
            {"titolo": "Sussurri e grida", "anno": 1972, "perche": "Straziante confronto con l'agonia, contatto carnale e dolore spirituale."},
            {"titolo": "Il ritorno", "anno": 2003, "perche": "Austero dramma filiale, paesaggi mitici e tragico senso del destino."},
            {"titolo": "Il sapore della ciliegia", "anno": 1997, "perche": "Paziente riflessione sulla finitezza terrena, paesaggio arido e pietà umana."},
            {"titolo": "Poetry", "anno": 2010, "perche": "Struggente ricerca di bellezza nella tragedia morale e decadimento fisico."}
        ]
    },
    # 4. movie:36557 - Casino Royale (2006)
    {
        "seed": "movie:36557",
        "suggerimenti": [
            {"titolo": "The Bourne Supremacy", "anno": 2004, "perche": "Tensione cinetica inesorabile, realismo viscerale e paranoia spionistica implacabile."},
            {"titolo": "Mission: Impossible - Fallout", "anno": 2018, "perche": "Virtuosismo acrobatico spettacolare, ritmo mozzafiato ed eleganza fisica muscolare."},
            {"titolo": "Ronin", "anno": 1998, "perche": "Cinismo professionale pragmatico, inseguimenti realistici e cruda precisione tattica."},
            {"titolo": "The Man from Nowhere", "anno": 2010, "perche": "Violenza coreografica brutale, eleganza cupa e disperata motivazione emotiva."},
            {"titolo": "Heat - La sfida", "anno": 1995, "perche": "Gravità metropolitana imponente, gelida maestria criminale e solenne intensità."},
            {"titolo": "Sicario", "anno": 2015, "perche": "Tensione soffocante, atmosfera minacciosa e brutale ambiguità morale contemporanea."},
            {"titolo": "Point Blank", "anno": 2010, "perche": "Fuga parigina mozzafiato, ritmo forsennato e disperata urgenza fisica."},
            {"titolo": "The Raid - Redenzione", "anno": 2011, "perche": "Impatto fisico devastante, claustrofobia brutale ed estenuante precisione marziale."},
            {"titolo": "Infernal Affairs", "anno": 2002, "perche": "Paranoia sottocopertura affilatissima, destino tragico e tensione psicologica magistrale."},
            {"titolo": "La maschera di Zorro", "anno": 1998, "perche": "Spavalderia cinetica impeccabile, duelli eleganti e slancio avventuroso brillante."},
            {"titolo": "A Bittersweet Life", "anno": 2005, "perche": "Eleganza noir sofisticata, dignità ferita e letale vendetta stilizzata."},
            {"titolo": "Non dirlo a nessuno", "anno": 2006, "perche": "Angoscia spasmodica, corsa disperata per la verità e ritmo al cardiopalma."},
            {"titolo": "Tropa de Elite 2 - Il nemico è un altro", "anno": 2010, "perche": "Pressione cinetica furiosa, realismo spietato e viscerale rabbia civile."},
            {"titolo": "The Pusher", "anno": 2004, "perche": "Spregiudicato carisma criminale britannico, eleganza cinica e violenza improvvisa."},
            {"titolo": "Frank Costello faccia d'angelo", "anno": 1967, "perche": "Precisione chirurgica glaciale, solitudine esistenziale ed eleganza letale austera."},
            {"titolo": "Hanna", "anno": 2011, "perche": "Ritmo techno ipnotico, letale agilità fiabesca e paranoia cosmopolita."},
            {"titolo": "La spia - A Most Wanted Man", "anno": 2014, "perche": "Paziente logoramento spionistico, disincanto morale e tensione sommessa magistrale."},
            {"titolo": "Suburra", "anno": 2015, "perche": "Tensione criminale vibrante, corruzione violenta ed eleganza cupa senza pietà."},
            {"titolo": "La vendetta di un uomo tranquillo", "anno": 2016, "perche": "Furia trattenuta, vendetta cupa e spietato realismo senza compromessi."},
            {"titolo": "I fiumi di porpora", "anno": 2000, "perche": "Atmosfere alpine sinistre, cinismo investigativo ed energia fisica cupa."}
        ]
    },
    # 5. tv:54344 - The Leftovers - Svaniti nel nulla (2014)
    {
        "seed": "tv:54344",
        "suggerimenti": [
            {"titolo": "Station Eleven", "anno": 2021, "perche": "Poetica elaborazione del lutto, speranza comunitaria e grazia artistica salvifica."},
            {"titolo": "Rectify", "anno": 2013, "perche": "Meditativa introspezione spirituale, silenzioso tormento interiore e fragile rinascita."},
            {"titolo": "Dark", "anno": 2017, "perche": "Tragedia metafisica labirintica, fatalismo inesorabile e angoscia esistenziale opprimente."},
            {"titolo": "Les Revenants", "anno": 2012, "perche": "Dolore spettrale sospeso, mistero inconoscibile e silenziosa malinconia soprannaturale."},
            {"titolo": "Melancholia", "anno": 2011, "perche": "Depressione cosmica maestosa, bellezza apocalittica e straziante resa emotiva."},
            {"titolo": "Il dolce domani", "anno": 1997, "perche": "Lutto collettivo straziante, frattura emotiva e composto dolore comunitario."},
            {"titolo": "Stalker", "anno": 1979, "perche": "Brama spirituale metafisica, silenzio contemplativo e mistero interiore insondabile."},
            {"titolo": "Devs", "anno": 2020, "perche": "Fatalismo cosmico agghiacciante, lutto ostinato e determinismo filosofico opprimente."},
            {"titolo": "Six Feet Under", "anno": 2001, "perche": "Confronto intimo con la mortalità, surreale ironia e vulnerabilità empatica."},
            {"titolo": "The Kingdom - Il regno", "anno": 1994, "perche": "Angoscia metafisica claustrofobica, assurdità grottesca e inquietudine spirituale sottile."},
            {"titolo": "Scissione", "anno": 2022, "perche": "Alienazione esistenziale chirurgica, dolore dissociato e silenziosa ribellione umana."},
            {"titolo": "Solaris", "anno": 1972, "perche": "Materializzazione spettrale del rimorso, solitudine cosmica e nostalgia straziante."},
            {"titolo": "Midnight Mass", "anno": 2021, "perche": "Fervore religioso tragico, dialoghi filosofici accorati e inevitabilità della morte."},
            {"titolo": "Dekalog", "anno": 1989, "perche": "Rigore etico austero, pietà per la fragilità e interrogativi morali."},
            {"titolo": "After Life", "anno": 1998, "perche": "Gentile meditazione sul senso della memoria terrena e riconciliazione dell'anima."},
            {"titolo": "Picnic a Hanging Rock", "anno": 1975, "perche": "Mistero insondabile, sparizione inspiegabile e rarefatta suggestione metafisica."},
            {"titolo": "Kairo", "anno": 2001, "perche": "Solitudine esistenziale soffocante, disconnessione spettrale e disperazione cosmica muta."},
            {"titolo": "Il settimo sigillo", "anno": 1957, "perche": "Silenzio di Dio, angoscia dinanzi alla morte e tormento metafisico."},
            {"titolo": "Mr. Nobody", "anno": 2009, "perche": "Molteplicità del destino, memoria frammentata e malinconia delle scelte insolute."},
            {"titolo": "Ordet - La parola", "anno": 1955, "perche": "Fede disperata nel miracolo, gravità spirituale e sublime grazia umana."}
        ]
    },
    # 6. tv:113036 - American Horror Stories (2021)
    {
        "seed": "tv:113036",
        "suggerimenti": [
            {"titolo": "Scream Queens", "anno": 2015, "perche": "Sferzante camp, satira velenosa, estetica pop ed esilarante massacro slasher."},
            {"titolo": "I racconti della cripta", "anno": 1989, "perche": "Pulp sfacciato, ironia macabra d'annata e beffarde punizioni grottesche."},
            {"titolo": "Creepshow", "anno": 1982, "perche": "Gusto fumettistico sanguigno, orrore beffardo e sfrenato divertimento splatter."},
            {"titolo": "Suspiria", "anno": 1977, "perche": "Delirio cromatico lussureggiante, terrore barocco e ipnotico grand-guignol sensoriale."},
            {"titolo": "Jennifer's Body", "anno": 2009, "perche": "Arguzia femminista velenosa, seduzione demoniaca e brillante estetica pop."},
            {"titolo": "Al nuovo gusto di ciliegia", "anno": 2021, "perche": "Allucinazione corporea grottesca, vendetta putrescente e sfrontato delirio pulp."},
            {"titolo": "La maschera del demonio", "anno": 1960, "perche": "Estetismo gotico sontuoso, atmosfera macabra e fascino orrorifico sensazionale."},
            {"titolo": "Phenomena", "anno": 1985, "perche": "Bizzarria barocca visionaria, follia estetica ed eccentrico orrore giovanile."},
            {"titolo": "Re-Animator", "anno": 1985, "perche": "Frenetico umorismo nero, audacia splatter e sfrenata devozione al macabro."},
            {"titolo": "Sei donne per l'assassino", "anno": 1964, "perche": "Colori saturi scintillanti, sadismo glamour e delitti scenografici teatrali."},
            {"titolo": "Hausu", "anno": 1977, "perche": "Delirio psichedelico bizzarro, follia visiva giocosa e puro nonsenso pop."},
            {"titolo": "La tana del serpente bianco", "anno": 1988, "perche": "Sfacciato camp britannico, erotismo pagano kitsch e scandalosa follia."},
            {"titolo": "The Rocky Horror Picture Show", "anno": 1975, "perche": "Festa trasgressiva glam-rock, sensualità queer e scandalosa glorificazione del camp."},
            {"titolo": "Død snø", "anno": 2009, "perche": "Spensierata carneficina sulla neve, brio splatter ed energia zombi irriverente."},
            {"titolo": "Dellamorte Dellamore", "anno": 1994, "perche": "Commedia zombi filosofica grottesca, fascino macabro e delizioso kitsch visionario."},
            {"titolo": "Uzumaki", "anno": 2000, "perche": "Allucinazione spiraliforme grottesca, maledizioni corporali e surreale eccentricità orrorifica."},
            {"titolo": "La spina del diavolo", "anno": 2001, "perche": "Gotico melodrammatico sontuoso, spettri tragici e cupo fascino d'epoca."},
            {"titolo": "Suicide Club", "anno": 2001, "perche": "Provocazione pop scioccante, satira sanguinaria e nichilismo grottesco."},
            {"titolo": "Sette note in nero", "anno": 1977, "perche": "Giallo ipnotico raffinato, ossessioni chiaroveggenti ed eleganza macabra."},
            {"titolo": "La casa dalle finestre che ridono", "anno": 1976, "perche": "Gotico padano inquietante, macabra pittura diabolica e follia claustrofobica provinciale."}
        ]
    },
    # 7. movie:55931 - Animatrix (2003)
    {
        "seed": "movie:55931",
        "suggerimenti": [
            {"titolo": "Ghost in the Shell", "anno": 1995, "perche": "Profonda introspezione cibernetica, malinconia filosofica e sublime estetica metropolitana."},
            {"titolo": "Akira", "anno": 1988, "perche": "Furia cinetica apocalittica, mutazione biomeccanica e titanica grandezza distopica."},
            {"titolo": "Blade Runner", "anno": 1982, "perche": "Neo-noir piovoso intramontabile, solitudine sintetica e struggente interrogativo esistenziale."},
            {"titolo": "Paprika - Sognando un sogno", "anno": 2006, "perche": "Allucinazione visiva vertiginosa, delirio onirico e caleidoscopica immaginazione psicologica."},
            {"titolo": "Dark City", "anno": 1998, "perche": "Cupo noir esistenziale, architetture mutevoli e claustrofobica paranoia sulla realtà."},
            {"titolo": "Serial Experiments Lain", "anno": 1998, "perche": "Inquietante alienazione digitale, frammentazione identitaria e rarefatta atmosfera avanguardistica."},
            {"titolo": "Heavy Metal", "anno": 1981, "perche": "Antologia fantascientifica provocatoria, energia rock e visionario erotismo decadente."},
            {"titolo": "Renaissance", "anno": 2006, "perche": "Stile grafico monocromatico audace, cospirazione corporativa e noir parigino."},
            {"titolo": "Metropolis", "anno": 2001, "perche": "Grandiosità retrofuturista monumentale, innocenza sintetica straziante e jazz crepuscolare."},
            {"titolo": "Il pianeta selvaggio", "anno": 1973, "perche": "Psichedelia straniante ipnotica, ecosistema alieno surreale e allegoria filosofica."},
            {"titolo": "Atto di forza", "anno": 1990, "perche": "Paranoia identitaria viscerale, violenza distopica e travolgente brio cyberpunk."},
            {"titolo": "Love, Death & Robots", "anno": 2019, "perche": "Spettacolo antologico adulto, audacia tecnologica e stile visivo ipersaturo."},
            {"titolo": "Scavengers Reign", "anno": 2023, "perche": "Biologia aliena affascinante, meraviglia silenziosa e ancestrale orrore simbiotico."},
            {"titolo": "Strange Days", "anno": 1995, "perche": "Paranoia millenarista febbrile, memorie sintetiche e viscerale noir metropolitano."},
            {"titolo": "Sky Blue", "anno": 2003, "perche": "Distopia ecologica grandiosa, malinconia visiva e tecnologia raffinata."},
            {"titolo": "Gandahar", "anno": 1987, "perche": "Fantascienza poetica e filosofica, mutazioni temporali e incanto visivo."},
            {"titolo": "Chrysalis", "anno": 2007, "perche": "Fredda estetica cyberpunk europea, memoria manipolata e vendetta tecnologica."},
            {"titolo": "Immortal ad vitam", "anno": 2004, "perche": "Estetica grafica sontuosa, divinità aliene e decadenza distopica futurista."},
            {"titolo": "Metropia", "anno": 2009, "perche": "Angoscia sotterranea opprimente, controllo mentale e grigio realismo distopico."},
            {"titolo": "Sleep Dealer", "anno": 2008, "perche": "Cyberpunk di confine realistico, sfruttamento digitale e resistenza proletaria."}
        ]
    },
    # 8. movie:698948 - Tredici vite (2022)
    {
        "seed": "movie:698948",
        "suggerimenti": [
            {"titolo": "Apollo 13", "anno": 1995, "perche": "Ingegno metodico collettivo, risoluzione tecnica calma e tensione claustrofobica."},
            {"titolo": "Captain Phillips - Attacco in mare aperto", "anno": 2013, "perche": "Realismo documentaristico serrato, tensione logistica spasmodica e dignità sotto pressione."},
            {"titolo": "Sully", "anno": 2016, "perche": "Rigore professionale sobrio, calma esemplare e integrità umana silenziosa."},
            {"titolo": "The Abyss", "anno": 1989, "perche": "Pressione sottomarina soffocante, tenacia operaia e pericolo claustrofobico estremo."},
            {"titolo": "Deepwater - Inferno sull'oceano", "anno": 2016, "perche": "Disastro industriale viscerale, coraggio tangibile e pragmatismo operaio eroico."},
            {"titolo": "United 93", "anno": 2006, "perche": "Immediatezza procedurale straziante, autenticità senza retorica e coraggio collettivo."},
            {"titolo": "La società della neve", "anno": 2023, "perche": "Resistenza fisica estenuante, solidarietà fraterna e sacro rispetto umano."},
            {"titolo": "Das Boot", "anno": 1981, "perche": "Logorante claustrofobia sottomarina, disciplina ferrea e tensione meccanica sorda."},
            {"titolo": "Dunkirk", "anno": 2017, "perche": "Angoscia sensoriale incessante, sopravvivenza collettiva e solenne urgenza storica."},
            {"titolo": "Everest", "anno": 2015, "perche": "Ferocia elementale implacabile, prova fisica estrema e fatale vulnerabilità."},
            {"titolo": "Sanctum", "anno": 2011, "perche": "Terrore claustrofobico in grotta, pragmatismo spietato e lotta per riemergere."},
            {"titolo": "Chernobyl", "anno": 2019, "perche": "Metodico rigore scientifico, orrore burocratico e supremo sacrificio silenzioso."},
            {"titolo": "Kursk", "anno": 2018, "perche": "Intrappolamento straziante negli abissi, fratellanza marinara e silenziosa dignità."},
            {"titolo": "K-19", "anno": 2002, "perche": "Crisi nucleare sottomarina, senso del dovere inflessibile e abnegazione."},
            {"titolo": "The 33", "anno": 2015, "perche": "Solidarietà sotterranea incrollabile, speranza operosa e resistenza umana collettiva."},
            {"titolo": "Kon-Tiki", "anno": 2012, "perche": "Audacia scientifica pragmatica, comunione con gli elementi e calma determinazione."},
            {"titolo": "The Wave", "anno": 2015, "perche": "Geologia meticolosa, urgenza procedurale realistica e istinto protettivo familiare."},
            {"titolo": "The Deep", "anno": 2012, "perche": "Incredibile resistenza biologica, silenzio glaciale e sobria modestia nordica."},
            {"titolo": "Fire - Nessuna via d'uscita", "anno": 2020, "perche": "Eroismo antincendio pragmatico, disciplina di squadra e lotta contro il fuoco."},
            {"titolo": "Tunnel", "anno": 2016, "perche": "Isolamento claustrofobico disperato, sforzo ingegneristico e tenace volontà di sopravvivenza."}
        ]
    },
    # 9. tv:95057 - Superman & Lois (2021)
    {
        "seed": "tv:95057",
        "suggerimenti": [
            {"titolo": "Friday Night Lights", "anno": 2006, "perche": "Autenticità rurale vibrante, profondi legami familiari e calore comunitario sincero."},
            {"titolo": "Everwood", "anno": 2002, "perche": "Tenerezza familiare di provincia, complicità padre-figlio e sincero calore emotivo."},
            {"titolo": "This Is Us", "anno": 2016, "perche": "Coinvolgente calore multigenerazionale, devozione familiare ed empatia lacrimosa sincera."},
            {"titolo": "Parenthood", "anno": 2010, "perche": "Caotico affetto quotidiano, sfide genitoriali veritiere e profonda tenerezza condivisa."},
            {"titolo": "Cielo d'ottobre", "anno": 1999, "perche": "Idealismo genuino di provincia, severo amore paterno e nobile determinazione."},
            {"titolo": "Gran Torino", "anno": 2008, "perche": "Paternità protettiva ruvida, riscatto morale e sacrificio protettivo per il prossimo."},
            {"titolo": "Heartland", "anno": 2007, "perche": "Serenità agreste confortevole, guarigione familiare e rassicurante costanza affettiva."},
            {"titolo": "Little Forest: Summer/Autumn", "anno": 2014, "perche": "Pace rurale ristoratrice, cicli della natura e dolce laboriosità domestica."},
            {"titolo": "Little Forest", "anno": 2018, "perche": "Calore agreste rigenerante, conforto culinario e ritrovata serenità interiore."},
            {"titolo": "Little Sister", "anno": 2015, "perche": "Grazia domestica luminosa, perdono fraterno e premurosa dolcezza quotidiana."},
            {"titolo": "Still Walking", "anno": 2008, "perche": "Raffinate dinamiche familiari, malinconia agrodolce e sottile comprensione generazionale."},
            {"titolo": "C.R.A.Z.Y.", "anno": 2005, "perche": "Amore paterno travagliato, calore fraterno e commovente riconciliazione identitaria."},
            {"titolo": "La famiglia Bélier", "anno": 2014, "perche": "Brio agreste solare, affetto familiare incondizionato e commovente distacco filiale."},
            {"titolo": "Mio padre, che eroe!", "anno": 1991, "perche": "Tenerezza paterna protettiva, equivoci affettuosi e dolce complicità genitoriale."},
            {"titolo": "La gloria di mio padre", "anno": 1990, "perche": "Nostalgico incanto d'infanzia provenzale, fierezza filiale e amorevole calore campestre."},
            {"titolo": "Nuovo Cinema Paradiso", "anno": 1988, "perche": "Paternità vicaria dolcissima, nostalgia paesana e amore commovente per l'arte."},
            {"titolo": "Billy Elliot", "anno": 2000, "perche": "Feroce riscatto affettivo, sacrificio paterno operaio e commovente trionfo personale."},
            {"titolo": "Sette minuti dopo la mezzanotte", "anno": 2016, "perche": "Struggente sincerità del dolore filiale, fiaba morale e amorevole conforto."},
            {"titolo": "Il segreto del suo volto", "anno": 2014, "perche": "Dignità ferita silenziosa, pudore affettivo e ricerca disperata di verità."},
            {"titolo": "Padre padrone", "anno": 1977, "perche": "Aspro riscatto umano pastorale, emancipazione ostinata e severità patriarcale arcaica."}
        ]
    },
    # 10. movie:953 - Madagascar (2005)
    {
        "seed": "movie:953",
        "suggerimenti": [
            {"titolo": "Le follie dell'imperatore", "anno": 2000, "perche": "Tempi comici fulminei, irresistibile nevrosi verbale e sfrenata anarchia slapstick."},
            {"titolo": "Piovono polpette", "anno": 2009, "perche": "Gag visive vulcaniche, contagiosa assurdità cinetica ed esuberante follia culinaria."},
            {"titolo": "La strada per El Dorado", "anno": 2000, "perche": "Spassosi battibecchi teatrali, ritmo screwball vivace e brillante cameratismo avventuroso."},
            {"titolo": "Chi ha incastrato Roger Rabbit", "anno": 1988, "perche": "Isteria cartoon frenetica, virtuosismo slapstick inesauribile e contagiosa travolgente allegria."},
            {"titolo": "Kung Fu Panda", "anno": 2008, "perche": "Slapstick marziale esilarante, energia coreografica trascinante e grande cuore comico."},
            {"titolo": "La pantera rosa", "anno": 1963, "perche": "Maldestra eleganza fisica, comicità d'equivoci intramontabile e ritmo farsesco impeccabile."},
            {"titolo": "Asterix e il regno degli dei", "anno": 2014, "perche": "Arguzia satirica brillante, zuffe cartoonesche travolgenti e gustoso brio gallico."},
            {"titolo": "Le 12 fatiche di Asterix", "anno": 1976, "perche": "Surreale satira burocratica, prove assurde ed esilarante fantasia animata d'autore."},
            {"titolo": "Mio zio", "anno": 1958, "perche": "Pura coreografia visiva giocosa, slapstick mimico e garbata ironia moderna."},
            {"titolo": "Playtime - Tempo di divertimento", "anno": 1967, "perche": "Monumentale balletto farsesco visivo, caos geometrico orchestrato e geniale umorismo."},
            {"titolo": "Tre uomini e una gamba", "anno": 1997, "perche": "Comicità nevrotica brillante, tormentoni irresistibili e affiatato cameratismo stralunato."},
            {"titolo": "I soliti ignoti", "anno": 1958, "perche": "Impeccabile farsa corale, cialtroneria spassosa e tempi comici proverbiali magistrali."},
            {"titolo": "Giù per il tubo", "anno": 2006, "perche": "Frenetica bizzarria comica britannica, ritmo vivace e divertenti gag acquatiche."},
            {"titolo": "Un pesce di nome Wanda", "anno": 1988, "perche": "Isteria nevrotica scatenata, equivoci farseschi e deliziosa crudeltà eccentrica britannica."},
            {"titolo": "I visitatori", "anno": 1993, "perche": "Spassoso scontro temporale sguaiato, slapstick rumoroso ed esilarante energia medievale."},
            {"titolo": "Non ci resta che piangere", "anno": 1984, "perche": "Geniale improvvisazione comica stralunata, verve toscana e stralunata leggerezza surreale."},
            {"titolo": "Totò, Peppino e la... malafemmina", "anno": 1956, "perche": "Sublime delirio comico dialettale, lettera leggendaria ed equivoci farseschi spassosi."},
            {"titolo": "Shaun, vita da pecora: Il film", "anno": 2015, "perche": "Puro genio visivo muto, slapstick raffinatissimo ed esilarante brio artigianale."},
            {"titolo": "Attila flagello di Dio", "anno": 1982, "perche": "Sfacciata comicità demenziale trash, mimica esagerata e gag cult popolaresche."},
            {"titolo": "Fantozzi", "anno": 1975, "perche": "Grottesco servilismo farsesco esasperato, iperboliche umiliazioni comiche e satira epocale impagabile."}
        ]
    },
    # 11. tv:63210 - Shadowhunters (2016)
    {
        "seed": "tv:63210",
        "suggerimenti": [
            {"titolo": "The Vampire Diaries", "anno": 2009, "perche": "Sensuale tormento gotico giovanile, passioni vampiriche viscerali e melodramma appassionante."},
            {"titolo": "Teen Wolf", "anno": 2011, "perche": "Frenetica atleticità sovrannaturale, misteri liceali oscuri e pulsioni adolescenziali accese."},
            {"titolo": "Buffy l'ammazzavampiri", "anno": 1997, "perche": "Battaglie mistiche metaforiche, battute taglienti e sofferto percorso di crescita."},
            {"titolo": "Streghe", "anno": 1998, "perche": "Legame magico affettuoso, sortilegi melodrammatici e suggestiva estetica fantasy anni novanta."},
            {"titolo": "Constantine", "anno": 2005, "perche": "Atmosfere occulte fumose, fascino esorcistico cinico e battaglie ultraterrene metropolitane."},
            {"titolo": "Blade", "anno": 1998, "perche": "Energia techno-gotica travolgente, carisma letale e combattimenti sovrannaturali sanguinosi."},
            {"titolo": "Fate: The Winx Saga", "anno": 2021, "perche": "Magia elementale tempestosa, segreti accademici cupi e rivalità giovanili tormentate."},
            {"titolo": "A Discovery of Witches - Il manoscritto delle streghe", "anno": 2018, "perche": "Lussureggiante romanticismo gotico accademico, antichi lignaggi arcani e intrighi magici."},
            {"titolo": "Lockwood & Co.", "anno": 2023, "perche": "Spavaldo cameratismo giovanile cacciaspettri, Londra notturna vittoriana e fascino spettrale."},
            {"titolo": "Ragnarok", "anno": 2020, "perche": "Inquietudine adolescenziale nordica, risveglio mitologico titanico e mistero provinciale."},
            {"titolo": "Diablero", "anno": 2018, "perche": "Pulp demoniaco messicano verace, folklore sanguigno ed esuberante caccia esoterica."},
            {"titolo": "Detention", "anno": 2020, "perche": "Inquietante senso di colpa spettrale, repressione giovanile e orrore scolastico."},
            {"titolo": "Underworld", "anno": 2003, "perche": "Guerra tra vampiri e licantropi, estetica dark-latex e romanticismo proibito."},
            {"titolo": "Penny Dreadful", "anno": 2014, "perche": "Sontuoso terrore gotico letterario, tormento interiore e battaglie demoniache grandiose."},
            {"titolo": "Being Human", "anno": 2008, "perche": "Conflitti mostruosi quotidiani, vulnerabilità emotiva toccante e convivenza sovrannaturale imperfetta."},
            {"titolo": "Curon", "anno": 2020, "perche": "Mistero lacustre provinciale, doppelgänger inquietanti e tormentata eredità familiare."},
            {"titolo": "Luna Nera", "anno": 2020, "perche": "Stregoneria seicentesca passionale, ribellione femminile giovanile e amori impossibili."},
            {"titolo": "Jordskott", "anno": 2015, "perche": "Mistero folklorico silvano nordico, creature ancestrali e dramma familiare doloroso."},
            {"titolo": "Mortel", "anno": 2019, "perche": "Poteri vudù giovanili oscuri, rivalità scolastiche banlieue e vendetta sovrannaturale."},
            {"titolo": "Il patto dei lupi", "anno": 2001, "perche": "Avventura gotica sontuosa, misteri mostruosi ed eleganti arti marziali storiche."}
        ]
    },
    # 12. movie:8337 - Essi vivono (1988)
    {
        "seed": "movie:8337",
        "suggerimenti": [
            {"titolo": "1997: Fuga da New York", "anno": 1981, "perche": "Cinismo spavaldo antiautoritario, marciume urbano distopico e carisma da antieroe."},
            {"titolo": "RoboCop", "anno": 1987, "perche": "Feroce satira corporativa, violenza distopica sopra le righe e alienazione umana."},
            {"titolo": "L'invasione degli ultracorpi", "anno": 1978, "perche": "Paranoia metropolitana soffocante, conformismo alienante strisciante e terrore psicologico."},
            {"titolo": "2022: i sopravvissuti", "anno": 1973, "perche": "Disperazione distopica febbrile, cinica cospirazione industriale e cruda disillusione morale."},
            {"titolo": "Quinto potere", "anno": 1976, "perche": "Ira mediatica profetica bruciante, furia satirica contro il potere capitalistico."},
            {"titolo": "Sorry to Bother You", "anno": 2018, "perche": "Satira anticapitalista surreale dissacrante, assurdità aziendale e ribellione selvaggia."},
            {"titolo": "Il mondo sul filo", "anno": 1973, "perche": "Gelida paranoia tecnologica corporativa, simulazione algoritmica e distacco cinico."},
            {"titolo": "Brazil", "anno": 1985, "perche": "Incubo burocratico grottesco, surreale satira distopica e tragica resistenza individuale."},
            {"titolo": "L'astronave atomica del dottor Quatermass", "anno": 1955, "perche": "Inquietante paranoia scientifica, contagio biologico alieno e rigorosa angoscia britannica."},
            {"titolo": "Tetsuo", "anno": 1989, "perche": "Furia cyber-punk industriale selvaggia, carneficina meccanica e delirio ribelle viscerale."},
            {"titolo": "Smetto quando voglio", "anno": 2014, "perche": "Commedia criminale proletaria dissacrante, riscatto precario e mordace satira sociale."},
            {"titolo": "L'odore della notte", "anno": 1998, "perche": "Rabbia proletaria disperata, cinismo metropolitano e spietata rapacità predatoria notturna."},
            {"titolo": "I vampiri dello spazio", "anno": 1967, "perche": "Sci-fi intellettuale sinistro, condizionamento mentale atavico e isteria collettiva sotterranea."},
            {"titolo": "La decima vittima", "anno": 1965, "perche": "Pop-art distopica satirica, cinismo consumistico mediatico e raffinata ironia paradossale."},
            {"titolo": "Indagine su un cittadino al di sopra di ogni sospetto", "anno": 1970, "perche": "Grottesca impunità del potere autoritario, delirio nevrotico e satira istituzionale."},
            {"titolo": "Hardware - Metallo letale", "anno": 1990, "perche": "Cyberpunk post-apocalittico grezzo, claustrofobia industriale e paranoia tecnologica rugginosa."},
            {"titolo": "Videodrome", "anno": 1983, "perche": "Mutazione mediatica allucinatoria, paranoia corporativa e provocatorio orrore biologico."},
            {"titolo": "District 9", "anno": 2009, "perche": "Crudo realismo fantascientifico, allegoria sociopolitica affilata ed energia viscerale."},
            {"titolo": "Dead End Drive-In", "anno": 1986, "perche": "Ribellione giovanile distopica, satira punk suburbana ed energia ribelle sfrontata."},
            {"titolo": "Fuga dal futuro - Danger Zone", "anno": 1987, "perche": "Futuro post-apocalittico violento, cospirazione governativa sotterranea e tenace resistenza."}
        ]
    },
    # 13. tv:107113 - Only Murders in the Building (2021)
    {
        "seed": "tv:107113",
        "suggerimenti": [
            {"titolo": "Misterioso omicidio a Manhattan", "anno": 1993, "perche": "Nevrotica complicità investigativa coniugale, deliziosa arguzia newyorkese e brio brillante."},
            {"titolo": "L'uomo ombra", "anno": 1934, "perche": "Spumeggiante eleganza aristocratica, battute a raffica e rilassato intuito investigativo."},
            {"titolo": "Cena con delitto - Knives Out", "anno": 2019, "perche": "Giallo classico brillante, satira familiare affilata ed eccentrico calore umano."},
            {"titolo": "Omicidio nel West End", "anno": 2022, "perche": "Garbata meta-commedia teatrale, investigatori mal assortiti e delizioso spirito d'epoca."},
            {"titolo": "Signori, il delitto è servito", "anno": 1985, "perche": "Farsa teatrale scatenata, ritmo comico irresistibile e bizzarro mistero corale."},
            {"titolo": "Il mistero del cadavere scomparso", "anno": 1982, "perche": "Affettuoso omaggio noir parodistico, umorismo impassibile e nostalgica genialità visiva."},
            {"titolo": "Gosford Park", "anno": 2001, "perche": "Squisita satira di classe aristocratica, mistero corale e raffinata malinconia."},
            {"titolo": "8 donne e un mistero", "anno": 2002, "perche": "Spettacolo musicale giallo sfavillante, dive lussureggianti ed elegante brio teatrale."},
            {"titolo": "I diabolici", "anno": 1955, "perche": "Tensione psicologica magistrale, macabro complotto collegiale e colpi di scena."},
            {"titolo": "Gli insospettabili", "anno": 1972, "perche": "Sfida intellettuale teatrale diabolica, beffardo duello psicologico e inganni sontuosi."},
            {"titolo": "Assassinio sull'Orient Express", "anno": 1974, "perche": "Sfarzosa teatralità investigativa classica, carisma eccentrico e delitto d'altri tempi."},
            {"titolo": "Assassinio sul Nilo", "anno": 1978, "perche": "Esotismo affascinante d'epoca, vanità aristocratiche svelate e deduzione impeccabile brillante."},
            {"titolo": "Giallo napoletano", "anno": 1979, "perche": "Delitto tragicomico partenopeo, equivoci grotteschi e calorosa verve popolare investigativa."},
            {"titolo": "I delitti del BarLume - Il re dei giochi", "anno": 2013, "perche": "Commedia gialla provinciale toscana, vecchietti pettegoli e arguto umorismo sornione."},
            {"titolo": "Lupin III - Il castello di Cagliostro", "anno": 1979, "perche": "Romantico brio picaresco, eleganza cavalleresca brillante e rocambolesca indagine fiabesca."},
            {"titolo": "Il nome della rosa", "anno": 1986, "perche": "Fascino deduttivo medievale rigoroso, erudita indagine claustrofobica e atmosfera suggestiva."},
            {"titolo": "Enola Holmes", "anno": 2020, "perche": "Freschezza deduttiva spigliata, rottura della quarta parete e dinamismo giovanile."},
            {"titolo": "Signore & signori", "anno": 1966, "perche": "Pungente commedia morale provinciale, ipocrisie borghesi e cinica allegria corale."},
            {"titolo": "La donna della domenica", "anno": 1975, "perche": "Raffinato giallo mondano torinese, ironia borghese e sottile disincanto investigativo."},
            {"titolo": "Mon Crime - La colpevole sono io", "anno": 2023, "perche": "Deliziosa farsa parigina rétro, brio teatrale brillante e spiritosa complicità."}
        ]
    },
    # 14. movie:537116 - tick, tick... BOOM! (2021)
    {
        "seed": "movie:537116",
        "suggerimenti": [
            {"titolo": "All That Jazz - Lo spettacolo comincia", "anno": 1979, "perche": "Autodistruzione artistica fiammeggiante, coreografia della mortalità ed energia teatrale pura."},
            {"titolo": "Rent", "anno": 2005, "perche": "Fratellanza bohémien appassionata, urgenza creativa giovanile e viscerale speranza rock."},
            {"titolo": "La La Land", "anno": 2016, "perche": "Incanto musicale malinconico, sogni artistici sacrificati ed eleganza nostalgica travolgente."},
            {"titolo": "Synecdoche, New York", "anno": 2008, "perche": "Angoscia esistenziale divorante, megalomania scenica e straziante paura della morte."},
            {"titolo": "Birdman", "anno": 2014, "perche": "Nevrosi teatrale febbrile, ritmo cinetico implacabile e brama viscerale d'autenticità."},
            {"titolo": "Sognando a New York - In the Heights", "anno": 2021, "perche": "Esplosione musicale comunitaria, gioioso orgoglio identitario ed energia contagiosa vibrante."},
            {"titolo": "Sing Street", "anno": 2016, "perche": "Esuberanza musicale giovanile, riscatto sognante anni ottanta e complicità fraterna."},
            {"titolo": "Dancer in the Dark", "anno": 2000, "perche": "Sublime evasione canora nel dolore, innocenza straziante e sacrificio tragico."},
            {"titolo": "Josephine", "anno": 1967, "perche": "Euforia musicale pastello, grazia coreografica radiosa e speranzosa ricerca d'amore."},
            {"titolo": "Les Parapluies de Cherbourg", "anno": 1964, "perche": "Melodramma interamente cantato, realismo agrodolce e lacerante malinconia romantica."},
            {"titolo": "The Commitments", "anno": 1991, "perche": "Ruvida energia soul operaia, vulcanico brio musicale ed esilarante cameratismo."},
            {"titolo": "Once (Una volta)", "anno": 2007, "perche": "Spontaneità acustica intimista, intesa musicale delicata e pudica poesia urbana."},
            {"titolo": "Il concerto", "anno": 2009, "perche": "Passione travolgente per l'armonia, riscatto catartico ed esilarante farsa teatrale."},
            {"titolo": "Chico & Rita", "anno": 2010, "perche": "Sensuale jazz cubano appassionato, memoria melodica nostalgica e amore tormentato."},
            {"titolo": "We Are the Best!", "anno": 2013, "perche": "Ribellione punk adolescenziale gioiosa, ingenua sfrontatezza ed energia vitale autentica."},
            {"titolo": "Annette", "anno": 2021, "perche": "Spettacolo operistico tormentato, furore artistico autodistruttivo e audacia teatrale provocatoria."},
            {"titolo": "Priscilla, la regina del deserto", "anno": 1994, "perche": "Trionfo teatrale sfolgorante, dignità queer scintillante ed esuberanza musicale liberatoria."},
            {"titolo": "Control", "anno": 2007, "perche": "Angoscia creativa viscerale, lirismo post-punk austero e tragica fragilità umana."},
            {"titolo": "Eden", "anno": 2014, "perche": "Malinconia della passione musicale giovanile, clubbing parigino e tempo sfuggente."},
            {"titolo": "Saranno famosi", "anno": 1980, "perche": "Fervore artistico giovanile vibrante, sudore creativo e cocente desiderio di gloria."}
        ]
    },
    # 15. movie:10138 - Iron Man 2 (2010)
    {
        "seed": "movie:10138",
        "suggerimenti": [
            {"titolo": "Chef - La ricetta perfetta", "anno": 2014, "perche": "Spensierata rinascita creativa, brio caloroso e travolgente entusiasmo professionale condiviso."},
            {"titolo": "Edge of Tomorrow - Senza domani", "anno": 2014, "perche": "Adrenalina cinetica propulsiva, brillante ironia dissacrante e spettacolare determinazione tecnologica."},
            {"titolo": "Men in Black", "anno": 1997, "perche": "Carisma spavaldo irresistibile, battute ciniche fantascientifiche e fascino alieno stiloso."},
            {"titolo": "Top Gun: Maverick", "anno": 2022, "perche": "Virtuosismo aereo tonante, spavalderia muscolare spettacolare e pura esaltazione fisica."},
            {"titolo": "Speed", "anno": 1994, "perche": "Cinetica mozzafiato incessante, eroismo brillante e tensione spettacolare senza soste."},
            {"titolo": "The Rock", "anno": 1996, "perche": "Spettacolo pirotecnico roboante, dialoghi affilati travolgenti ed energia muscolare pura."},
            {"titolo": "Banlieue 13", "anno": 2004, "perche": "Pirotecnico parkour adrenalinico, ritmo vertiginoso e spavaldo divertimento d'azione."},
            {"titolo": "Hardcore!", "anno": 2015, "perche": "Folle velocità da videogioco, travolgente violenza rock e brio cinetico."},
            {"titolo": "GoldenEye", "anno": 1995, "perche": "Carisma spionistico rinnovato, villain megalomani industriali e sequenze spettacolari roboanti."},
            {"titolo": "Shin Godzilla", "anno": 2016, "perche": "Vertiginosa concitazione procedurale burocratica, scala monumentale e ritmo visivo travolgente."},
            {"titolo": "La fine del mondo", "anno": 2013, "perche": "Scanzonata goliardia pub-rock, risse marziali scatenate e spavalda ostinazione giovanile."},
            {"titolo": "I guardiani della notte", "anno": 2004, "perche": "Visionario fantasy urbano cinetico, inventiva visiva travolgente ed energia spavalda."},
            {"titolo": "I guardiani del giorno", "anno": 2006, "perche": "Spettacolo visivo pirotecnico fiammeggiante, delirio fantasy contemporaneo e ritmo impetuoso."},
            {"titolo": "Taxxi", "anno": 1998, "perche": "Velocità automobilistica folle, scanzonato brio poliziesco e risate spensierate mediterranee."},
            {"titolo": "Wasabi", "anno": 2001, "perche": "Comicità d'azione scanzonata, sganascioni spettacolari e simpatico carisma ruvido."},
            {"titolo": "Acción mutante", "anno": 1993, "perche": "Sfacciata fantascienza anarchica grottesca, cattiveria punk ed esplosiva bizzarria trash."},
            {"titolo": "Il giorno della bestia", "anno": 1995, "perche": "Frenetico brio apocalittico grottesco, energia heavy-metal e dissacrante ironia scatenata."},
            {"titolo": "Mad Max 2 - Il guerriero della strada", "anno": 1981, "perche": "Pura energia cinetica motorizzata, mito metallico ruggente e spettacolare ferocia."},
            {"titolo": "Attack the Block - Invasione aliena", "anno": 2011, "perche": "Gagliarda spavalderia giovanile urbana, creature feroci ed elettrizzante ritmo action."},
            {"titolo": "Dredd - Il giudice dell'apocalisse", "anno": 2012, "perche": "Violenza iper-cinetica brutale stilizzata, flemma letale e claustrofobica carneficina cibernetica."}
        ]
    },
    # 16. movie:64688 - 21 Jump Street (2012)
    {
        "seed": "movie:64688",
        "suggerimenti": [
            {"titolo": "Superbad - Tre menti sopra il pelo", "anno": 2007, "perche": "Complicità fraterna scurrile autentica, ansie adolescenziali esilaranti e catastrofica goliardia."},
            {"titolo": "The LEGO Movie", "anno": 2014, "perche": "Sovversiva genialità meta-umoristica, ritmo visivo travolgente e dissacrante calore parodistico."},
            {"titolo": "La rivincita delle sfigate", "anno": 2019, "perche": "Incontenibile complicità femminile liceale, follia notturna e brillante arguzia contemporanea."},
            {"titolo": "Tropic Thunder", "anno": 2008, "perche": "Sferzante parodia hollywoodiana spietata, audacia dissacrante e folle delirio corale."},
            {"titolo": "Facciamola finita", "anno": 2013, "perche": "Sfacciata autoironia catastrofica scurrile, delirio apocalittico e genuina amicizia scombinata."},
            {"titolo": "Una pazza giornata di vacanza", "anno": 1986, "perche": "Spensierata evasione liceale dissacrante, rottura della quarta parete e gioiosa sfrontatezza."},
            {"titolo": "Hot Fuzz", "anno": 2007, "perche": "Parodia poliziesca millimetrica geniale, ritmo montaggio forsennato e tenero cameratismo."},
            {"titolo": "L'alba dei morti dementi", "anno": 2004, "perche": "Delizioso umorismo romantico slacker, affetto orrorifico e perfetta alchimia farsesca."},
            {"titolo": "Extreme Job", "anno": 2019, "perche": "Pasticcio poliziesco sotto copertura esilarante, assurdità culinaria e comicità travolgente."},
            {"titolo": "Kung Fusion", "anno": 2004, "perche": "Manicomio cartoonesco irresistibile, slapstick acrobatico esuberante e parodia contagiosa."},
            {"titolo": "Boris - Il film", "anno": 2011, "perche": "Feroce satira metatelevisiva dissacrante, cinismo grottesco e dialoghi cult memorabili."},
            {"titolo": "Fascisti su Marte", "anno": 2006, "perche": "Geniale pastiche parodistico d'archivio, surreale nonsense linguistico e satira travolgente."},
            {"titolo": "Santa Maradona", "anno": 2001, "perche": "Ironico disincanto post-universitario, battute nevrotiche brillanti e complicità quotidiana affettuosa."},
            {"titolo": "Babysitting - Una notte che spacca", "anno": 2014, "perche": "Caos notturno fuori controllo, gag a valanga e goliardia sfrenata."},
            {"titolo": "Alibi.com", "anno": 2017, "perche": "Equivoci farseschi a raffica, bugie concatenate ed esuberante ritmo comico."},
            {"titolo": "OSS 117: Le Caire, nid d'espions", "anno": 2006, "perche": "Parodia spionistica rétro geniale, vanità ottusa esilarante e brio beffardo."},
            {"titolo": "Torrente, el brazo tonto de la ley", "anno": 1998, "perche": "Comicità poliziesca rozza e scorretta, cialtroneria estrema e parodia spietata."},
            {"titolo": "Four Lions", "anno": 2010, "perche": "Satira farsesca nerissima audace, assurdità tragicomica e buffonesco cameratismo cialtrone."},
            {"titolo": "Good Bye, Lenin!", "anno": 2003, "perche": "Inganno affettuoso farsesco rocambolesco, dolce malinconia ed esilaranti stratagemmi surreali."},
            {"titolo": "Airbag", "anno": 1997, "perche": "Frenesia demenziale basca selvaggia, inseguimenti assurdi e comicità grottesca fuori controllo."}
        ]
    },
    # 17. movie:446354 - The Post (2017)
    {
        "seed": "movie:446354",
        "suggerimenti": [
            {"titolo": "Tutti gli uomini del presidente", "anno": 1976, "perche": "Tenacia giornalistica meticolosa, tensione tra archivi e austera integrità civile."},
            {"titolo": "Il caso Spotlight", "anno": 2015, "perche": "Pazienza investigativa rigorosa, sdegnato rigore morale e sommesso eroismo procedurale."},
            {"titolo": "Frost/Nixon - Il duello", "anno": 2008, "perche": "Elettrizzante scontro mediatico dialettico, tensione psicologica e supremo giudizio morale."},
            {"titolo": "Good Night, and Good Luck.", "anno": 2005, "perche": "Fumosa eleganza monocroma, fermezza deontologica e fiera resistenza democratica all'intolleranza."},
            {"titolo": "Anche io", "anno": 2022, "perche": "Determinazione giornalistica composta, sensibilità deontologica e coraggiosa ricerca della verità."},
            {"titolo": "Insider - Dietro la verità", "anno": 1999, "perche": "Intimidazione corporativa soffocante, straziante dilemma etico e inflessibile coraggio civile."},
            {"titolo": "Official Secrets - Segreto di stato", "anno": 2019, "perche": "Coraggio civile individuale contro lo stato, rigore etico e verità."},
            {"titolo": "Il caso Mattei", "anno": 1972, "perche": "Inchiesta politica rigorosa, scontro tra poteri oscuri e passione civile."},
            {"titolo": "Z - L'orgia del potere", "anno": 1969, "perche": "Urgenza politica febbrile, inarrestabile impeto investigativo e furente denuncia antifascista."},
            {"titolo": "Argentina, 1985", "anno": 2022, "perche": "Solenne dignità giudiziaria democratica, coraggio civile e commovente riscatto storico."},
            {"titolo": "Quo vadis, Aida?", "anno": 2020, "perche": "Straziante fallimento istituzionale internazionale, angoscia storica e disperato coraggio materno."},
            {"titolo": "La confessione", "anno": 1970, "perche": "Implacabile oppressione burocratica totalitaria, integrità morale e soffocante pressione psicologica."},
            {"titolo": "I cento passi", "anno": 2000, "perche": "Fiera ribellione civile antimafiosa, libertà d'espressione ed esemplare idealismo etico."},
            {"titolo": "Il divo", "anno": 2008, "perche": "Algido labirinto del potere ministeriale, sarcasmo solenne e rigorosa indagine."},
            {"titolo": "Romanzo di una strage", "anno": 2012, "perche": "Tensione democratica tragica, meticolosa ricostruzione storica e integrità investigativa ferita."},
            {"titolo": "Le vite degli altri", "anno": 2006, "perche": "Sorveglianza oppressiva totalitaria, risveglio della coscienza etica e silenzioso riscatto."},
            {"titolo": "Vincere", "anno": 2009, "perche": "Intransigenza morale tragica, potere mistificante e disperata rivendicazione della verità."},
            {"titolo": "State of Play", "anno": 2003, "perche": "Incalzante inchiesta giornalistica britannica, etica redazionale e torbidi intrighi governativi."},
            {"titolo": "La verità negata", "anno": 2016, "perche": "Rigore probatorio processuale inflessibile, difesa della verità storica e dignità."},
            {"titolo": "Un eroe borghese", "anno": 1995, "perche": "Solitaria fedeltà alla legge repubblicana, integrità civile e sacrificio silenzioso."}
        ]
    },
    # 18. tv:249042 - Adolescence (2025)
    {
        "seed": "tv:249042",
        "suggerimenti": [
            {"titolo": "Boiling Point - Il disastro è servito", "anno": 2021, "perche": "Angoscia in piano sequenza asfissiante, tensione realistica spasmodica e fragilità umana."},
            {"titolo": "This Is England", "anno": 2006, "perche": "Dolore proletario sincero, violenza giovanile lacerante e tenero struggimento emotivo."},
            {"titolo": "The Virtues", "anno": 2019, "perche": "Trauma psicologico devastante, pianto disperato a nudo e straziante catarsi."},
            {"titolo": "Victoria", "anno": 2015, "perche": "Vertigine in piano sequenza notturno reale, escalation drammatica e vulnerabilità pura."},
            {"titolo": "Broadchurch", "anno": 2013, "perche": "Lutto collettivo provinciale straziante, soffocante sospetto e disperata angoscia genitoriale."},
            {"titolo": "Happy Valley", "anno": 2014, "perche": "Ruvida tenacia morale britannica, terrore domestico viscerale e composto dolore emotivo."},
            {"titolo": "L'odio", "anno": 1995, "perche": "Tensione temporale urbana innescata, alienazione giovanile e violenza sociale esplosiva."},
            {"titolo": "La classe - Entre les murs", "anno": 2008, "perche": "Attrito scolastico documentaristico autentico, recitazione spontanea e vibrante pressione relazionale."},
            {"titolo": "Rosetta", "anno": 1999, "perche": "Camera a mano addosso implacabile, disperata lotta vitale e realismo scarno."},
            {"titolo": "Il ragazzo con la bicicletta", "anno": 2011, "perche": "Sofferenza infantile urgente a nudo, bisogno d'affetto e compassionevole verismo."},
            {"titolo": "4 mesi, 3 settimane, 2 giorni", "anno": 2007, "perche": "Claustrofobico terrore morale in tempo reale, gelo istituzionale e angoscia assoluta."},
            {"titolo": "L'affido - Una storia di violenza", "anno": 2017, "perche": "Tensione domestica spaventosa insostenibile, terrore infantile e claustrofobia realistica soffocante."},
            {"titolo": "Il sospetto", "anno": 2012, "perche": "Paranoia comunitaria spietata, isolamento morale straziante e composta dignità calpestata."},
            {"titolo": "Submarino", "anno": 2010, "perche": "Crudo dramma fraterno nordico, traumi infantili irrisolti e disperato affetto."},
            {"titolo": "Io, Daniel Blake", "anno": 2016, "perche": "Straziante dignità proletaria calpestata, crudo realismo sociale e commovente solidarietà."},
            {"titolo": "Precious", "anno": 2009, "perche": "Brutalità domestica sconvolgente, autentico strazio emotivo e fiera resilienza interiore."},
            {"titolo": "Un gelido inverno", "anno": 2010, "perche": "Dura disperazione rurale indurita, ostinata protezione familiare e realismo gelido."},
            {"titolo": "Fruitvale Station", "anno": 2013, "perche": "Tensione a orologeria inesorabile, autenticità quotidiana straziante e tragedia annunciata."},
            {"titolo": "Elephant", "anno": 2003, "perche": "Pedinamento contemplativo raggelante, quiete pre-strage e glaciale distacco realistico."},
            {"titolo": "Fa' la cosa giusta", "anno": 1989, "perche": "Calore estivo soffocante, tensione sociale montante e inevitabile esplosione tragica."}
        ]
    },
    # 19. movie:591275 - Fear Street Parte 3: 1666 (2021)
    {
        "seed": "movie:591275",
        "suggerimenti": [
            {"titolo": "The Witch", "anno": 2015, "perche": "Paranoia puritana soffocante, terrore folklorico autentico e oscura liberazione liberatoria."},
            {"titolo": "La pelle di Satana", "anno": 1971, "perche": "Gotico rurale fangoso inquietante, possessione diabolica giovanile ed erotismo sacrilego."},
            {"titolo": "La seduzione del male", "anno": 1996, "perche": "Isteria collettiva puritana fanatica, persecuzione ipocrita e fiera ribellione morale."},
            {"titolo": "The Wicker Man", "anno": 1973, "perche": "Spensierata follia pagana arcadica, sinistro fervore rituale e solare sacrificio fatale."},
            {"titolo": "Apostolo", "anno": 2018, "perche": "Culto rurale isolato sanguinoso, superstizione carnale e brutale tormento corporale."},
            {"titolo": "Midsommar - Il villaggio dei dannati", "anno": 2019, "perche": "Allucinazione pagana abbagliante, crudeltà rituale solare e catartica elaborazione del lutto."},
            {"titolo": "Black Death - Un viaggio all'inferno", "anno": 2010, "perche": "Pestilenza medievale cupissima, fanatismo religioso feroce e disilluso fatalismo morale."},
            {"titolo": "You're Next", "anno": 2011, "perche": "Feroce istinto di sopravvivenza, ribaltamento slasher entusiasmante e vendetta sanguinaria."},
            {"titolo": "Finché morte non ci separi", "anno": 2019, "perche": "Rituale nobiliare grottesco, brio slasher adrenalinico e catartica spietata ribellione."},
            {"titolo": "La vendetta di Halloween", "anno": 2007, "perche": "Festoso folklore macabro antologico, affettuosa atmosfera spettrale e deliziosa crudeltà."},
            {"titolo": "Licantropia", "anno": 2000, "perche": "Metafora licantropica femminista sanguigna, ribellione adolescenziale e complicità viscerale."},
            {"titolo": "Häxan", "anno": 1922, "perche": "Visionaria fascinazione occulta, superstizione medievale demoniaca e audace estetica grottesca."},
            {"titolo": "Vij", "anno": 1967, "perche": "Folk horror slavo suggestivo, veglie funebri sinistre e creature demoniache contadine."},
            {"titolo": "Hagazussa - La strega", "anno": 2017, "perche": "Ipnotico isolamento alpino pagano, paranoia superstiziosa e cupo orrore materno."},
            {"titolo": "Gretel e Hansel", "anno": 2020, "perche": "Allucinata fiaba oscura pittorica, fascinazione magica e inquietante estetica gotica."},
            {"titolo": "Enys Men", "anno": 2022, "perche": "Folk horror sonoro ipnotico, isolamento atlantico spettrale e mistero floreale arcano."},
            {"titolo": "Raw - Una cruda bellezza", "anno": 2016, "perche": "Viscerale risveglio cannibale corporale, legame fraterno sanguinario e pulsione primordiale."},
            {"titolo": "Il nido", "anno": 2019, "perche": "Gotico nobiliare claustrofobico, isolamento rurale ambiguo e raggelante terrore misterioso."},
            {"titolo": "In the Earth", "anno": 2021, "perche": "Psichedelia silvana delirante, orrore ecologico folclorico e violenza sciamanica allucinata."},
            {"titolo": "Non si sevizia un paperino", "anno": 1972, "perche": "Superstizione meridionale arcaica feroce, caccia alle streghe provinciale e terrore."}
        ]
    },
    # 20. movie:1236153 - Mercy - Sotto accusa (2026)
    {
        "seed": "movie:1236153",
        "suggerimenti": [
            {"titolo": "Searching", "anno": 2018, "perche": "Frenetica indagine digitale schermica, angoscia temporale e disperato affetto filiale."},
            {"titolo": "Minority Report", "anno": 2002, "perche": "Paranoia algoritmica predestinata, fuga tecnologica al cardiopalma e determinismo inquietante."},
            {"titolo": "Source Code", "anno": 2011, "perche": "Simulazione claustrofobica a orologeria, ripetizione investigativa febbrile ed eroismo disperato."},
            {"titolo": "In linea con l'assassino", "anno": 2002, "perche": "Intrappolamento telefonico in tempo reale, tensione psicologica implacabile ed espiazione."},
            {"titolo": "Gattaca - La porta per l'universo", "anno": 1997, "perche": "Rigido determinismo genetico distopico, sorveglianza asfissiante e silenziosa tenacia umana."},
            {"titolo": "L'uomo che fuggì dal futuro", "anno": 1971, "perche": "Clinica oppressione tecnologica computerizzata, sedazione burocratica e disperata fuga libertaria."},
            {"titolo": "Buried - Sepolto", "anno": 2010, "perche": "Agonizzante claustrofobia estrema, batteria telefonica in esaurimento e terrore solitario."},
            {"titolo": "Cube - Il cubo", "anno": 1997, "perche": "Spietata trappola geometrica impersonale, paranoia da eliminazione e angoscia claustrofobica."},
            {"titolo": "Exam", "anno": 2009, "perche": "Spietata prova corporativa a tempo, sospetto psicologico claustrofobico ed enigmi."},
            {"titolo": "Ex Machina", "anno": 2014, "perche": "Gelida dialettica algoritmica sintetica, scacchiera psicologica e tradimento calcolato."},
            {"titolo": "Oxygène", "anno": 2021, "perche": "Risveglio criogenico claustrofobico, ossigeno in esaurimento e febbrile ricostruzione identitaria."},
            {"titolo": "I Am Mother", "anno": 2019, "perche": "Logica materna algoritmica asettica, reclusione sotterranea e glaciale manipolazione."},
            {"titolo": "Level Five", "anno": 1997, "perche": "Interfaccia informatica contemplativa, memorie storiche archiviate e solitudine digitale."},
            {"titolo": "The Call", "anno": 2020, "perche": "Connessione telefonica temporale letale, terrore psicologico crescente e disperata sopravvivenza."},
            {"titolo": "Apri gli occhi", "anno": 1997, "perche": "Inganno criogenico disorientante, identità frammentata e paranoia tra realtà e finzione."},
            {"titolo": "Anon", "anno": 2018, "perche": "Trasparenza panottica digitale asettica, cancellazione visiva e paranoia tecnologica."},
            {"titolo": "Red Rooms", "anno": 2023, "perche": "Morbo ossessivo per il crimine digitale, gelo processuale e tensione claustrofobica."},
            {"titolo": "Il buco", "anno": 2019, "perche": "Spietata struttura verticale distopica, meccanismo punitivo crudele e lotta disperata."},
            {"titolo": "Innocence", "anno": 2004, "perche": "Raffinata speculazione filosofica su androidi, bambole assassine e freddezza cibernetica."},
            {"titolo": "Timecrimes", "anno": 2007, "perche": "Inesorabile paradosso temporale causale, fuga angosciosa e claustrofobico destino autoinflitto."}
        ]
    }
]

# Write draft to test file
with open('.scratch/test_risposte_draft.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Saved .scratch/test_risposte_draft.json. Validating now...")
validate_file('.scratch/test_risposte_draft.json')
