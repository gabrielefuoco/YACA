"""Lettura a occhio: confronto N modelli su 20 film + 20 serie. Uso: ... b10 m1 f2"""
import sys, numpy as np
from services.graph_dense import config as C, data as D
B=D.basic(); ro=B["row_of"]
MODELS=sys.argv[1:] or ["b10","m1"]
Z={m:np.load(C.DATA/f"{m}.npz")["Z"].astype(np.float32) for m in MODELS}
FILM=[(597,"Titanic"),(872585,"Oppenheimer"),(346698,"Barbie"),(792307,"Povere creature!"),(150540,"Inside Out"),
      (381341,"Perfetti sconosciuti"),(348,"Alien"),(8587,"Il re leone"),(129,"La citta incantata"),(496243,"Parasite"),
      (550,"Fight Club"),(545611,"EEAAO"),(157336,"Interstellar"),(238,"Il padrino"),(680,"Pulp Fiction"),
      (27205,"Inception"),(155,"Il cavaliere oscuro"),(244786,"Whiplash"),(313369,"La La Land"),(694,"Shining")]
SERIE=[(94997,"House of the Dragon"),(93405,"Squid Game"),(1438,"The Wire"),(60059,"Better Call Saul"),(87108,"Chernobyl"),
       (1399,"Il Trono di Spade"),(84773,"Anelli del Potere"),(100088,"The Last of Us"),(95396,"Scissione"),(83867,"Andor"),
       (66732,"Stranger Things"),(1396,"Breaking Bad"),(46648,"True Detective"),(76331,"Succession"),(76479,"The Boys"),
       (70523,"Dark"),(65494,"The Crown"),(71446,"La casa di carta"),(87739,"La regina degli scacchi"),(60574,"Peaky Blinders")]
def top(Zm,i,k=6):
    c=Zm@Zm[i]; c[i]=-1e4; return [B["titoli"][int(x)] for x in np.argsort(-c)[:k]]
out=[]
for lab,L in (("FILM",FILM),("SERIE",SERIE)):
    out.append(f"===== {lab} =====")
    for tid,nome in L:
        k=("movie:" if lab=="FILM" else "tv:")+str(tid)
        if k not in ro: out.append(f"\n### {nome} — FUORI CANONE"); continue
        i=int(ro[k]); out.append(f"\n### {nome}")
        for m in MODELS: out.append(f"{m:4s}: "+" · ".join(top(Z[m],i)))
p=C.DATA/("lettura-"+"-".join(MODELS)+".txt")
open(p,"w",encoding="utf-8").write("\n".join(out)); print("\n".join(out)); print("\nscritto",p)
