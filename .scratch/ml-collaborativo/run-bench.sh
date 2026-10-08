#!/usr/bin/env bash
# Banco in parallelo: spezza i trial su N processi (12 core, prima se ne usava uno).
# Uso: .scratch/ml-collaborativo/run-bench.sh [N_PROCESSI] [CAND_FILE] [L1_ADJ]
set -e
N="${1:-6}"; CAND="${2:-graph-candidates-testset.json}"; ADJ="${3:-}"
TOT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.cache/movielens/'+process.argv[1],'utf8')).length)" "$CAND")
PER=$(( (TOT + N - 1) / N ))
D=$(mktemp -d)
for i in $(seq 0 $((N-1))); do
  A=$(( i * PER )); B=$(( A + PER )); [ "$B" -gt "$TOT" ] && B=$TOT
  [ "$A" -ge "$TOT" ] && continue
  SLICE="$A:$B" ROWS_OUT="$D/rows-$i.json" CAND_FILE="$CAND" L1_ADJ="$ADJ" \
    node .scratch/ml-collaborativo/bench-graph-funnel.js > "$D/log-$i.txt" 2>&1 &
done
wait
node .scratch/ml-collaborativo/merge-rows.js "$D"/rows-*.json
rm -rf "$D"
