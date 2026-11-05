"""Build completo del grafo eterogeneo da cache locali + embedding conservati.

Non scarica dati e non riaddestra lo studente. I downloader restano nei rispettivi servizi/fetch;
qui si ricalcolano le trasformazioni del grafo. L'output è versionato e non sovrascrive V42.

  PYTHONPATH=. py -m services.graph_dense.build_graph --check
  PYTHONPATH=. py -m services.graph_dense.build_graph --build --version v42d
  PYTHONPATH=. py .scratch/uscire-dal-plateau/build-v45.py --build --version v45-replay
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import scipy

from . import config as C, data as D, provenance as PV

ROOT = C.ROOT
V42_LOCK = ROOT / '.scratch/uscire-dal-plateau/V42.lock.json'
GRAPH = ROOT / 'services/graph/data'
TIPI_SCRIPT = ROOT / '.scratch/distillazione-grafo/tipi.py'
COVISION_SCRIPT = ROOT / '.scratch/distillazione-grafo/covision.py'
LIST_SCRIPT = ROOT / '.scratch/distillazione-grafo/covision-list.py'
KWSEM_SCRIPT = ROOT / '.scratch/distillazione-grafo/kw-sem.py'
MIXER_SCRIPT = ROOT / '.scratch/distillazione-grafo/mixer.py'
CHIUDI_SCRIPT = ROOT / '.scratch/distillazione-grafo/chiudi.py'

# Solo gli asset semantici già prodotti: non si ricalcolano né si sovrascrivono.
EMBEDDING_ASSETS = (
    C.DATA / C.TRAMA, C.DATA / C.TRAMA_IDX,
    C.DATA / 'kw-emb.npy', C.DATA / 'kw-emb.txt',
)


def sha(path: Path) -> str:
    return PV.sha256_file(path)


def matrix_sha(path: Path) -> str:
    """Hash canonico della matrice (indipendente dalla compressione del contenitore npz)."""
    M, _ = PV.leggi(path)
    h = hashlib.sha256()
    h.update(np.asarray(M.shape, np.int64).tobytes())
    for x in (M.indptr.astype(np.int64, copy=False),
              M.indices.astype(np.int32, copy=False), M.data.astype(np.float32, copy=False)):
        h.update(np.ascontiguousarray(x).tobytes())
    return h.hexdigest()


def espandi(patterns):
    paths = []
    for pattern in patterns:
        found = sorted(Path(p) for p in glob.glob(str(ROOT / pattern), recursive=True))
        paths.extend(p for p in found if p.is_file())
    return sorted(set(paths))


def file_obbligatori():
    return [
        C.SRC / C.SPAZI, C.SRC / C.TITOLI, C.SRC / C.META,
        C.SRC / C.TFIDF, C.SRC / C.VOCAB,
        C.TMDB / 'movies.parquet', C.TMDB / 'tv.parquet',
        C.TMDB / 'anime-mappings.json', C.TMDB / 'anibridge-mappings.json',
        ROOT / '.scratch/distillazione-grafo/anilist-runtime-map.json',
        ROOT / '.scratch/banco-casi/holdout-autori.json',
        ROOT / '.cache/movielens/ml-32m/ratings.csv',
        ROOT / '.cache/movielens/ml-32m/links.csv',
        ROOT / '.cache/anilist-map.json',
        *EMBEDDING_ASSETS,
    ]


def preflight(rrfst='rrfstudent-v18.npz'):
    if Path(rrfst).name != rrfst or not rrfst.endswith('.npz'):
        raise SystemExit(f'--rrfst deve essere il nome di un .npz dentro {C.DATA}')
    missing = [str(p.relative_to(ROOT)) for p in file_obbligatori() if not p.is_file()]
    selected_student = C.DATA / rrfst
    if not selected_student.is_file():
        missing.append(str(selected_student.relative_to(ROOT)))
    for pattern in ('.cache/trakt/users/*.json', '.cache/trakt/lists/items-*.json',
                    '.cache/trakt/lists/popular-*.json', '.cache/anilist/users/*.json',
                    '.cache/serializd/users/*.json'):
        if not espandi([pattern]):
            missing.append(pattern)
    if missing:
        raise SystemExit('Input locali mancanti (nessun download automatico):\n  - ' + '\n  - '.join(missing))

    B = D.basic()
    if B['N'] != 76497:
        raise SystemExit(f'canone inatteso: {B["N"]:,}, V42 richiede 76.497 righe')
    z = np.load(C.DATA / C.TRAMA)
    zi = np.load(C.DATA / C.TRAMA_IDX)
    if z.shape != (B['N'], 1024) or zi.ndim != 1 or len(zi) != 71855:
        raise SystemExit(f'embedding trama inatteso: {z.shape}, idx {zi.shape}')
    student = np.load(selected_student, allow_pickle=False)
    if student['Z'].shape != (B['N'], 2048):
        raise SystemExit(f'embedding studente inatteso in {rrfst}: {student["Z"].shape}')
    return B


def encoder_cached():
    """True se Qwen tokenizer e pesi sono già in cache HF (controllo senza rete)."""
    try:
        from huggingface_hub import try_to_load_from_cache
        repo = 'Qwen/Qwen3-Embedding-0.6B'
        config = try_to_load_from_cache(repo, 'config.json')
        tokenizer = try_to_load_from_cache(repo, 'tokenizer.json')
        weights = (try_to_load_from_cache(repo, 'model.safetensors') or
                   try_to_load_from_cache(repo, 'pytorch_model.bin'))
        return bool(config and tokenizer and weights)
    except Exception:
        return False


def snapshot_inputs(rrfst='rrfstudent-v18.npz', frozen_source_types=None):
    patterns = [
        '.cache/movielens/ml-32m/ratings.csv', '.cache/movielens/ml-32m/links.csv',
        '.cache/tmdb/movies.parquet', '.cache/tmdb/tv.parquet',
        '.cache/tmdb/anime-mappings.json', '.cache/tmdb/anibridge-mappings.json',
        '.cache/anilist-map.json', '.scratch/distillazione-grafo/anilist-runtime-map.json',
        '.scratch/banco-casi/holdout-autori.json',
        '.cache/trakt/users/*.json', '.cache/trakt/lists/items-*.json',
        '.cache/trakt/lists/popular-*.json', '.cache/anilist/users/*.json',
        '.cache/serializd/users/*.json',
        'services/graph_dense/data/graph/spazi-trakt.npz',
        'services/graph_dense/data/graph/titoli-canone.txt',
        'services/graph_dense/data/graph/metadati-canone.npz',
        'services/graph_dense/data/graph/05-tfidf.npz',
        'services/graph_dense/data/graph/05-vocab.json',
        'services/graph_dense/data/trama-qwen3b.npy',
        'services/graph_dense/data/trama-qwen3b-idx.npy',
        f'services/graph_dense/data/{rrfst}',
        'services/graph_dense/data/kw-emb.npy', 'services/graph_dense/data/kw-emb.txt',
    ]
    patterns.extend((frozen_source_types or {}).values())
    return {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p) for p in espandi(patterns)}


def verify_frozen_source_types(lock):
    """Controlla i tre tipi legacy congelati che avevano somme dipendenti dall'ordine dei set."""
    files = lock.get('frozen_source_types', {})
    if not files:
        return
    expected_file = lock.get('frozen_source_type_sha256', {})
    expected_matrix = lock.get('frozen_source_type_matrix_sha256', {})
    for name, rel in files.items():
        p = ROOT / rel
        if not p.is_file():
            raise SystemExit(f'tipo V45 congelato mancante: {p}')
        if sha(p) != expected_file.get(name):
            raise SystemExit(f'tipo V45 congelato alterato: {p}')
        if matrix_sha(p) != expected_matrix.get(name):
            raise SystemExit(f'matrice del tipo V45 congelato alterata: {p}')


