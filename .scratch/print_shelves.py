from graph import canon as K
from graph.servizio import get_engine_v45, get_vicini_affinita
from graph.interessi import scaffali

engine = get_engine_v45()
W_aff = get_vicini_affinita()

for user in ["warnok", "pepsipex"]:
    chiavi, _, plays, eta = K.storia_trakt(user, ordine="recente")
    semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
    shs = scaffali(engine=engine, semi=semi, n=8, W_aff=W_aff)
    print(f"\n==================== {user.upper()} (totale righe = {len(shs)}) ====================")
    for s in shs:
        print(f"Slot {s.slot_position:2d}: [{s.medium:6s}] nome_display='{s.nome_display}' | nome='{s.nome}' (id={s.catalog_id})")
