"""Confronto cieco-alla-selezione di quattro grafi su 70 film + 30 serie diversi dai 40 soliti.

Le 7 sezioni da 10 film e 6 sezioni da 5 serie sono fissate PRIMA di leggere i vicini; non si usano
per tarare pesi. Output: confronto-100.md (leggibile) e confronto-100.html (visivo).
"""
from __future__ import annotations
import html
from pathlib import Path
from services.graph_dense import data as D, provenance as PV, valuta as V

FILM = {
 'Fantascienza / azione': [348,679,218,1091,78,62,782,17654,37165,438631],
 'Crime / thriller': [949,275,6977,11423,670,290098,705996,1422,592,629],
 'Horror': [694,805,9552,310131,242224,293670,396535,13310,9392,377],
 'Commedia': [137,115,239,284,935,9576,10625,8363,1542,120467],
 'Dramma / relazioni': [376867,334541,394117,965150,264644,565310,531428,843,86837,25050],
 'Cinema internazionale / classici': [346,548,3782,147,269,17295,666,598,517814,60243],
 'Animazione / documentario': [129,128,149,9323,862,10681,354912,324857,10315,123678],
}
SERIE = {
 'Crime / thriller': [1398,60622,46648,67744,19885],
 'Dramma / autoriale': [1104,46533,54344,65494,87739],
 'Commedia': [67070,65495,2316,8592,66573],
 'Fantascienza / fantastico': [95396,63639,87917,76479,94605],
 'Animazione / internazionale': [1429,30991,456,60625,225180],
 'Dramma contemporaneo': [97546,136315,69478,100088,95215],
}
GRAFI = {
 'V42E': 'services/graph/data/v42e/bolle-eterogeneo-V42E-p1.0-triangolo.npz',
 'V45': 'services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz',
 'MITE': 'services/graph/data/v45-meta/bolle-eterogeneo-META-p1.0-triangolo.npz',
 'RIAL': 'services/graph/data/v45-riall/bolle-eterogeneo-RIALL-p1.0-triangolo.npz',
}


def main():
    B = D.basic(); RO = B['row_of']; TIT = B['titoli']
    graphs = {n: PV.leggi(p)[0] for n,p in GRAFI.items()}
    old = {346698,64690,76341,27205,11216,157336,329,603,419430,496243,422,807,240,582,1417,
           406,11093,62215,97370,329865,264660,152601,210577,146233,242582,273481,18148,490,797,5156}
    old_tv = {1438,1920,87108,42009,62560,70523,76331,61222,60574,71446}
    rows=[]
    for kind, groups in (('movie',FILM),('tv',SERIE)):
        for group, ids in groups.items():
            for tmdb in ids:
                key=f'{kind}:{tmdb}'
                if key not in RO:
                    raise SystemExit(f'non nel canone: {key}')
                if (kind=='movie' and tmdb in old) or (kind=='tv' and tmdb in old_tv):
                    raise SystemExit(f'già nei 40 soliti: {key}')
                i=RO[key]
                rows.append((kind,group,key,i,str(TIT[i])))
    if len({r[2] for r in rows}) != 100 or sum(r[0]=='movie' for r in rows)!=70 or sum(r[0]=='tv' for r in rows)!=30:
        raise SystemExit(f'campione non univoco/70+30: {len(rows)}')
    md=['# Confronto qualitativo — 70 film + 30 serie', '',
        'Campione fissato prima di leggere i risultati, distinto dai 40 soliti. 7 categorie film × 10; 6 categorie serie × 5. '
        'Solo ispezione: nessun peso tarato su questo campione.',
        '', 'Grafi: V42E (nuovo studente), V45 (stessi pesi + fix), MITE (pesi moderati), RIAL (riallineamento pieno).', '']
    html_parts=[]
    overlaps={p:[] for p in [('V42E','V45'),('V42E','MITE'),('V42E','RIAL')]}
    for kind, groups in (('movie',FILM),('tv',SERIE)):
        md += [f'## {"Film" if kind=="movie" else "Serie"}', '']
        for group, ids in groups.items():
            md += [f'### {group}', '']
            for tmdb in ids:
                key=f'{kind}:{tmdb}'; i=RO[key]
                ls={name:V._ordine(M,i,6) for name,M in graphs.items()}
                for pair in overlaps:
                    a,b=pair; overlaps[pair].append(len(set(ls[a])&set(ls[b]))/6)
                year=B['year'][i] if kind=='movie' else B.get('year', [0])[i]
                y=int(year) if year==year and year>0 else '?'
                title=f'{TIT[i]} ({y})'
                md += [f'**{title}**', '']
                for name in GRAFI:
                    rec=' · '.join(str(TIT[j]) for j in ls[name])
                    md += [f'- **{name}:** {rec}']
                md += ['']
                html_parts.append('<section><h3>'+html.escape(title)+' <small>'+html.escape(group)+'</small></h3><div class="grid">'+''.join(
                    '<article><b>'+n+'</b><br>'+html.escape(' · '.join(str(TIT[j]) for j in ls[n]))+'</article>' for n in GRAFI
                )+'</div></section>')
    md += ['## Similarità dei quartieri (top-6)', '']
    for (a,b), vals in overlaps.items():
        md += [f'- {a} / {b}: overlap medio **{sum(vals)/len(vals):.1%}** ({len(vals)} semi)']
    Path('.scratch/uscire-dal-plateau/confronto-100.md').write_text('\n'.join(md)+'\n','utf-8')
    doc='''<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>100 titoli — confronto grafi</title><style>
:root{color-scheme:dark}body{background:#101318;color:#edf0f6;font:14px/1.5 system-ui;margin:24px auto;max-width:1500px;padding:0 20px}h1{font-size:1.5rem}h2{border-top:2px solid #596275;padding-top:18px}h3{font-size:1rem;margin-bottom:8px}small{color:#a9b2c2;font-weight:400}section{border-bottom:1px solid #333b49;padding:8px 0 14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}article{background:#191e27;border-radius:7px;padding:10px}article b{color:#a7c9ff}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:550px){.grid{grid-template-columns:1fr}}
</style><h1>100 titoli — V42E / V45 / MITE / RIAL</h1><p>70 film + 30 serie, in 13 gruppi tematici. Campione distinto dai 40 soliti; nessun tuning fatto su questi vicini.</p>'''+''.join(html_parts)+'</html>'
    Path('.scratch/uscire-dal-plateau/confronto-100.html').write_text(doc,'utf-8')
    print('campione OK:',sum(r[0]=='movie' for r in rows),'film,',sum(r[0]=='tv' for r in rows),'serie')
    for (a,b), vals in overlaps.items(): print(f'{a}/{b}: overlap top6 medio {sum(vals)/len(vals):.1%}')
    print('scritti confronto-100.md e confronto-100.html')

if __name__=='__main__': main()
