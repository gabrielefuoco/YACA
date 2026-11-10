import sys
sys.path.insert(0, 'services')
from graph import canon as K
from graph.runtime import Engine
from graph import assi

e = Engine.carica_transizione()
keys, _, plays, eta = K.storia_trakt('warnok', ordine='recente')
semi = [{'key': str(k), 'plays': float(p), 'eta_giorni': float(et)} for k, p, et in zip(keys, plays, eta)]

meta = K.metadati()
titoli = meta['TIT']

base = e.raccomanda(semi, cap=20)
base_keys = [x['key'] for x in base]

print('=== WARNOK BASELINE TOP 20 ===')
for idx, x in enumerate(base, 1):
    r = e.row_of[x['key']]
    m = x['medium']
    print(f"{idx:2d}. {titoli[r]:<35} [{m:<6}] | Tono: {e.tono[r]:+5.2f} | Comp: {e.complessita[r]:+5.2f} | Punteggio: {x['punteggio']:.6f}")

for s_val, s_name in [(-1.0, 'Tono Leggero (-1.0)'), (+1.0, 'Tono Cupo (+1.0)'), (-1.0, 'Complessita Lineare (-1.0)'), (+1.0, 'Complessita Esigente (+1.0)')]:
    is_tono = 'Tono' in s_name
    kw = {'tono': s_val} if is_tono else {'complessita': s_val}
    res = e.raccomanda(semi, cap=20, **kw)
    new_keys = [x['key'] for x in res]
    
    survived = [k for k in base_keys if k in new_keys]
    leaving = [k for k in base_keys if k not in new_keys]
    entering = [k for k in new_keys if k not in base_keys]
    
    print(f"\n=== {s_name} ===")
    print(f"Sopravvissuti nel top-20: {len(survived)}/20 ({len(survived)/20*100:.0f}% sopravvissuti, {100 - len(survived)/20*100:.0f}% turnover)")
    print('3 Esempi che ENTRANO:')
    for k in entering[:3]:
        r = e.row_of[k]
        print(f"  + {titoli[r]} (Tono: {e.tono[r]:+5.2f}, Comp: {e.complessita[r]:+5.2f})")
    print('3 Esempi che ESCONO:')
    for k in leaving[:3]:
        r = e.row_of[k]
        print(f"  - {titoli[r]} (Tono: {e.tono[r]:+5.2f}, Comp: {e.complessita[r]:+5.2f})")
