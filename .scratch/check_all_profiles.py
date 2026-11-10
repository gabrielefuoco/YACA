from graph import canon as K
from graph.servizio import get_engine_v45, get_vicini_affinita
from graph.interessi import scaffali

engine = get_engine_v45()
W_aff = get_vicini_affinita()

# Check carverclan and other users
for user in ["carverclan", "hammers-lists", "sappss", "moppierhead", "1jacobjohn", "flixinatoor99", "sangam456", "castoffcrown"]:
    try:
        chiavi, _, plays, eta = K.storia_trakt(user, ordine="recente")
    except Exception as e:
        continue
    semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
    shs = scaffali(engine=engine, semi=semi, n=8, W_aff=W_aff)
    print(f"{user:15s}: {len(shs):2d} righe totali")
    has_isolated = any(not (s.nome_display.endswith("(film)") or s.nome_display.endswith("(serie)")) for s in shs)
    if has_isolated:
        for s in shs:
            if not (s.nome_display.endswith("(film)") or s.nome_display.endswith("(serie)")):
                print(f"   -> ISOLATO (senza controparte): nome_display='{s.nome_display}', nome='{s.nome}', med={s.medium}")
