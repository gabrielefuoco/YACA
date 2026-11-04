import numpy as np, scipy.sparse as sp
from services.graph_dense import data as D
B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; COLL=B['COLL'].astype(np.int64)
z=np.load('services/graph/data/v13/bolle-eterogeneo-V13-p1.0-triangolo.npz')
V13=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
V10=D.triangle()
FILM=[(346698,'Barbie'),(64690,'Drive'),(76341,'Mad Max: Fury Road'),(27205,'Inception'),(11216,'Cinema Paradiso'),
      (157336,'Interstellar'),(329,'Jurassic Park'),(603,'Matrix'),(419430,'Get Out'),(496243,'Parasite'),
      (422,'8 e mezzo'),(807,'Se7en'),(240,'Il padrino - Parte II'),(582,'Le vite degli altri'),(1417,'Il labirinto del fauno'),
      (406,'La haine'),(11093,'Dogville'),(62215,'Melancholia'),(97370,'Under the Skin'),(329865,'Arrival'),
      (264660,'Ex Machina'),(152601,'Her'),(210577,'Gone Girl'),(146233,'Prisoners'),(242582,'Nightcrawler'),
      (273481,'Sicario'),(18148,'Viaggio a Tokyo'),(490,'Il settimo sigillo'),(797,'Persona'),(5156,'Ladri di biciclette')]
SERIE=[(1438,'The Wire'),(1920,'Twin Peaks'),(87108,'Chernobyl'),(42009,'Black Mirror'),(62560,'Mr. Robot'),
       (70523,'Dark'),(76331,'Succession'),(61222,'BoJack Horseman'),(60574,'Peaky Blinders'),(71446,'La casa di carta')]
def top(M,i,k=8):
    r=M.getrow(i)
    if r.nnz==0: return []
    g=np.zeros(N,np.float32); g[r.indices]=r.data; g[i]=-1e9
    return [int(x) for x in np.argsort(-g)[:k]]
def riga(M,i,k=8):
    t=top(M,i,k); return ' · '.join(T[j] for j in t) if t else '(nessun arco)'
righe=['# V13 — 30 film, 10 serie','', 'V13 = tipi liberi + RRF + damping famiglia + hub + chiusura; co-visione semplice. 25.671.175 archi.','']
fr={'V10':[],'V13':[]}; jac=[]
for grp,casi,pref in (('Film',FILM,'movie'),('Serie',SERIE,'tv')):
    righe.append(f'## {grp}')
    for tid,lab in casi:
        i=RO.get(f'{pref}:{tid}')
        if i is None: righe.append(f'\n**{lab}** — fuori canone'); continue
        a,b=top(V10,i,10),top(V13,i,10)
        if a and b: jac.append(len(set(a)&set(b))/len(set(a)|set(b)))
        cc=COLL[i]
        if cc>0:
            for n,x in (('V10',a),('V13',b)): fr[n].append(sum(1 for j in x if COLL[j]==cc)/max(len(x),1))
        righe.append(f'\n**{lab}** — `{pref}:{tid}`\n\n- V10: {riga(V10,i)}\n- V13: {riga(V13,i)}')
righe+=['','## Sintesi','',f'- Jaccard top-10 V10/V13: **{np.mean(jac):.3f}**',
        f'- Quota top-10 nella stessa collezione: V10 {np.mean(fr["V10"]):.3f} · V13 {np.mean(fr["V13"]):.3f}']
open('.scratch/distillazione-grafo/check-v13-finale.md','w',encoding='utf-8').write('\n'.join(righe)+'\n')
print(f'jaccard {np.mean(jac):.3f} · collezione V10 {np.mean(fr["V10"]):.3f} V13 {np.mean(fr["V13"]):.3f}')
