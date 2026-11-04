import sys
sys.path.insert(0, '.')
sys.path.insert(0, '.scratch')
from check_seed_lists import B, idx, chiavi, get_meta, ing, test_candidates

def test_items(seed_key, items):
    errs, matched, countries, decs, non_en = test_candidates(seed_key, items)
    print(f"=== {seed_key} ===")
    if errs:
        for e in errs:
            print("  ERROR:", e)
    else:
        print("  CLEAN! 0 errors.")
    print(f"  Decades ({len(decs)}): {sorted(decs)} | Non-EN: {non_en}")
    print(f"  Top countries: {dict(countries.most_common(4))}")
    return errs, matched

# Test Seed 1
seed_01 = [
    {"titolo": "Face/Off", "anno": 1997, "perche": "Operatic melodrama, unrestrained heroic excess and explosive stylized action."},
    {"titolo": "Con Air", "anno": 1997, "perche": "Unabashed macho swagger, bombastic destruction and earnest melodrama."},
    {"titolo": "Crank", "anno": 2006, "perche": "Manic adrenaline, relentless kinetic momentum and absurd cartoon physics."},
    {"titolo": "Speed", "anno": 1994, "perche": "Breathless high-stakes kinetic thrill with relentless, over-the-top momentum."},
    {"titolo": "Bad Boys II", "anno": 2003, "perche": "Maximalist, hyper-destructive spectacle with operatic machismo and excess."},
    {"titolo": "Commando", "anno": 1985, "perche": "Unapologetic macho grandiosity, absurd firepower and self-serious spectacle."},
    {"titolo": "Hard Boiled", "anno": 1992, "perche": "Operatic gun-ballet, extreme kinetic spectacle and earnest brotherhood."},
    {"titolo": "Supercop", "anno": 1992, "perche": "Insane stunt escalation, fearless kinetic bravura and breathless pacing."},
    {"titolo": "Drunken Master II", "anno": 1994, "perche": "Dazzling physical virtuosity, relentless momentum and comedic swagger."},
    {"titolo": "The Killer", "anno": 1989, "perche": "Operatic blood-soaked melodrama, heightened brotherhood and explosive gunplay."},
    {"titolo": "A Better Tomorrow", "anno": 1986, "perche": "Operatic heroic bloodshed, fierce brotherly loyalty and stylized violent poetry."},
    {"titolo": "Taxi", "anno": 1998, "perche": "Frenetic vehicular chases, breezy swagger and cheeky comic bravado."},
    {"titolo": "Banlieue 13", "anno": 2004, "perche": "High-adrenaline physical stunts, kinetic parkour and gritty kinetic rush."},
    {"titolo": "Wasabi", "anno": 2001, "perche": "Over-the-top action beats, culture-clash swagger and explosive comic energy."},
    {"titolo": "Redline", "anno": 2009, "perche": "Maximalist sensory overload, hyper-kinetic racing and pure adrenaline aesthetic."},
    {"titolo": "Versus", "anno": 2000, "perche": "Hyper-stylized zombie-action mashup with defiant swagger and relentless pace."},
    {"titolo": "Ong-Bak - Nato per combattere", "anno": 2003, "perche": "Jaw-dropping physical stunt-work, relentless kinetic energy and fighting bravura."},
    {"titolo": "A Bittersweet Life", "anno": 2005, "perche": "Heightened operatic crime melodrama, lavish style and ferocious kinetic vengeance."},
    {"titolo": "The Man from Nowhere", "anno": 2010, "perche": "Fierce protective fury, bone-crunching combat and relentless emotional drive."},
    {"titolo": "RRR", "anno": 2022, "perche": "Operatic melodrama, physics-defying heroics and unrestrained emotional spectacle."}
]

errs, _ = test_items("movie:385687", seed_01)
