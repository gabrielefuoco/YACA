import sys
sys.path.insert(0, 'services')
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

e = Engine.carica_transizione()
W_aff = I.carica_matrice_affinita()

meta = K.metadati()
titoli = meta['TIT']

for user in ['warnok', 'pepsipex']:
    keys, _, plays, eta = K.storia_trakt(user, ordine='recente')
    semi = [{'key': str(k), 'plays': float(p), 'eta_giorni': float(et)} for k, p, et in zip(keys, plays, eta)]
    shelves = I.scaffali(e, semi, n=8, W_aff=W_aff)
    print(f"\n==================== {user.upper()} (16 RIGHE TOTALI) ====================")
    for idx, sh in enumerate(shelves, 1):
        top_titles = [t['titolo'] if 'titolo' in t else titoli[e.row_of[t['key']]] for t in sh.titoli[:4]]
        is_counterpart = idx > 8
        prefix = "  [CONTROPARTE]" if is_counterpart else "  [PRIMARIO]   "
        print(f"{idx:2d}. {prefix} [{sh.medium:<6}] {sh.nome:<32} (conf: {sh.confidenza:.2f})")
        print(f"      Primi 4 titoli: {', '.join(top_titles)}")
