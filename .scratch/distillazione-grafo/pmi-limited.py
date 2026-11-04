"""Targeted PMI co-view diagnostic. No full item-item matrix; only seed->all sparse products."""
import datetime as dt
import glob
import json
import os
import numpy as np
import pandas as pd
import scipy.sparse as sp
from collections import defaultdict
from services.graph_dense import config as C, data as D

B = D.basic(); N = B['N']; ro = B['row_of']; titles = B['titoli']; is_tv = B['is_tv']
release = np.load(C.DATA / 'uscite-ordinali.npy').astype(np.int64)
K = 15

def item(key): return ro.get(key)
def day_iso(s):
    try: return dt.date.fromisoformat(str(s)[:10]).toordinal()
    except (ValueError, TypeError): return 0

def matrix(users, raw_counts=None):
    names = [u for u, xs in users.items() if xs]
    uid = {u:i for i,u in enumerate(names)}
    rr=[]; cc=[]
    for u in names:
        xs = users[u]
        rr.extend([uid[u]] * len(xs)); cc.extend(xs)
    X = sp.csr_matrix((np.ones(len(rr), np.int32), (rr,cc)), shape=(len(names),N), dtype=np.int32)
    X.sum_duplicates(); X.data[:] = 1; X.eliminate_zeros()
    active = int(np.count_nonzero(X.getnnz(axis=1)))
    marg = np.asarray(X.sum(axis=0)).ravel().astype(np.int64)
    history=np.asarray([raw_counts.get(u,len(users[u])) if raw_counts is not None else len(users[u]) for u in names],np.int32)
    return X, marg, active, history

def load_trakt():
    users=defaultdict(set); raw_ids=defaultdict(set); times=defaultdict(dict); files=0; max_day=0
    paths=glob.glob('.cache/trakt/users/movie-*.json')+glob.glob('.cache/trakt/users/show-*.json')
    for f in paths:
        base=os.path.basename(f)[:-5]
        if base.startswith('movie-'): typ='movie'; user=base[6:]
        elif base.startswith('show-'): typ='tv'; user=base[5:]
        else: continue
        try: data=json.load(open(f,encoding='utf-8'))
        except Exception: continue
        if not isinstance(data,list): continue
        files+=1
        for e in data:
            t=day_iso(e.get('last_watched_at') or e.get('watched_at'))
            max_day=max(max_day,t)
            obj=e.get('movie' if typ=='movie' else 'show') or {}
            tmdb=(obj.get('ids') or {}).get('tmdb')
            if not tmdb: continue
            raw_ids[user].add((typ,int(tmdb)))
            i=item(f'{typ}:{int(tmdb)}')
            if i is None: continue
            users[user].add(i)
            if t and t>times[i].get(user,0): times[i][user]=t
    return matrix(users,{u:len(xs) for u,xs in raw_ids.items()}), times, files, max_day

def load_id_list(pattern, mapper):
    users=defaultdict(set); raw_ids=defaultdict(set); files=0; entries=0
    for f in glob.glob(pattern):
        if os.path.basename(f)=='_users.json': continue
        try: xs=json.load(open(f,encoding='utf-8'))
        except Exception: continue
        if not isinstance(xs,list): continue
        files+=1; entries+=len(xs); u=os.path.basename(f)[:-5]
        for x in xs:
            try: raw_ids[u].add(int(x))
            except (ValueError,TypeError): pass
            i=mapper(x)
            if i is not None: users[u].add(i)
    return matrix(users,{u:len(xs) for u,xs in raw_ids.items()}),files,entries

def load_anilist():
    a=json.load(open('.cache/tmdb/anime-mappings.json',encoding='utf-8'))
    mal_tmdb={int(m):int(t) for m,t in a['malToTmdb']}
    runtime=json.load(open('.scratch/distillazione-grafo/anilist-runtime-map.json',encoding='utf-8'))
    mal_type=dict(runtime['type'])
    seen=set(); resolved=set(); in_canon=set()
    def mapper(x):
        try: m=int(x)
        except (ValueError,TypeError): return None
        seen.add(m); t=mal_tmdb.get(m); typ=mal_type.get(str(m))
        if t and typ in ('movie','tv'):
            resolved.add(m); i=item(f'{typ}:{t}')
            if i is not None: in_canon.add(m)
            return i
        return None
    data,files,entries=load_id_list('.cache/anilist/users/*.json',mapper)
    return data,files,entries,(len(mal_tmdb),len(seen),len(resolved),len(in_canon))

