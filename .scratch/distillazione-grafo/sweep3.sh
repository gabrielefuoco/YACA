set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=.
for a in 0.8 1.0; do
  tag=$(echo $a | tr -d '.')
  echo "=== build KWSEM$tag (alpha $a) ==="
  py -u .scratch/distillazione-grafo/kw-sem.py --sem-alpha $a --nome KWSEM$tag 2>&1 | grep -E "combinato|KWSEM "
done
py -u .scratch/distillazione-grafo/tipi.py norm 2>&1 | grep KWSEM08
py -u .scratch/distillazione-grafo/tipi.py norm 2>&1 | grep KWSEM10
py -u .scratch/distillazione-grafo/tipi.py budget --pota 100 2>&1 | grep -E "KWSEM08|KWSEM10"
for t in KWSEM08 KWSEM10; do
  echo "=== mixer $t ==="
  py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo --pop-gap 3.0 --pop-slope 1.5 --tipi COVISION,TRAMA,$t,RRFST,CAST,DIR,PROD,COLL,LIST 2>&1 | grep scritto
  py -u .scratch/distillazione-grafo/chiudi.py services/graph/data/v12/MIX-rrf-dc-dt.npz .cache/v15-$t.npz --alpha0 0.1 2>&1 | grep scritto
done
echo "=== eval ==="
py -u .scratch/distillazione-grafo/eval-gold.py services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz .cache/v15-KWSEM06.npz .cache/v15-KWSEM08.npz .cache/v15-KWSEM10.npz 2>&1 | tail -8