def codice_sha():
    files = [
        Path(__file__), C.GD / 'config.py', C.GD / 'data.py', C.GD / 'provenance.py',
        C.GD / 'trakt.py', C.GD / 'contesti.py', C.GD / 'contesti_tipo.py',
        C.GD / 'listsem.py', C.GD / 'crewprop.py', C.GD / 'tribu_gusto.py', C.GD / 'amore_res.py',
        C.GD / 'amore.py', C.GD / 'scelta_k.py',
        TIPI_SCRIPT, COVISION_SCRIPT, LIST_SCRIPT, KWSEM_SCRIPT, MIXER_SCRIPT, CHIUDI_SCRIPT,
    ]
    return {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p) for p in files}


def releases(B, path: Path):
    """Date ordinali ricostruite dai Parquet TMDB cached, senza rete."""
    out = np.zeros(B['N'], np.int64)
    for kind, filename, column in (('movie', 'movies.parquet', 'release_date'),
                                   ('tv', 'tv.parquet', 'first_air_date')):
        import pandas as pd
        df = pd.read_parquet(C.TMDB / filename, columns=['id', column])
        for ident, value in zip(df['id'], df[column]):
            row = B['row_of'].get(f'{kind}:{int(ident)}')
            if row is None or not isinstance(value, str) or len(value) < 10:
                continue
            try:
                out[row] = dt.date.fromisoformat(value[:10]).toordinal()
            except ValueError:
                pass
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, out)
    return path


