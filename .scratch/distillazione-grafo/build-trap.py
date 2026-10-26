"""Costruisce il trap set completo: known-bad/good per 50 titoli (per nome, risolti sul canone)."""
import json
import numpy as np
from services.graph_dense import config as C, data as D

B = D.basic(); titoli = B["titoli"]; ro = B["row_of"]
def find(nome):
    for i, t in enumerate(titoli):
        if t == nome:
            return [f"{'tv' if B['is_tv'][i] else 'movie'}:{B['tmdb'][i]}"]
    out = [i for i, t in enumerate(titoli) if t.startswith(nome)]
    return [f"{'tv' if B['is_tv'][i] else 'movie'}:{B['tmdb'][i]}" for i in out[:3]]
def K(nome):
    r = find(nome)
    return r[0] if r else None

TRAP = {
 "brand_trap": [
  ("movie:346698", "Barbie", ["Barbie Dreamtopia - Festival del divertimento", "Barbie: Mermaid Power", "Barbie - Il segreto delle fate"],
   ["Everything Everywhere All at Once", "Red", "Encanto", "Luca", "Crudelia"]),
  ("movie:508883", "Il ragazzo e l'airone", ["舞台『千と千尋の神隠し』"],
   ["Il mio vicino Totoro", "Il castello errante di Howl", "Princess Mononoke", "La citta incantata"]),
  ("movie:137106", "The Lego Movie", ["The Lego Batman Movie", "The Lego Ninjago Movie"],
   ["Toy Story", "Wreck-It Ralph", "Spider-Man: Across the Spider-Verse", "The Incredibles"]),
  ("movie:502356", "Super Mario Bros. - Il film", ["Super Mario Bros.", "Mario"],
   ["Sonic - Il film", "Raya e l'ultimo drago", "Puss in Boots", "Zootropolis"]),
  ("movie:454626", "Sonic - Il film", ["Sonic - Il film 2", "Sonic 3 - Il film"],
   ["Detective Pikachu", "Super Mario Bros. - Il film", "Cattivissimo me", "Paddington"]),
  ("movie:447404", "Detective Pikachu", ["Pokemon"],
   ["Sonic - Il film", "Ralph Spaccatutto", "Ready Player One", "Paddington 2"]),
  ("movie:353486", "Jumanji - Benvenuti nella giungla", ["Jumanji", "Jumanji: The Next Level"],
   ["Night at the Museum", "Ready Player One", "Uncharted", "Indiana Jones"]),
  ("movie:425", "Ice Age", ["Ice Age 2", "Ice Age 3", "Ice Age 4"],
   ["Madagascar", "Shrek", "Rio", "Zootropolis"]),
  ("movie:585", "Monsters & Co.", ["Monsters University", "Party Central"],
   ["Toy Story", "Gli Incredibili", "Shrek", "Cars - Motori ruggenti"]),
  ("movie:862", "Toy Story", ["Toy Story 2", "Toy Story 3", "Toy Story 4"],
   ["Monsters & Co.", "Cars - Motori ruggenti", "A Bug's Life", "Gli Incredibili"]),
 ],
 "literal_title": [
  ("movie:597", "Titanic", ["Titanic II", "Titanica", "Titanic: i segreti del film"],
   ["Il paziente inglese", "Via col vento", "Balla coi lupi", "Il ponte sul fiume Kwai"]),
  ("movie:152601", "Her", ["Hercules"],
   ["Lost in Translation", "Eternal Sunshine of the Spotless Mind", "Ex Machina", "Lars and the Real Girl"]),
  ("movie:64690", "Drive", ["Drive Angry", "Drive - Notte fatale"],
   ["Bronson", "Nightcrawler", "Only God Forgives", "The Place Beyond the Pines"]),
  ("movie:949", "Heat - La sfida", ["Heat"],
   ["Il padrino", "Quei bravi ragazzi", "Scarface", "The Departed - Il bene e il male"]),
  ("movie:14160", "Up", ["Up - Un'avventura di Carl e Russell"],
   ["Monsters & Co.", "Coco", "Soul", "WALL-E"]),
  ("movie:11429", "Crash - Contatto fisico", ["Crash"],
   ["American Beauty", "Magnolia", "Traffic", "Babel"]),
  ("movie:1637", "Speed", ["Speed 2 - Senza limiti"],
   ["Die Hard", "Trappola di cristallo", "The Rock", "Con Air"]),
  ("movie:686", "Contact", ["Contact"],
   ["Arrival", "2001: Odissea nello spazio", "Interstellar", "The Martian"]),
  ("movie:2280", "Big", ["Big Hero 6"],
   ["Il giorno della marmotta", "Ritorno al futuro", "A Christmas Carol", "Freaky Friday"]),
  ("movie:861", "Total Recall", ["Total Recall - Atto di forza"],
   ["Atto di forza", "Blade Runner", "Matrix", "RoboCop"]),
 ],
 "event": [
  ("tv:87108", "Chernobyl", ["Il complotto di Chernobyl - The Russian Woodpecker", "Chernobyl: I nastri perduti"],
   ["Deepwater - Inferno sull'Oceano", "Pandora", "Volo 174: caduta libera", "The Challenger Disaster"]),
  ("movie:872585", "Oppenheimer", ["Top Gun: Maverick", "Pinocchio di Guillermo del Toro"],
   ["The Day After Trinity", "L'ombra di mille soli", "Manhattan", "To End All War: Oppenheimer & the Atomic Bomb"]),
  ("movie:374720", "Dunkirk", ["Top Gun: Maverick"],
   ["L'ora più buia", "Salvate il soldato Ryan", "Il pianista", "Schindler's List"]),
  ("movie:399055", "L'ora più buia", ["Top Gun: Maverick"],
   ["Dunkirk", "Schindler's List", "Il pianista", "Lincoln"]),
  ("movie:424", "Schindler's List", ["Top Gun: Maverick"],
   ["Il pianista", "L'ora più buia", "La lista di Schindler", "Il diario di Anna Frank"]),
  ("movie:205596", "The Imitation Game", ["Top Gun: Maverick"],
   ["A Beautiful Mind", "The Social Network", "Enigma", "Il codice da Vinci"]),
  ("movie:76203", "12 anni schiavo", ["Top Gun: Maverick"],
   ["Lincoln", "Django Unchained", "Il buio oltre la siepe", "The Help"]),
  ("movie:72976", "Lincoln", ["Top Gun: Maverick"],
   ["12 anni schiavo", "Schindler's List", "Amistad", "Il buio oltre la siepe"]),
  ("movie:568", "Apollo 13", ["Top Gun: Maverick"],
   ["The Right Stuff", "First Man", "2001: Odissea nello spazio", "Gravity"]),
  ("movie:37799", "The Social Network", ["Top Gun: Maverick"],
   ["A Beautiful Mind", "The Imitation Game", "Steve Jobs", "Moneyball"]),
 ],
 "franchise": [
  ("movie:238", "Il padrino", ["Il padrino - Parte III", "Mario Puzo's The Godfather: The Complete Novel for Television"],
   ["Quei bravi ragazzi", "Scarface", "The Departed - Il bene e il male", "Pulp Fiction"]),
  ("movie:348", "Alien", ["Tesoro, mi si sono ristretti i ragazzi", "Skyline"],
   ["Aliens - Scontro finale", "2001: Odissea nello spazio", "La cosa", "Blade Runner"]),
  ("movie:155", "Il cavaliere oscuro", ["L'oro delle montagne", "Lassie"],
   ["Batman Begins", "The Batman", "Watchmen", "Inception"]),
  ("movie:120", "Il Signore degli Anelli - La Compagnia dell'Anello", ["Warcraft - L'inizio"],
   ["Il Signore degli Anelli - Le due torri", "Lo Hobbit", "Il Trono di Spade", "Harry Potter e la pietra filosofale"]),
  ("movie:11", "Guerre stellari", ["Star Wars: L'ascesa di Skywalker"],
   ["L'Impero colpisce ancora", "Il ritorno dello Jedi", "Star Trek", "Dune"]),
  ("movie:671", "Harry Potter e la pietra filosofale", ["Harry Potter e i Doni della Morte"],
   ["Il Signore degli Anelli - La Compagnia dell'Anello", "Le cronache di Narnia", "Percy Jackson", "Il Trono di Spade"]),
  ("movie:603", "Matrix", ["Matrix Resurrections"],
   ["Matrix Reloaded", "Blade Runner", "Ghost in the Shell", "Inception"]),
  ("movie:218", "Terminator", ["Terminator Genisys"],
   ["Terminator 2 - Il giorno del giudizio", "RoboCop", "Aliens - Scontro finale", "Blade Runner"]),
  ("movie:1366", "Rocky", ["Rocky IV"],
   ["Toro scatenato", "Creed", "Il campione", "Warrior"]),
  ("movie:329", "Jurassic Park", ["Jurassic Park III"],
   ["Il mondo perduto - Jurassic Park", "King Kong", "Godzilla", "Indiana Jones"]),
 ],
 "cold_autoriale": [
  ("movie:545611", "EEAAO", ["Luck", "Strange World - Un mondo misterioso", "Raya e l'ultimo drago"],
   ["Spider-Man: Across the Spider-Verse", "Dune", "Matrix", "Barbie"]),
  ("movie:496243", "Parasite", ["Now You See Me", "The Door"],
   ["Joker", "Burning - L'amore brucia", "Scappa - Get Out", "Memorie di un assassino"]),
  ("tv:1438", "The Wire", ["CSI - Scena del crimine"],
   ["Homicide", "NYPD - New York Police Department", "The Shield", "Line of Duty"]),
  ("movie:792307", "Povere creature!", ["Grand Paris"],
   ["La persona peggiore del mondo", "Past Lives", "Aftersun", "Titane"]),
  ("movie:129", "La citta incantata", ["舞台『千と千尋の神隠し』"],
   ["Il mio vicino Totoro", "Princess Mononoke", "Il castello errante di Howl", "Ponyo sulla scogliera"]),
  ("movie:550", "Fight Club", ["Fast & Furious"],
   ["Memento", "The Game - Nessuna regola", "Pulp Fiction", "The Prestige"]),
  ("movie:157336", "Interstellar", ["Mission to Mars", "Pianeta rosso"],
   ["Arrival", "The Martian", "Gravity", "Inception"]),
  ("movie:27205", "Inception", ["Fast & Furious"],
   ["Interstellar", "Matrix", "Memento", "The Prestige"]),
  ("movie:680", "Pulp Fiction", ["Mumbaai"],
   ["I soliti sospetti", "Fargo", "Le iene", "Jackie Brown"]),
  ("movie:244786", "Whiplash", ["La La Land"],
   ["Il cigno nero", "Birdman o (L'imprevedibile virtù dell'ignoranza)", "Sound of Metal", "Bohemian Rhapsody"]),
 ],
}
out = {"categorie": {}}
miss = []
for cat, items in TRAP.items():
    lst = []
    for key, nome, bad, good in items:
        b = [K(x) for x in bad]; g = [K(x) for x in good]
        miss += [x for x, y in zip(bad, b) if y is None] + [x for x, y in zip(good, g) if y is None]
        lst.append({"key": key, "nome": nome, "bad": [x for x in b if x], "good": [x for x in g if x]})
    out["categorie"][cat] = lst
json.dump(out, open(C.DATA / "trap-set.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("scritto trap-set.json · non trovati:", len(miss))
if miss:
    print(miss[:20])
