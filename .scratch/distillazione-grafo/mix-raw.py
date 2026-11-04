"""mix-raw.py — il mixer ma sui tipi GREZZI (tipi/), per riprodurre V14."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import mixer
mixer.SRC = 'services/graph/data/tipi'
mixer.DST = 'services/graph/data/v12'
sys.argv = ['mixer'] + sys.argv[1:]
mixer.main()