def run(cmd, env):
    print('\n$ ' + ' '.join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), cwd=ROOT, env=env, check=True)


def registra_list(env, lista_npz, tipi_out):
    """L'emettitore LIST storico scrive l'NPZ ma non aggiorna il manifest: registralo qui."""
    os.environ.update(env)
    spec = importlib.util.spec_from_file_location('v42_tipi', TIPI_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    z = np.load(lista_npz, allow_pickle=False)
    from scipy import sparse as sp
    n = len(z['indptr']) - 1
    M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(n, n))
    mod.save('LIST', M, 'liste Trakt per autore: NPMI+ * log1p(Cw), minsup 2, top-20',
             {'minsup': 2, 'topk': 20})


def build(a, lock):
    B = preflight(a.rrfst)
    protected_assets = (*EMBEDDING_ASSETS, C.DATA / a.rrfst)
    assets_before = {str(p.relative_to(ROOT)): sha(p) for p in protected_assets}
    verify_frozen_source_types(lock)
    inputs = snapshot_inputs(a.rrfst, lock.get('frozen_source_types'))
    code = codice_sha()
    out = GRAPH / a.version
    aux = C.DATA / a.version
    if out.exists() or aux.exists():
        if not a.force:
            raise SystemExit(f'Output gia\' presente: {out} / {aux}. Usa --force per ricreare solo questa versione.')
        for p in (out, aux):
            if p.exists():
                shutil.rmtree(p)
    out.mkdir(parents=True)
    aux.mkdir(parents=True)
    types = out / 'tipi2'
    norm = out / 'tipi2-norm'
    pesi_out = out / 'tipi2-pesi'
    mix_out = out
    for p in (types, norm, pesi_out):
        p.mkdir(parents=True, exist_ok=True)
    release_path = releases(B, aux / 'uscite-ordinali.npy')
    trakt_cache = aux / 'trakt-utenti.npz'
    covision_path = aux / 'covision.npz'
    list_path = aux / 'covision-list.npz'
    contesti_path = aux / 'contesti-k24.npz'
    resid_embed = aux / 'embeddings' / 'resid-k24-seed7.npz'
    beta_tag = f'{a.tribu_beta:.2f}'.replace('.', 'p')
    tribu_embed = C.DATA / 'embeddings' / f'tribu-svd-k{a.tribu_k}-b{beta_tag}-seed{a.tribu_seed}.npz'

    weights = dict(lock['weights'])
    weights['TRIBU'] = float(a.tribu_weight)
    (out / 'pesi.json').write_text(json.dumps(weights, indent=1), encoding='utf-8')
    env = dict(os.environ, PYTHONPATH='.', TIPI_OUT=str(types), NORM_OUT=str(norm),
               PESI_OUT=str(pesi_out), MIX_OUT=str(mix_out), TRAKT_CACHE=str(trakt_cache),
               COVISION_OUT=str(covision_path), COVISION_IN=str(covision_path),
               USCITE_ORDINALI=str(release_path), LIST_OUT=str(list_path), LIST_MINSUP='2',
               RRFST_Z=a.rrfst, KWSEM_EMBEDDINGS=str(C.DATA / 'embeddings' / 'kwsem-qwen3-0.6b.npz'),
               LISTSEM_EMBEDDINGS=str(C.DATA / 'embeddings' / 'listsem-qwen3-0.6b.npz'))
    if not a.allow_model_download:
        env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
    else:
        env.pop('HF_HUB_OFFLINE', None); env.pop('TRANSFORMERS_OFFLINE', None)

    # Interazioni compatte: ricostruibili dai JSON Trakt cached.
    run([sys.executable, '-u', '-m', 'services.graph_dense.trakt', '--out', trakt_cache], env)

    # COVISION (4 fonti, con sconto temporale) e suo tipo top-20.
    run([sys.executable, '-u', COVISION_SCRIPT, 'build', '--alpha', '0.5', '--kappa', '3',
         '--topk', str(a.covision_topk), '--minsup', '2'], env)
    run([sys.executable, '-u', TIPI_SCRIPT, 'covision'], env)

    # Tipi content-based. TRAMA e RRFST leggono embeddings conservati, mai rigenerati qui.
    run([sys.executable, '-u', TIPI_SCRIPT, 'trama', '--k', '100'], env)
    run([sys.executable, '-u', KWSEM_SCRIPT, '--sem-alpha', '0.6', '--per-kw', '20',
         '--k', '100', '--nome', 'KWSEM'], env)
    run([sys.executable, '-u', TIPI_SCRIPT, 'rrfst', '--k', '100'], env)
    for kind in ('CAST', 'DIR', 'PROD', 'COLL'):
        run([sys.executable, '-u', TIPI_SCRIPT, 'meta', '--tipo', kind, '--k', '100'], env)

    # LIST: lo script storico produce la matrice cached, il wrapper la registra come tipo.
    run([sys.executable, '-u', LIST_SCRIPT, 'build'], env)
    registra_list(env, list_path, types)

    # Coorti e linguaggio delle liste, tutti da cronologie/liste locali.
    run([sys.executable, '-u', '-m', 'services.graph_dense.crewprop', '--k', '100',
         '--ruoli', 'dir,wr,ca', '--modo', 'canone', '--max-stessi', '2',
         '--out', types / 'CREWPROP.npz', '--manifest', types / 'manifest.json'], env)
    run([sys.executable, '-u', '-m', 'services.graph_dense.contesti', '--k', '24', '--iter', '60',
         '--out', contesti_path], env)
    run([sys.executable, '-u', '-m', 'services.graph_dense.contesti_tipo', '--k', '100',
         '--contesti', contesti_path, '--out', types / 'CONTESTI.npz',
         '--manifest', types / 'manifest.json'], env)
    run([sys.executable, '-u', '-m', 'services.graph_dense.listsem', '--k', '100',
         '--out', types / 'LISTSEM.npz', '--manifest', types / 'manifest.json'], env)
    run([sys.executable, '-u', '-m', 'services.graph_dense.tribu_gusto', '--k', '100',
         '--tribu', str(a.tribu_k), '--top', str(a.tribu_top),
         '--mainstrema', str(a.tribu_mainstream), '--beta', str(a.tribu_beta),
         '--seme', str(a.tribu_seed), '--embeddings-in', tribu_embed,
         '--embeddings-out', tribu_embed, '--out', types / 'TRIBU.npz',
         '--manifest', types / 'manifest.json'], env)
    run([sys.executable, '-u', '-m', 'services.graph_dense.amore_res', '--k', '100',
         '--temi', '24', '--iter', '60', '--soglia', '0', '--embeddings-out', resid_embed,
         '--out', types / 'RESID.npz', '--manifest', types / 'manifest.json'], env)

    # CAST/DIR/PROD usavano insiemi Python la cui iterazione casuale cambiava la somma float32
    # sulle parità al confine del top-100. Per riprodurre V45 al bit di matrice, riusiamo i tre
    # NPZ congelati e hash-verificati, prodotti dalla build canonica; tutti gli altri tipi si
    # ricostruiscono dai corpora e dagli embedding cache.
    frozen = lock.get('frozen_source_types', {})
    if frozen:
        man_path = types / 'manifest.json'
        man = json.loads(man_path.read_text(encoding='utf-8')) if man_path.exists() else {}
        source_man = json.loads((ROOT / Path(next(iter(frozen.values()))).parent / 'manifest.json')
                                .read_text(encoding='utf-8'))
        for name, rel in frozen.items():
            src = ROOT / rel
            shutil.copy2(src, types / f'{name}.npz')
            if name in source_man:
                man[name] = source_man[name]
        man_path.write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
        print('tipi congelati riusati: ' + ', '.join(sorted(frozen)), flush=True)

    type_names = ','.join(lock['tipi'])
    run([sys.executable, '-u', TIPI_SCRIPT, 'norm'], env)
    run([sys.executable, '-u', TIPI_SCRIPT, 'budget', '--pota', '100'], env)
    run([sys.executable, '-u', MIXER_SCRIPT, '--modo', 'rrf', '--rrf-k', '15',
         '--damp-coll', '--damp-titolo', '--gate-asimmetrico', '--pop-gap', '2.0',
         '--pop-slope', '1.5', '--gate-k', '10', '--damp-animazione',
         '--damp-anim-fattore', '0.2', '--tipi', type_names], env)
    final = out / f'bolle-eterogeneo-{a.version.upper()}-p1.0-triangolo.npz'
    run([sys.executable, '-u', CHIUDI_SCRIPT, mix_out / 'MIX-rrf-dc-dt-ga.npz', final,
         '--modo', 'log'], env)

    # Verifica che nessun embedding base sia stato sovrascritto e conserva un manifest completo.
    assets_after = {str(p.relative_to(ROOT)): sha(p) for p in protected_assets}
    if assets_after != assets_before:
        raise SystemExit('Un embedding congelato è cambiato durante la build; output non promosso.')
    tipi_hash = {t: sha(types / f'{t}.npz') for t in lock['tipi']}
    prepared_hash = {t: sha(pesi_out / f'{t}.npz') for t in lock['tipi']}
    _, mp = PV.leggi(mix_out / 'MIX-rrf-dc-dt-ga.npz')
    _, fp = PV.leggi(final)
    manifest = {
        'version': a.version.upper(), 'created_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'status': 'built-from-local-caches', 'canon_len': B['N'],
        'parameters': {'weights': weights, 'tribu_seed': a.tribu_seed,
                       'tribu': {'k': a.tribu_k, 'top': a.tribu_top,
                                 'mainstrema': a.tribu_mainstream, 'beta': a.tribu_beta},
                       'covision': {'alpha': 0.5, 'kappa': 3, 'topk': a.covision_topk, 'minsup': 2},
                       'rrfst_source': a.rrfst,
                       'rrf_k': 15, 'budget': 100, 'closure': 'log',
                       'damp_animation': 0.2},
        'raw_and_foundation_sha256': inputs,
        'preserved_embedding_sha256': assets_after,
        'selected_rrfst_student_sha256': sha(C.DATA / a.rrfst),
        'source_type_matrix_sha256': {
            t: matrix_sha(types / f'{t}.npz') for t in lock['tipi']},
        'budgeted_type_matrix_sha256': {
            t: matrix_sha(pesi_out / f'{t}.npz') for t in lock['tipi']},
        'generated_embedding_sha256': {
            str(p.relative_to(ROOT)): sha(p) for p in (resid_embed, tribu_embed,
                C.DATA / 'embeddings' / 'kwsem-qwen3-0.6b.npz',
                C.DATA / 'embeddings' / 'listsem-qwen3-0.6b.npz') if p.exists()},
        'source_type_sha256': tipi_hash, 'budgeted_type_sha256': prepared_hash,
        'mix_provenance': mp, 'final_provenance': fp,
        'artifact_sha256': {'mix': sha(mix_out / 'MIX-rrf-dc-dt-ga.npz'), 'final': sha(final)},
        'artifact_matrix_sha256': {'mix': matrix_sha(mix_out / 'MIX-rrf-dc-dt-ga.npz'),
                                   'final': matrix_sha(final)},
        'code_sha256': code, 'runtime': {'python': sys.version, 'numpy': np.__version__,
                                         'scipy': scipy.__version__},
        'raw_corpora_downloaded': False,
        'model_download_allowed': bool(a.allow_model_download),
    }
    (out / 'pipeline-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                                                encoding='utf-8')
    expected = lock.get('expected')
    if expected:
        checks = {
            'raw_and_foundation_sha256': inputs,
            'code_sha256': code,
            'source_type_sha256': tipi_hash,
            'budgeted_type_sha256': prepared_hash,
            'source_type_matrix_sha256': manifest['source_type_matrix_sha256'],
            'budgeted_type_matrix_sha256': manifest['budgeted_type_matrix_sha256'],
            'selected_rrfst_student_sha256': manifest['selected_rrfst_student_sha256'],
            'artifact_sha256': manifest['artifact_sha256'],
            'artifact_matrix_sha256': manifest['artifact_matrix_sha256'],
            'runtime': manifest['runtime'],
            'frozen_source_type_sha256': {
                t: sha(ROOT / p) for t, p in lock.get('frozen_source_types', {}).items()},
            'frozen_source_type_matrix_sha256': {
                t: matrix_sha(ROOT / p) for t, p in lock.get('frozen_source_types', {}).items()},
        }
        embed_by_name = {
            Path(k.replace('\\', '/')).name: v
            for k, v in manifest['generated_embedding_sha256'].items()
        }
        checks['generated_embedding_sha256'] = embed_by_name
        mismatches = [name for name, actual in checks.items() if expected.get(name) != actual]
        if mismatches:
            raise SystemExit('Build NON identica alla ricetta congelata: ' + ', '.join(mismatches) +
                             f'\\nConservata per diagnosi in {out}')
        print('V45 LOCK OK: input, codice, tipi, MIX e grafo finale identici.', flush=True)
    print(f'\nBuild completata: {final}\nManifest: {out / "pipeline-manifest.json"}')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='controlla input e embedding, senza scrivere')
    mode.add_argument('--build', action='store_true', help='ricostruisce tutti i tipi e il grafo da cache locali')
    ap.add_argument('--version', default='v42d', help='directory nuova sotto services/graph/data (default v42d)')
    ap.add_argument('--recipe-lock', default=str(V42_LOCK),
                    help='ricetta congelata (pesi/tipi + hash attesi); default V42')
    ap.add_argument('--tribu-seed', type=int, default=20261105)
    ap.add_argument('--tribu-k', type=int, default=64)
    ap.add_argument('--tribu-top', type=int, default=3)
    ap.add_argument('--tribu-mainstream', type=int, default=4)
    ap.add_argument('--tribu-beta', type=float, default=0.65)
    ap.add_argument('--tribu-weight', type=float, default=0.15)
    ap.add_argument('--covision-topk', type=int, default=100)
    ap.add_argument('--rrfst', default='rrfstudent-v18.npz',
                    help='file studente per il tipo RRFST; V42 storico usava rrfstudent-swap.npz')
    ap.add_argument('--allow-model-download', action='store_true',
                    help='consente il download dei pesi Qwen solo se manca la cache embedding; i dati non si scaricano')
    ap.add_argument('--force', action='store_true', help='rimuove solo la directory di output indicata')
    a = ap.parse_args()
    if not a.version.startswith('v') or '/' in a.version or '\\' in a.version:
        ap.error('--version deve essere un nome semplice, ad es. v42d o v42d-seed7')
    os.chdir(ROOT)
    lock_path = Path(a.recipe_lock)
    if not lock_path.is_absolute():
        lock_path = ROOT / lock_path
    if not lock_path.is_file():
        ap.error(f'ricetta non trovata: {lock_path}')
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    recipe = lock.get('recipe')
    if recipe:
        expected_cli = {
            'rrfst': recipe['rrfst'], 'tribu_seed': recipe['tribu_seed'],
            'tribu_k': recipe['tribu_k'], 'tribu_top': recipe['tribu_top'],
            'tribu_mainstream': recipe['tribu_mainstream'], 'tribu_beta': recipe['tribu_beta'],
            'tribu_weight': recipe['tribu_weight'], 'covision_topk': recipe['covision_topk'],
        }
        mismatches = [k for k, v in expected_cli.items() if getattr(a, k) != v]
        if mismatches:
            ap.error('parametri diversi dalla ricetta congelata: ' + ', '.join(mismatches))
    preflight(a.rrfst)
    if a.check:
        print('Input locali presenti; embedding trama/studente coerenti col canone.')
        kw = C.DATA / 'embeddings' / 'kwsem-qwen3-0.6b.npz'
        ls = C.DATA / 'embeddings' / 'listsem-qwen3-0.6b.npz'
        local_model = encoder_cached()
        print(f'Embedding KWSEM: {"cache" if kw.exists() else "da materializzare"} · '
              f'LISTSEM: {"cache" if ls.exists() else "da materializzare"} · '
              f'modello Qwen locale: {"si" if local_model else "no"}')
        if (not kw.exists() or not ls.exists()) and not local_model:
            raise SystemExit('Preflight incompleto: per il primo build servono i pesi Qwen una volta; '
                             'i corpora locali sono già presenti. Nessun download è stato avviato.')
        expected = lock.get('expected')
        if expected:
            verify_frozen_source_types(lock)
            current = {'raw_and_foundation_sha256': snapshot_inputs(a.rrfst, lock.get('frozen_source_types')),
                       'code_sha256': codice_sha(),
                       'selected_rrfst_student_sha256': sha(C.DATA / a.rrfst),
                       'frozen_source_type_sha256': {
                           t: sha(ROOT / p) for t, p in lock.get('frozen_source_types', {}).items()},
                       'frozen_source_type_matrix_sha256': {
                           t: matrix_sha(ROOT / p) for t, p in lock.get('frozen_source_types', {}).items()}}
            bad = [k for k, v in current.items() if expected.get(k) != v]
            if bad:
                raise SystemExit('Preflight V45 bloccato: input/codice congelato diverso: ' + ', '.join(bad))
            print('Ricetta congelata: input, codice e studente corrispondono.', flush=True)
        return
    if not a.allow_model_download and not encoder_cached():
        kw = C.DATA / 'embeddings' / 'kwsem-qwen3-0.6b.npz'
        ls = C.DATA / 'embeddings' / 'listsem-qwen3-0.6b.npz'
        if not kw.exists() or not ls.exists():
            raise SystemExit('Manca la cache locale Qwen per materializzare gli embedding KWSEM/LISTSEM. '
                             'La build si ferma prima di elaborare i dati. Dopo aver deciso il download '
                             'una tantum dei pesi, usa --allow-model-download; i corpora non vengono scaricati.')
    build(a, lock)


if __name__ == '__main__':
    main()
