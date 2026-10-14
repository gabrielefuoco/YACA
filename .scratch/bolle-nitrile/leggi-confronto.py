"""leggi-confronto.py — dal log del banco sonda, una tabella per leggere le varianti a colpo d'occhio.

Per ogni sentinella: la dimensione della bolla in ogni variante, e i movimenti (usciti/entrati).
Non decide niente: serve a leggere 13 partizioni senza perdersi.
"""
import pathlib
import re

LOG = pathlib.Path(__file__).resolve().parent.parent / "grafo-servibile" / "log" / "02-09-varianti.log"
testo = LOG.read_text(encoding="utf-8", errors="replace")

# --- spezza il log in blocchi per variante
blocchi = {}
for pezzo in re.split(r"^BANCO SONDA — ", testo, flags=re.M)[1:]:
    nome = pezzo.split("\n", 1)[0].split("(")[0].strip()
    blocchi[nome] = pezzo

ORDINE = ["V1", "V2", "V3", "V4", "V5", "V6", "V7",
          "V8-CPM0.005", "V8-CPM0.01", "V8-CPM0.02", "V8-RB30", "V8-RB60"]
ORDINE = [v for v in ORDINE if v in blocchi]
if not ORDINE:
    print("nessun blocco nel log")
    raise SystemExit(0)

# --- estrai, per ogni variante, la riga "sentinella -> (dim, usciti, entrati)"
righe = {}
for v in ORDINE:
    righe[v] = {}
    attuale = None
    for line in blocchi[v].splitlines():
        m = re.match(r"^\[\s*([a-z\-]+)\]\s+(.+?)\s{2,}\(", line)
        if m:
            attuale = (m.group(1), m.group(2).strip())
            righe[v][attuale] = {"dim": None, "usciti": 0, "entrati": 0, "nota": ""}
            continue
        if attuale is None:
            continue
        d = righe[v][attuale]
        m = re.search(r"bolla \d+ con (\d+) titoli", line)
        if m:
            d["dim"] = int(m.group(1))
        m = re.match(r"^\s*-\s*USCITI\s*\((\d+)\)", line)
        if m:
            d["usciti"] = int(m.group(1))
        m = re.match(r"^\s*\+\s*ENTRATI\s*\((\d+)\)", line)
        if m:
            d["entrati"] = int(m.group(1))
        if "bolla IDENTICA" in line:
            d["nota"] = "identica"
        m = re.search(r"!!\s*(NON TROVATO)", line)
        if m:
            d["nota"] = m.group(1)

SENT = [k for k in righe[ORDINE[0]]]
print("=" * 132)
print("LE LETTURE, UNA TABELLA — dimensione della bolla per sentinella (usciti/entrati rispetto a bolle2-E)")
print("=" * 132)
intest = f"{'sentinella':<38}{'bolle2-E':>9}" + "".join(f"{v.replace('V8-','8·'):>10}" for v in ORDINE)
print(intest)
print("-" * len(intest))
RIF = {"Le jene di Chicago": 35, "Garfield - Il Supergatto": 15, "Gidget a Roma": 15,
       "La storia infinita": 15, "Wimbledon": 15, "Banana Fish": 31, "Barakamon": 24,
       "Watamote": 27, "Boys over Flowers": 26, "Flying Witch": 24,
       "Il matrimonio di Maria Braun": 36, "I sette samurai": 41, "Profondo Rosso": 26,
       "Stalker": 13, "Il tamburo di latta": 16, "Into Darkness - Star Trek": None,
       "Guerre stellari": None, "The Mandalorian": 12, "Star Trek: Discovery": 16,
       "Żeby nie było śladów": None}
gruppo_prima = None
for (gruppo, nome) in SENT:
    if gruppo != gruppo_prima:
        print(f"\n-- {gruppo.upper()} --")
        gruppo_prima = gruppo
    d = righe[ORDINE[0]][(gruppo, nome)]
    r = RIF.get(nome)
    cell = f"{d['dim']:>9}" if d["dim"] else "        -"
    linea = f"{nome[:37]:<38}{cell}"
    for v in ORDINE:
        x = righe[v].get((gruppo, nome))
        if not x or x["dim"] is None:
            linea += f"{'-':>10}"
        elif x["nota"] == "identica":
            linea += f"{'=':>10}"
        elif x["usciti"] == 0 and x["entrati"] == 0:
            linea += f"{str(x['dim']):>7}   ="
        else:
            linea += f"{x['dim']:>6} -{x['usciti']}+{x['entrati']}"
    print(linea)

print("\n\nLEGENDA:  'dim -usciti +entrati' = quanto e' cambiata la bolla rispetto a bolle2-E")
print("           '=' = identica · '-' = non presente nel log")
print("\n\n### LE RIGHE DEL GIUDICE — quante bolle, quante con >=15, mediana ###")
for v in ORDINE:
    print(f"  {v:<14} vedi il riassunto in fondo al log")
