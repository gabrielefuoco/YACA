import numpy as np, scipy.sparse as sp
from services.graph_dense import data as D
KG=20; KCAND=40; NL=chr(10)
FILM=[346698,64690,76341,27205,11216,157336,329,603,419430,496243,422,807,240,582,1417,406,11093,62215,97370,
      329865,264660,152601,210577,146233,242582,273481,18148,490,797,5156]
SERIE=[1438,1920,87108,42009,62560,70523,76331,61222,60574,71446]
B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; VOT=B['VOT']
z=np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
semi=[(f'movie:{t}',T[RO[f'movie:{t}']]) for t in FILM if f'movie:{t}' in RO]
semi+=[(f'tv:{t}',T[RO[f'tv:{t}']]) for t in SERIE if f'tv:{t}' in RO]
seeds=[]; cands=[]
for key,_ in semi:
    i=RO[key]; r=M.getrow(i)
    cands.append([int(j) for j in r.indices[np.argsort(-r.data)][:KCAND] if j!=i]); seeds.append(i)
scelti=np.load('.cache/rerank-30x10.npz')['scores']
def blend(mu):
    out={}
    k=0
    for (key,_),i,c in zip(semi,seeds,cands):
        s=scelti[k:k+len(c)]; k+=len(c)
        rg={j:p for p,j in enumerate(c)}
        rr={j:p for p,j in enumerate([c[x] for x in np.argsort(-s)])}
        out[key]=sorted(c,key=lambda j:-(1/(KG+rg[j])+mu/(KG+rr[j])))
    return out
A=blend(0.0); B3=blend(0.3); B5=blend(0.5)
righe=[f'# μ=0,5 — 30 film + 10 serie (stessi score, riuso della cache)','',
       'Top-8: grafo (μ=0) · μ=0,3 · μ=0,5. Segnalo solo i casi in cui **cambia l\'insieme**.','']
n05=0; n03=0; stab=[]
for key,nome in semi:
    a,b5=B3[key],B5[key]; g=A[key]
    if set(b5[:8])!=set(a[:8]): n03+=1
    if set(b5[:8])!=set(g[:8]):
        n05+=1
        stab.append(len(set(b5[:8])&set(g[:8]))/8)
        righe.append(f'\n**{nome}** — `{key}`\n')
        for p in range(8):
            righe.append(f'- {p+1}. {T[b5[p]]:<45} (grafo: {T[g[p]]})')
righe.append(NL+'## Sintesi'+NL)
righe.append(f'- semi con top-8 diverso dal grafo: **{n05}/{len(semi)}** (μ=0,3: {n03}/{len(semi)})')
righe.append(f'- stabilita media: **{100*np.mean(stab):.0f}%**' if stab else '- nessun cambio')
open('.scratch/distillazione-grafo/mu05.md','w',encoding='utf-8').write(NL.join(righe)+NL)
print(f'μ=0,5: cambiano {n05}/{len(semi)} · μ=0,3: {n03}/{len(semi)} · stabilita {100*np.mean(stab):.0f}%')
