set -e
cd /c/Users/gabri/APP/YACA
for b in 1 2 3 4 5; do
  PYTHONPATH=. py -u .scratch/uscire-dal-plateau/strumento.py v45 v45x$b \
     .scratch/banco-casi/dev-kfold/holdout-blocco-$b.json > .cache/strumento-$b.log 2>&1
  echo "blocco $b fatto"
done
