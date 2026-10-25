"""La lettura a occhio dei 100 vicini: i miei tre livelli, titolo per titolo.

I gradi sono un giudizio, non una misura. I rank sono quelli stampati da `04-sonda.py`.
  giusto      = stessa mondo / stesso pubblico: lo mostrerei
  dubbi       = stesso pubblico largo o legame debole ma spiegabile (regista, remake, genere vicino)
  sbagliato   = mondo diverso, non lo mostrerei
"""
import collections

WRONG = {
    "movie:557": [52, 55, 61, 63, 68, 74, 76, 77, 78, 80, 84, 87, 88, 90, 91, 92, 94, 96, 97, 99, 100],
    "movie:2309": [37, 41, 43, 44, 45, 46, 48, 49, 50, 51, 53, 54, 56, 57, 58, 59, 60, 64, 65, 66, 67, 68,
                   69, 74, 75, 78, 82, 83, 84, 88, 91, 92, 93, 96, 97, 98, 99, 100],
    "movie:1265": [44, 45, 47, 48, 49, 50, 51, 53, 58, 59, 60, 61, 63, 64, 65, 66, 67, 68, 70, 71, 72, 74,
                   78, 81, 83, 84, 85, 86, 87, 88, 89, 90, 92, 93, 94, 95, 96, 97, 99, 100],
    "movie:27205": [32, 34, 58, 59, 70, 71, 73, 74, 75, 78, 79, 80, 83, 85, 87, 88, 89, 91, 94, 96, 98],
    "movie:381341": [27, 33, 34, 36, 37, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 50, 51, 53, 55, 56, 58, 59,
                     61, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 84,
                     85, 86, 87, 88, 89, 90, 92, 93, 94, 95, 96, 98, 99, 100],
    "tv:1396": [14, 22, 25, 31, 33, 34, 37, 39, 40, 41, 43, 44, 45, 46, 49, 50, 51, 52, 54, 56, 57, 58, 59,
                60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 75, 76, 77, 82, 92, 94, 96, 97],
}
DUB = {
    "movie:557": [20, 33, 34, 37, 39, 51, 56, 58, 60, 73, 85, 86, 93, 95, 98],
    "movie:2309": [21, 28, 38, 42, 47, 55, 63, 87],
    "movie:1265": [46, 54, 56, 57, 76, 77, 80, 82],
    "movie:27205": [25, 28, 29, 30, 31, 33, 35, 36, 38, 44, 45, 46, 49, 50, 52, 53, 54, 55, 60, 61, 62, 63,
                    65, 66, 67, 68, 69, 76, 77, 81, 82, 84, 86, 92, 93, 95, 97],
    "movie:381341": [21, 24, 25, 26, 30, 31, 52, 54, 57, 60, 76, 91, 97],
    "tv:1396": [11, 13, 15, 16, 17, 18, 19, 20, 26, 28, 30, 36, 38, 47, 53],
}
NOMI = {
    "movie:557": "Spider-Man (2002)",
    "movie:2309": "Inkheart (2008)",
    "movie:1265": "Un ponte per Terabithia (2007)",
    "movie:27205": "Inception (2010)",
    "movie:381341": "Perfetti sconosciuti (2016)",
    "tv:1396": "Breaking Bad (2008)",
}

print(f"{'titolo':30s} {'giusti':>6} {'dubbi':>5} {'sbagl':>5} | {'1o dubbio':>13} {'1o sbagliato':>12}")
for k, nome in NOMI.items():
    w, d = set(WRONG[k]), set(DUB[k])
    r = [x for x in range(1, 101) if x not in w and x not in d]
    assert len(r) + len(w) + len(d) == 100 and not (w & d)
    print(f"{nome:30s} {len(r):6d} {len(d):5d} {len(w):5d} | {min(d) if d else 0:13d} {min(w):12d}")

print("\nPrecisione a N (giusti / dubbi / sbagliati):")
for k, nome in NOMI.items():
    w, d = set(WRONG[k]), set(DUB[k])
    righe = []
    for N in (10, 20, 30, 50, 100):
        r = sum(1 for x in range(1, N + 1) if x not in w and x not in d)
        dd = sum(1 for x in range(1, N + 1) if x in d)
        ww = sum(1 for x in range(1, N + 1) if x in w)
        righe.append(f"top{N}: {r}/{N} ({100*r/N:.0f}%) giusti, {dd} dubbi, {ww} sbagliati")
    print(f"  {nome}")
    for x in righe:
        print("    " + x)
