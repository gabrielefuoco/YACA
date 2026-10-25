"""Costanti del modulo. Un posto solo; i valori sono scelte dichiarate nel ticket."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GD = Path(__file__).resolve().parent
DATA = GD / "data"                 # risultati nuovi (gitignored)
SRC = DATA / "graph"               # copia read-only degli artefatti V10
TMDB = ROOT / ".cache" / "tmdb"    # Parquet TMDB (copiati dal mate)

# --- teacher
TOPK = 25
FLOOR_REL = 0.05       # 5% del massimo *trasformato* di riga
FLOOR_ABS = 0.02
SUPPORT_M0 = 50.0
DIM = 256

# --- studente
HIDDEN = 256
DROP = 0.20
MODALITY_DROP = 0.35
FEATURE_DROP = 0.25
BATCH = 512
EPOCHS = 25
LR = 1.5e-3
WD = 1e-4
TAU = 0.07
TAU_BOLLA = 0.10
LAMBDA_SVD = 0.50
LAMBDA_BOLLA = 0.30
TV_WEIGHT = 1.50
RIDGE_ALPHA = 30.0
SEED = 20261021
EXTRA_PG = True        # token compositi paese|decennio|genere

# --- split
N_TEST_FILM = 600
N_TEST_SERIE = 600
N_LOW = 200            # per medium, VOT < 20
MIN_PLOT = 0
SEED_SPLIT = 13

# --- nomi file
TRIANGLE = "bolle-eterogeneo-V10-p1.0-triangolo.npz"
PARTITION = "bolle-eterogeneo-subvoti.npy"
SPAZI = "spazi-trakt.npz"
TITOLI = "titoli-canone.txt"
META = "metadati-canone.npz"
BOLLE = "bolle.json"
MAPPA = "mappa-finale-6-2.npz"
TFIDF = "05-tfidf.npz"
VOCAB = "05-vocab.json"
IDF = "05-idf.npy"
IMPRONTE = "05-impronte.json"
TRAMA = "trama-qwen3b.npy"
TRAMA_IDX = "trama-qwen3b-idx.npy"

for p in (DATA, SRC):
    p.mkdir(parents=True, exist_ok=True)
