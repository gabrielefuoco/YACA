import sys
sys.path.insert(0, '.')
import json
import pandas as pd
from services.graph_dense import config as C, data as D
import importlib.util

spec = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

from scratch.validate_risposte import validate_file

raw_candidates = [
    # Seed 1: movie:2062 (Ratatouille)
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
    # Seed 2: movie:369885 (Allied)
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
            {"titolo": "Il libro nero", "anno": 2006, "perche": "Tensione spionistica avvincente, coraggio disperato e tradimenti incrociati."} # wait, Black Book is Il libro nero!
        ]
    }
]
