"""Dove si rompe b1: coerenza del vicinato per strato, e i casi peggiori."""
from __future__ import annotations
import numpy as np
from services.graph_dense import config as C, data as D

def main():
    B=D.basic(); ro=B["row_of"]; N=B["N"]
    Z=np.load(C.DATA/"b1.npz")["Z"].astype(np.float32)
    Xp,hp,_=D.plot_embedding(B)
    X=D.tfidf(); V=D.vocab()
    ge={c:t[3:] for t,c in V.items() if t.startswith("ge:")}
    lg={c:t[3:] for t,c in V.items() if t.startswith("lg:")}
    gen=[set() for _ in range(N)]; lang=np.array([""]*N, dtype=object)
    for i in range(N):
        row=X.getrow(i)
        g={ge[int(c)] for c in row.indices if int(c) in ge}
        gen[i]=g
        for c in row.indices:
            if int(c) in lg: lang[i]=lg[int(c)]; break
    rng=np.random.default_rng(21); samp=rng.choice(N,2000,replace=False)
    first=np.zeros(2000); gj=np.zeros(2000); pl=np.zeros(2000); bl=np.zeros(2000); sm=np.zeros(2000)
    for k,i in enumerate(samp):
        i=int(i); cos=Z[i]@Z.T; cos[i]=-np.inf
        top=np.argsort(-cos)[:10]
        first[k]=cos[top[0]]
        gj[k]=np.mean([len(gen[i]&gen[int(j)])/max(len(gen[i]|gen[int(j)]),1) for j in top])
        ok=[int(j) for j in top if hp[i] and hp[int(j)]]
        pl[k]=np.mean([float(Xp[i]@Xp[j]) for j in ok]) if ok else np.nan
        bl[k]=np.mean([B["mem"][int(j)]==B["mem"][i] for j in top])
        sm[k]=np.mean([B["is_tv"][int(j)]==B["is_tv"][i] for j in top])
    def tab(nome, gruppi):
        print(f"\n{nome}")
        print(f"  {'gruppo':22s} {'n':>5s} {'1o cos':>7s} {'genere':>7s} {'trama':>6s} {'bolla':>6s} {'medium':>7s}")
        for nome_g, m in gruppi:
            if m.sum()<20: continue
            print(f"  {nome_g:22s} {int(m.sum()):5d} {np.median(first[m]):7.3f} {np.median(gj[m]):7.3f} "
                  f"{np.nanmedian(pl[m]):6.3f} {np.median(bl[m]):6.2f} {np.median(sm[m]):7.2f}")
    is_tv=B["is_tv"]; vot=B["VOT"]; anno=B["ANNO"]; hp_t=hp[samp]
    tab("Medium e trama", [("film con trama",(~is_tv[samp])&hp_t),("film senza trama",(~is_tv[samp])&~hp_t),
                           ("serie con trama",is_tv[samp]&hp_t),("serie senza trama",is_tv[samp]&~hp_t)])
    tab("Voti", [("VOT <20",vot[samp]<20),("20-100",(vot[samp]>=20)&(vot[samp]<100)),
                 ("100-500",(vot[samp]>=100)&(vot[samp]<500)),("500-2000",(vot[samp]>=500)&(vot[samp]<2000)),
                 ("2000+",vot[samp]>=2000)])
    tab("Anno", [("<1980",anno[samp]<1980),("1980-2000",(anno[samp]>=1980)&(anno[samp]<2000)),
                 ("2000-2010",(anno[samp]>=2000)&(anno[samp]<2010)),("2010-2020",(anno[samp]>=2010)&(anno[samp]<2020)),
                 ("2020+",anno[samp]>=2020)])
    tab("Lingua", [("inglese",lang[samp]=="en"),("italiano",lang[samp]=="it"),("altra",(lang[samp]!="en")&(lang[samp]!="it")&(lang[samp]!=""))])
    print("\nPEGGIORI 10 per primo vicino (titoli isolati):")
    for k in np.argsort(first)[:10]:
        i=int(samp[k]); cos=Z[i]@Z.T; cos[i]=-np.inf; top=np.argsort(-cos)[:3]
        print(f"  {B['titoli'][i][:44]:44s} {int(B['VOT'][i]):6d} voti · 1o {first[k]:.3f} · " +
              " | ".join(B["titoli"][int(j)][:26] for j in top))
    print("\nPEGGIORI 10 per coerenza di genere (vicini di generi diversi):")
    for k in np.argsort(gj)[:10]:
        i=int(samp[k]); cos=Z[i]@Z.T; cos[i]=-np.inf; top=np.argsort(-cos)[:3]
        print(f"  {B['titoli'][i][:44]:44s} gen {sorted(gen[i])[:3]} · {gj[k]:.2f} · " +
              " | ".join(B["titoli"][int(j)][:26] for j in top))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
