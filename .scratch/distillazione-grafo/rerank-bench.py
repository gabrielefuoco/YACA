"""Fusione grafo ⊕ reranker misurata sul banco dei 499 semi curati."""
import json, numpy as np, pandas as pd, scipy.sparse as sp, torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from services.graph_dense import data as D
MODEL='Qwen/Qwen3-Reranker-0.6B'; KCAND=40; KG=20
PREFISSO=('<|im_start|>system\nJudge whether the Document meets the requirements based on the '
 'Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n')
SUFFISSO='<|im_end|>\n<|im_start|>assistant\n'
ISTR=('The user has just watched and loved the query film. Judge whether the document is a film they '
      'would choose next. Ignore mere subject overlap such as the same animals, jobs or settings.')
B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; YEAR=B['year']
z=np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
ov=pd.read_parquet('services/graph_dense/data/overview-en.parquet')
ovw={k:(str(o) if isinstance(o,str) else '') for k,o in zip(ov['chiave'],ov['overview'])}
g=json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json',encoding='utf-8'))
casi=[]
for s in g['sources']:
    i=RO.get(s['id'])
    if i is None: continue
    l=[RO[x['id']] for x in s['links'] if x['id'] in RO]
    if l: casi.append((i,l))
def doc(j):
    anno=f' ({int(YEAR[j])})' if YEAR[j]>0 else ''
    return f'{T[j]}{anno}. {ovw.get(B["keys"][j],"")[:420]}'
dev='cuda' if torch.cuda.is_available() else 'cpu'
print(f'carico modello... {len(casi)} semi × {KCAND} candidati', flush=True)
tok=AutoTokenizer.from_pretrained(MODEL,padding_side='left')
mod=AutoModelForCausalLM.from_pretrained(MODEL,torch_dtype=torch.float16 if dev=='cuda' else torch.float32).to(dev).eval()
id_si=tok.convert_tokens_to_ids('yes'); id_no=tok.convert_tokens_to_ids('no')
def punteggi(query,cand):
    testi=[PREFISSO+f'<Instruct>: {ISTR}\n<Query>: {query}\n<Document>: {doc(j)}'+SUFFISSO for j in cand]
    out=[]
    with torch.no_grad():
        for st in range(0,len(testi),16):
            b=tok(testi[st:st+16],return_tensors='pt',padding=True,truncation=True,max_length=1536).to(dev)
            lg=mod(**b).logits[:,-1,:]
            par=torch.stack([lg[:,id_no],lg[:,id_si]],dim=1).float()
            out.append(torch.nn.functional.softmax(par,dim=1)[:,1].cpu().numpy())
    return np.concatenate(out)
rank_rer={}; rank_grafo={}
for n,(i,links) in enumerate(casi):
    r=M.getrow(i)
    cand=[int(j) for j in r.indices[np.argsort(-r.data)][:KCAND] if j!=i]
    sc=punteggi(doc(i),cand)
    rank_grafo[i]={j:p for p,j in enumerate(cand)}
    rank_rer[i]={j:p for p,j in enumerate([cand[x] for x in np.argsort(-sc)])}
    if n%50==0: print(f'  {n}/{len(casi)}', flush=True)
def val(mu):
    r10=[];r20=[]
    for i,links in casi:
        rg=rank_grafo[i]; rr=rank_rer[i]
        comb=sorted(rg, key=lambda j:-(1/(KG+rg[j])+mu/(KG+rr.get(j,KG+KCAND))))
        pos={j:p+1 for p,j in enumerate(comb)}
        r10.append(sum(1 for j in links if pos.get(int(j),10**9)<=10)/len(links))
        r20.append(sum(1 for j in links if pos.get(int(j),10**9)<=20)/len(links))
    return np.mean(r10),np.mean(r20)
print('\n| mu | R@10 | R@20 |')
print('|---|---:|---:|')
for mu in (0.0,0.1,0.2,0.3,0.5,1.0):
    a,b=val(mu); print(f'| {mu} | {a:.3f} | {b:.3f} |', flush=True)
