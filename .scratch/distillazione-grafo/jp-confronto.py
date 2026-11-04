import numpy as np, pandas as pd, scipy.sparse as sp, torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from services.graph_dense import data as D
MODEL='Qwen/Qwen3-Reranker-0.6B'; KG=20; NL=chr(10)
PREF=('<|im_start|>system'+NL+'Judge whether the Document meets the requirements based on the Query and '
 'the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>'+NL+'<|im_start|>user'+NL)
SUF='<|im_end|>'+NL+'<|im_start|>assistant'+NL
I={
 'breve':'The user has just watched and loved the query film. Judge whether the document is a film they '
         'would choose next. Ignore mere subject overlap such as the same animals, jobs or settings.',
 'P2 anti-tema':'The user has just watched and loved the query film. Judge whether the document is a film '
         'they would choose next. Ignore mere subject overlap such as the same animals, jobs or settings; '
         'reward the same level of craft and ambition.',
}
B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; YEAR=B['year']; VOT=B['VOT']
z=np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
ov=pd.read_parquet('services/graph_dense/data/overview-en.parquet')
ovw={k:(str(o) if isinstance(o,str) else '') for k,o in zip(ov['chiave'],ov['overview'])}
def doc(j):
    a=f' ({int(YEAR[j])})' if YEAR[j]>0 else ''
    return f'{T[j]}{a}. {ovw.get(B["keys"][j],"")[:420]}'
i=RO['movie:329']; r=M.getrow(i)
dev='cuda' if torch.cuda.is_available() else 'cpu'
if dev=='cuda': torch.cuda.set_per_process_memory_fraction(0.5,0); torch.cuda.empty_cache()
tok=AutoTokenizer.from_pretrained(MODEL,padding_side='left')
mod=AutoModelForCausalLM.from_pretrained(MODEL,dtype=torch.float16 if dev=='cuda' else torch.float32,attn_implementation='sdpa').to(dev).eval()
si=tok.convert_tokens_to_ids('yes'); no=tok.convert_tokens_to_ids('no')
def sc(istr,cand):
    testi=[PREF+'<Instruct>: '+istr+NL+'<Query>: '+doc(i)+NL+'<Document>: '+doc(j)+SUF for j in cand]
    out=np.zeros(len(testi),np.float32)
    with torch.inference_mode():
        for st in range(0,len(testi),6):
            b=tok(testi[st:st+6],return_tensors='pt',padding=True,truncation=True,max_length=320).to(dev)
            lg=mod(**b,logits_to_keep=1).logits[:,-1,:]
            par=torch.stack([lg[:,no],lg[:,si]],dim=1).float()
            out[st:st+6]=torch.nn.functional.softmax(par,dim=1)[:,1].cpu().numpy()
    return out
for K in (40,60):
    cand=[int(j) for j in r.indices[np.argsort(-r.data)][:K] if j!=i]
    rg={j:p for p,j in enumerate(cand)}
    print(f'\n=== primi {K} candidati — grafo: ' + ' · '.join(T[j] for j in cand[:6]))
    for nome,istr in I.items():
        s=sc(istr,cand)
        rr={j:p for p,j in enumerate([cand[x] for x in np.argsort(-s)])}
        comb=sorted(cand,key=lambda j:-(1/(KG+rg[j])+0.3/(KG+rr[j])))
        print(f'  {nome:<13} μ=0,3: ' + ' · '.join(T[j] for j in comb[:8]))
