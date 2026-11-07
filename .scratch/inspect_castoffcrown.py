from graph import canon as K
from graph import interessi as I
from graph.runtime import Engine

engine = Engine.carica_transizione('services/graph/data/v45-transizione/transizione-pota16.npz')
W = I.carica_matrice_affinita()

chiavi, righe, plays, eta = K.storia_trakt('castoffcrown', ordine='recente')
semi = [{'key': k, 'play': float(p), 'eta': float(e)} for k, p, e in zip(chiavi, plays, eta)]
tutti = I.clusters(engine, [engine.row_of[k] for k in chiavi], eta=[float(e) for e in eta], plays=[float(p) for p in plays], W_aff=W)
serviti = I.scaffali(engine, semi, W_aff=W)
id_serviti = {s.catalog_id for s in serviti}

print(f"Total eligible: {len(tutti)}, served: {len(serviti)}")
for c in sorted(tutti, key=lambda x: -x.size):
    st = "SERVITO" if c.catalog_id in id_serviti else "escluso"
    reps = [m["titolo"] for m in c.semi_rappresentativi[:3]]
    print(f"{st:7s} | sz={c.size:2d} | eta={c.min_eta:5.1f} | src={c.nome_fonte:10s} | {c.nome[:40]:40s} | {reps}")
