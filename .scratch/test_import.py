import sys
sys.path.insert(0, '.')
import json
from collections import Counter, defaultdict
import pandas as pd
from services.graph_dense import config as C, data as D
from scratch.banco_casi.ingestione import norm, indice, aggancia

# Note: scratch.banco_casi might need path adjustment
