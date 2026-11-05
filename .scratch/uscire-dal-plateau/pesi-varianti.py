"""Scrive i file dei pesi per le varianti, partendo da V42 e dalla diagnosi per tipo."""
import json
from pathlib import Path
V42 = json.loads(Path('services/graph/data/v45/pesi.json').read_text(encoding='utf-8'))
# A. riallineato alla diagnosi: ogni tipo pesa quanto la sua precisione dichiarata (r20/rescue/tonal)
RIALLINEATO = {
    'COVISION': 0.4, 'KWSEM': 0.5, 'CAST': 0.2, 'PROD': 0.15, 'LIST': 1.0, 'CONTESTI': 0.2,
    'TRIBU': 0.1, 'RESID': 0.3, 'TRAMA': 0.1, 'RRFST': 1.0, 'DIR': 0.15, 'COLL': 0.1,
    'CREWPROP': 0.5, 'LISTSEM': 1.0}
# B. conservativo: alza solo i due tipi umani e abbassa i due peggiori, il resto non si tocca
CONSERVATIVO = dict(V42, LISTSEM=1.0, CREWPROP=0.4, KWSEM=0.6, DIR=0.15, RESID=0.6)
for nome, p in (('riallineato', RIALLINEATO), ('conservativo', CONSERVATIVO)):
    Path(f'.cache/pesi-{nome}.json').write_text(json.dumps(p, indent=1), 'utf-8')
    print(nome, 'somma', round(sum(p.values()), 2))
