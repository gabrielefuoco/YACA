#!/usr/bin/env bash
# Addestra le 4 varianti sul target Mercury. Uso: bash .scratch/distillazione-grafo/run-m.sh
set -e
cd "$(dirname "$0")/../.."
export PYTHONPATH=.
D=services/graph_dense/data
T="$D/mercury-target.npz"

# M0 — field student, target Mercury, senza semantica
py -u -m services.graph_dense.train_b3 --field --init "$D/d3f-model.pt" \
  --beh-target "$T" --wsem 0 --fixed 0.3,0.2,0.5 --epoche 40 --nome m0 \
  --ckpt-every 10 > "$D/m0.log" 2>&1

# M1 — field student, target Mercury + semantica
py -u -m services.graph_dense.train_b3 --field --init "$D/d3f-model.pt" \
  --beh-target "$T" --sem-target "$D/sem-top25.npz" --wsem 0.5 \
  --fixed 0.3,0.2,0.5 --epoche 40 --nome m1 --ckpt-every 10 > "$D/m1.log" 2>&1

# M2 — come M0, ma con peso per film = 1 - none
py -u -m services.graph_dense.train_b3 --field --init "$D/d3f-model.pt" \
  --beh-target "$T" --wsem 0 --pf none --fixed 0.3,0.2,0.5 --epoche 40 --nome m2 \
  --ckpt-every 10 > "$D/m2.log" 2>&1

# BM — block model (meta a sacchetti) sullo stesso target
py -u -m services.graph_dense.train_b3 --init "$D/b3-en-model.pt" \
  --beh-target "$T" --wsem 0 --fixed 0.3,0.2,0.5 --epoche 40 --nome bm \
  --ckpt-every 10 > "$D/bm.log" 2>&1

echo "fatto: m0 m1 m2 bm · valuta con py -u .scratch/distillazione-grafo/valuta-m.py"