def load_serializd():
    def mapper(x):
        try: return item(f'tv:{int(x)}')
        except (ValueError,TypeError): return None
    return load_id_list('.cache/serializd/users/*.json',mapper)

def load_movielens():
    links=pd.read_csv('.cache/movielens/ml-32m/links.csv',usecols=['movieId','tmdbId'])
    movie_to_row={}
    for mid,tm in zip(links.movieId,links.tmdbId):
        if pd.notna(tm):
            i=item(f'movie:{int(tm)}')
            if i is not None: movie_to_row[int(mid)]=i
    rows=[]; cols=[]; n_events=0; max_user=0; max_day=0; raw_counts=np.zeros(0,np.int32)
    p='.cache/movielens/ml-32m/ratings.csv'
    for chunk in pd.read_csv(p,usecols=['userId','movieId','timestamp'],chunksize=1_000_000):
        ir=chunk.movieId.map(movie_to_row)
        ok=ir.notna().to_numpy().copy()
        if ok.any():
            rows.append(chunk.userId.to_numpy(dtype=np.int32)[ok]-1)
            cols.append(ir.to_numpy(dtype=np.int32,na_value=-1)[ok])
            n_events += int(ok.sum())
        user_rows=chunk.userId.to_numpy(dtype=np.int32)-1
        chunk_users=int(user_rows.max())+1
        if len(raw_counts)<chunk_users: raw_counts=np.pad(raw_counts,(0,chunk_users-len(raw_counts)))
        raw_counts[:chunk_users]+=np.bincount(user_rows,minlength=chunk_users).astype(np.int32)
        max_user=max(max_user,chunk_users)
        max_day=max(max_day,int(chunk.timestamp.max())//86400+719163)
        if n_events and n_events%10_000_000 < 1_000_000: print(f'  MovieLens mapped {n_events:,} rows',flush=True)
    rr=np.concatenate(rows); cc=np.concatenate(cols); del rows,cols
    X=sp.csr_matrix((np.ones(len(rr),np.int32),(rr,cc)),shape=(max_user,N),dtype=np.int32)
    del rr,cc
    X.sum_duplicates(); X.data[:]=1; X.eliminate_zeros()
    marg=np.asarray(X.sum(axis=0)).ravel().astype(np.int64)
    active=int(np.count_nonzero(X.getnnz(axis=1)))
    return (X,marg,active,raw_counts[:max_user]),movie_to_row,n_events,max_day

def npmi_values(c, ci, cj, U):
    c=np.asarray(c,dtype=np.float64); cj=np.asarray(cj,dtype=np.float64)
    out=np.zeros(c.shape,np.float64); valid=(c>0)&(ci>0)&(cj>0)&(U>0)
    pmi=np.zeros(c.shape,np.float64); pmi[valid]=np.log(c[valid]*U/(ci*cj[valid]))
    den=np.zeros(c.shape,np.float64); den[valid]=-np.log(c[valid]/U)
    good=valid&(den>1e-12)
    out[good]=np.maximum(pmi[good]/den[good],0.0)
    return out

def source_rows(name, X, marg, U, seed_rows, row_weights=None):
    present=[i for i in seed_rows if i is not None and marg[i]>0]
    if not present: return {}
    Xw=X if row_weights is None else X.multiply(row_weights[:,None]).tocsr()
    Q=(X[:,present].T @ Xw).tocsr()
    result={}
    for q,i in enumerate(present):
        row=Q.getrow(q); js=row.indices; c=row.data.astype(np.float64)
        keep=(js!=i)&(c>0); js=js[keep]; c=c[keep]
        if not len(js): continue
        ns=npmi_values(c,marg[i],marg[js],U)
        ls=ns*np.log1p(c)
        byidx={int(j):(float(cc),float(nn),float(ll)) for j,cc,nn,ll in zip(js,c,ns,ls)}
        topn=sorted(byidx,key=lambda j:byidx[j][1],reverse=True)[:K]
        topl=sorted(byidx,key=lambda j:byidx[j][2],reverse=True)[:K]
        result[i]={'pairs':byidx,'npmi':topn,'logc':topl,'pool':set(topn)|set(topl)}
    print(f'  {name}: {U:,} utenti attivi · {len(present)} seed coperti',flush=True)
    return result

def user_weights(X, alpha, raw_history):
    mapped=np.asarray(X.getnnz(axis=1)).ravel()>0
    k=np.asarray(raw_history,dtype=np.float64)
    w=np.zeros(X.shape[0],np.float64)
    w[mapped]=1.0
    if alpha:
        multi=mapped&(k>1)
        w[multi]=np.power(k[multi]-1.0,-alpha)
        w[mapped]/=w[mapped].mean()  # preserve one effective user on average within each source
    return w

def load_ml_times(movie_to_row, target_items):
    wanted=set(target_items); times=defaultdict(dict); path='.cache/movielens/ml-32m/ratings.csv'
    if not wanted: return times
    # Timestamp di rating = proxy osservabile, non watch timestamp.
    for chunk in pd.read_csv(path,usecols=['userId','movieId','timestamp'],chunksize=1_000_000):
        ir=chunk.movieId.map(movie_to_row)
        ok=ir.notna().to_numpy().copy()
        if not ok.any(): continue
        rr=ir.to_numpy(dtype=np.int32,na_value=-1)
        ok &= np.isin(rr,list(wanted))
        if not ok.any(): continue
        us=chunk.userId.to_numpy(dtype=np.int32)[ok]
        it=rr[ok]
        days=(chunk.timestamp.to_numpy(dtype=np.int64)[ok]//86400)+719163
        for u,j,d in zip(us,it,days):
            d=int(d); u=int(u)
            if d>times[int(j)].get(u,0): times[int(j)][u]=d
    return times

def late_count(i,j,times,lag,max_day):
    di=int(release[i]); dj=int(release[j])
    if di<=0 or dj<=0: return None
    threshold=max(di,dj)+lag
    if max_day<=threshold: return None  # finestra non osservabile: censura, non zero co-visione
    a=times.get(i,{}); b=times.get(j,{})
    if len(a)>len(b): a,b=b,a
    return sum(1 for u,ta in a.items() if ta>threshold and b.get(u,0)>threshold)

def fmt_list(ids, info, late=None):
    out=[]
    for j in ids[:8]:
        c,n,l=info['pairs'][j]
        extra=''
        if late is not None:
            c180=late.get((j,180)); c365=late.get((j,365))
            extra=f' [C={c:g}, C180={c180 if c180 is not None else "?"}, C365={c365 if c365 is not None else "?"}]'
        else: extra=f' [C={c:g}]'
        out.append(f'{titles[j]}{extra}')
    return ' · '.join(out) if out else '(nessun vicino supportato)'

# Matrici: due testimoni per popolarità, cross-medium, anime, film; due code dinamiche da Trakt.
seeds={
 'movie:346698':'Barbie', 'movie:872585':'Oppenheimer', 'tv:1396':'Breaking Bad',
 'tv:63351':'Narcos', 'tv:1399':'Game of Thrones', 'tv:1429':'L’attacco dei giganti',
 'movie:496243':'Parasite', 'movie:597':'Titanic'
}
SENTINELS=[
    ('Barbie / Oppenheimer','movie:346698','movie:872585'),
    ('Barbie / Super Mario','movie:346698','movie:502356'),
    ('Breaking Bad / Narcos','tv:1396','tv:63351'),
    ('Breaking Bad / Game of Thrones','tv:1396','tv:1399'),
    ('Parasite / Joker','movie:496243','movie:475557'),
]
seed_rows={item(k):v for k,v in seeds.items() if item(k) is not None}

print('Carico sorgenti e costruisco solo matrici user-item...',flush=True)
trakt_loaded,trakt_times,trakt_files,trakt_max_day=load_trakt()
anilist_loaded,anilist_files,anilist_entries,anilist_map_stats=load_anilist()
serial_loaded,serial_files,serial_entries=load_serializd()
ml_loaded,movie_to_row,ml_events,ml_max_day=load_movielens()
trakt=trakt_loaded[:3]; anilist=anilist_loaded[:3]; serial=serial_loaded[:3]; ml=ml_loaded[:3]
source_histories={
 'MovieLens (timestamp rating)':ml_loaded[3],
 'Trakt (last_watched_at)':trakt_loaded[3],
 'AniList (membership; status absent)':anilist_loaded[3],
 'Serializd (watched list)':serial_loaded[3],
}

# Due item di coda scelti dai dati Trakt, senza usare popolarità TMDB.
Xt,mt,Ut=trakt
for want_tv in (False,True):
    candidates=np.flatnonzero((mt>=3)&(mt<=20)&(B['is_tv']==want_tv))
    candidates=[int(i) for i in candidates if i not in seed_rows and str(titles[i]).strip()]
    candidates.sort(key=lambda i:(int(mt[i]),i))
    if candidates:
        i=candidates[0]; seed_rows[i]=f'Coda Trakt (C_i={int(mt[i])})'

sources={
 'MovieLens (timestamp rating)':ml,
 'Trakt (last_watched_at)':trakt,
 'AniList (membership; status absent)':anilist,
 'Serializd (watched list)':serial,
}
alpha_results={}; weight_summary={}
for alpha in (0.0,0.5,1.0):
    variant={}
    for name,(X,_,_) in sources.items():
        mapped=np.asarray(X.getnnz(axis=1)).ravel()>0
        lengths=source_histories[name]
        weights=user_weights(X,alpha,lengths)
        marg=np.asarray(X.T @ weights).ravel()
        active_lengths=lengths[mapped]
        active_weights=weights[mapped]
        weight_summary[(alpha,name)]=(float(weights.sum()),int(np.median(active_lengths)),int(np.percentile(active_lengths,90)),int(active_lengths.max()),float(np.median(active_weights)),float(np.percentile(active_weights,90)),float(active_weights.max()))
        variant[name]=source_rows(f'{name} α={alpha:g}',X,marg,float(weights.sum()),list(seed_rows),weights)
    alpha_results[alpha]=variant
results=alpha_results[0.0]

# Calcola C_late esattamente solo per i candidati gia' emersi nei primi 2 ranking.
late_by_source={}
for name in ('MovieLens (timestamp rating)','Trakt (last_watched_at)'):
    src=results[name]; target=set()
    for i,d in src.items():
        target.update(d['pool']); target.add(i)
        for _,k1,k2 in SENTINELS:
            if item(k1)==i and item(k2) in d['pairs']: target.add(item(k2))
    times=trakt_times if name.startswith('Trakt') else load_ml_times(movie_to_row,target)
    max_day=trakt_max_day if name.startswith('Trakt') else ml_max_day
    late={}
    for i,d in src.items():
        pair_candidates=set(d['pool'])
        for _,k1,k2 in SENTINELS:
            if item(k1)==i and item(k2) in d['pairs']: pair_candidates.add(item(k2))
        for j in pair_candidates:
            late[(i,j,180)]=late_count(i,j,times,180,max_day)
            late[(i,j,365)]=late_count(i,j,times,365,max_day)
    late_by_source[name]=late
    print(f'  {name}: timestamp pair-test su {sum(len(d["pool"]) for d in src.values())} coppie candidate',flush=True)

lines=['# Test mirato PMI co-visione','',
       'Solo vicini seed→catalogo via prodotto sparso `X_seed.T @ X`; nessuna matrice item×item completa.',
       'C_late è contato esattamente per i candidati emersi dai primi due ranking: entrambi gli eventi devono cadere oltre `max(release_i, release_j)+L`.',
       'MovieLens usa il timestamp del rating come proxy; Trakt usa `last_watched_at`. AniList è solo membership: la cache non conserva lo status (completed/current/planning/etc.), quindi non è prova di visione. Serializd è una watchlist osservata ma senza timestamp affidabile.',
       'NPMI usa `log(Cij*U/(Ci*Cj)) / -log(Cij/U)`, solo valori positivi; non c’è soglia minima di supporto. `logC` usa `log(1+Cij)`. Nessun peso tra fonti è applicato.','']
for i,label in seed_rows.items():
    lines += [f'## {label} — {B["keys"][i]}', '']
    any_source=False
    for name,src in results.items():
        d=src.get(i)
        if not d: continue
        any_source=True
        lines += [f'### {name}',
                  f'- NPMI (sorpresa): {fmt_list(d["npmi"],d)}',
                  f'- NPMI × log(1+C totale): {fmt_list(d["logc"],d)}']
        if name.startswith('Trakt'):
            cross=sorted((j for j in d['pairs'] if is_tv[j] != is_tv[i]),key=lambda j:d['pairs'][j][2],reverse=True)[:5]
            crossline=' · '.join(f'{titles[j]} [C={d["pairs"][j][0]}]' for j in cross) or '(nessun ponte cross-medium nel supporto osservato)'
            lines.append(f'- migliori archi cross-medium per NPMI×logC: {crossline}')
        late=late_by_source.get(name)
        if late is not None:
            pool=d['pool']
            for lag in (180,365):
                pairs=[]
                for j in pool:
                    c,n,l=d['pairs'][j]; cl=late[(i,j,lag)]
                    if cl is None: continue
                    pairs.append((j,n*np.log1p(cl),n*np.log1p(c)*(cl/c if c else 0)))
                by_late=sorted(pairs,key=lambda x:x[1],reverse=True)[:8]
                by_frac=sorted(pairs,key=lambda x:x[2],reverse=True)[:8]
                def names(vals):
                    return ' · '.join(f'{titles[j]} [C={d["pairs"][j][0]}, C{lag}={late[(i,j,lag)]}]' for j,_,_ in vals) or '(nessuna coppia con finestra osservabile)'
                lines += [f'- NPMI × log(1+C_late {lag}g), rerank pool: {names(by_late)}',
                          f'- NPMI × log(1+C_tot) × C_late/C_tot {lag}g: {names(by_frac)}']
        lines.append('')
    if not any_source: lines += ['(Nessun source con eventi nel canone.)','']

lines += ['## Coppie sentinella','',
 'Supporto e persistenza misurati direttamente per le coppie diagnostiche (se presenti nel pool candidato):','']
for label,key1,key2 in SENTINELS:
    i=item(key1); j=item(key2)
    if i is None or j is None: continue
    lines.append(f'### {label}')
    for name,src in results.items():
        d=src.get(i); pair=d['pairs'].get(j) if d else None
        if pair is None: continue
        c,n,l=pair; late=late_by_source.get(name)
        if late is not None and (i,j,180) in late:
            details=[]
            for lag in (180,365):
                cl=late[(i,j,lag)]
                if cl is None: details.append(f'C{lag}=censurato')
                else: details.append(f'C{lag}={cl}, loglate={n*np.log1p(cl):.3f}, persist={l*cl/c:.3f}')
            lines.append(f'- {name}: C={c}, NPMI={n:.3f}, NPMI×log(1+C)={l:.3f}; ' + '; '.join(details))
        else:
            lines.append(f'- {name}: C={c}, NPMI={n:.3f}, NPMI×log(1+C)={l:.3f}, C_late n/d')
    lines.append('')

lines += ['## Copertura e note','',
 f'- Trakt: {trakt_files:,} chronology files; {Ut:,} utenti con almeno un titolo nel canone; timestamp massimo {dt.date.fromordinal(trakt_max_day)}.',
 f'- AniList: {anilist_files:,} profili, {anilist_entries:,} entry grezze; mapping artifact {anilist_map_stats[0]:,}; tra gli ID MAL scaricati {anilist_map_stats[2]:,}/{anilist_map_stats[1]:,} mappati e {anilist_map_stats[3]:,} nel canone; {anilist[0].nnz:,} coppie utente-titolo dopo dedup. Status non disponibile nella cache.',
 f'- Serializd: {serial_files:,} profili, {serial_entries:,} entry grezze.',
 f'- MovieLens: {ml_events:,} righe rating mappate al canone prima della deduplica user×titolo; {ml[2]:,} utenti attivi; timestamp massimo {dt.date.fromordinal(ml_max_day)}.',
 '- Le classifiche “late” sono una ri-valutazione dei candidati NPMI e NPMI×logC, non una ricerca esaustiva di candidati nuovi: non usare questo test per misurare recall o decidere pesi globali.',
 '- La deduplica è per utente e riga TMDB; MAL di stagioni diverse dello stesso anime diventano una sola serie osservata.']
out='.scratch/distillazione-grafo/pmi-limited-results.md'
open(out,'w',encoding='utf-8').write('\n'.join(lines)+'\n')
print('report:',out,flush=True)

# Dedicated comparison: activity-normalized user contributions, retaining the same sparse seed query.
wl=['# Co-visione con diluizione per cronologia utente','',
    'k è il numero di item distinti grezzi della cronologia, prima del mapping al canone. Per ogni utente: w=1 per alpha=0; w=1/sqrt(k-1) per alpha=0.5; w=1/(k-1) per alpha=1 (k<=1 resta w=1; k=0 pesa 0).',
    'NPMI usa conteggi e marginali pesati in modo coerente; i pesi sono riscalati a media 1 per fonte (U_eff resta il numero di utenti attivi). Cw è supporto effettivo, non necessariamente intero. Nessuna matrice item×item completa e nessuna fusione tra fonti.',
    'Limite noto: Trakt è stato scaricato con PAGES=3 per medium, quindi al massimo 300 film + 300 serie; per i profili al tetto, k osservato sottostima la cronologia reale.','']
for name,(X,_,_) in sources.items():
    wl += [f'## {name}']
    summaries=[]
    for alpha in (0.0,0.5,1.0):
        mass,med,p90,mx,wmed,wp90,wmx=weight_summary[(alpha,name)]
        summaries.append(f'α={alpha:g}: U_eff={mass:.1f} (k mediana/p90/max {med}/{p90}/{mx}; w med/p90/max {wmed:.3g}/{wp90:.3g}/{wmx:.3g})')
    wl += ['; '.join(summaries),'']
    for i,label in seed_rows.items():
        ds=[alpha_results[a][name].get(i) for a in (0.0,0.5,1.0)]
        if not any(ds): continue
        wl.append(f'### {label} — {B["keys"][i]}')
        for alpha,d in zip((0.0,0.5,1.0),ds):
            if not d: wl.append(f'- α={alpha:g}: seed senza co-visioni'); continue
            ranked=d['logc'][:6]
            vals=' · '.join(f'{titles[j]} [Cw={d["pairs"][j][0]:g}]' for j in ranked)
            wl.append(f'- α={alpha:g}, NPMI×log(1+Cw): {vals}')
        raw=ds[0]; full=ds[2]
        if raw and full:
            a=set(raw['logc'][:10]); b=set(full['logc'][:10]); union=a|b
            wl.append(f'- overlap top-10 α0/α1: {len(a&b)}/{len(union)} Jaccard={len(a&b)/len(union):.2f}' if union else '- overlap top-10: n/d')
        wl.append('')
wl += ['## Coppie sentinella pesate','']
for label,key1,key2 in SENTINELS:
    i=item(key1); j=item(key2)
    if i is None or j is None: continue
    wl.append(f'### {label}')
    for name in sources:
        outvals=[]
        for alpha in (0.0,0.5,1.0):
            d=alpha_results[alpha][name].get(i); pair=d['pairs'].get(j) if d else None
            if pair:
                c,n,l=pair; outvals.append(f'α={alpha:g}: Cw={c:g}, NPMI={n:.3f}, score={l:.3f}')
        if outvals: wl.append(f'- {name}: ' + ' | '.join(outvals))
    wl.append('')
weight_out='.scratch/distillazione-grafo/pmi-user-weighting.md'
open(weight_out,'w',encoding='utf-8').write('\n'.join(wl)+'\n')
print('report:',weight_out,flush=True)
