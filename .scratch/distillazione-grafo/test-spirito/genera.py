"""Genera un test cieco V18 vs V18+KWLAT2 da artefatti già costruiti."""
import html
import json
import random
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from services.graph_dense import data as D

OUT = Path(__file__).parent
SEEDS = [
    ("movie:346698", "Barbie"),
    ("movie:792307", "Povere creature!"),
    ("movie:545611", "Everything Everywhere All at Once"),
    ("movie:19366", "Josie and the Pussycats"),
    ("movie:64690", "Drive"),
    ("movie:496243", "Parasite"),
    ("movie:37165", "The Truman Show"),
    ("movie:391713", "Lady Bird"),
]
GRAPHS = {
    "V18": Path("services/graph/data/v18/bolle-eterogeneo-V18-p1.0-triangolo.npz"),
    "KWLAT2": Path("services/graph/data/v18kwlat-2.0/bolle-eterogeneo-KWLAT2.0-p1.0-triangolo.npz"),
}
TOP = 8


def load(path):
    z = np.load(path)
    n = len(z["indptr"]) - 1
    return sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=(n, n))


def ranking(M, seed_row, titles, is_tv):
    row = M.getrow(seed_row)
    order = row.indices[np.argsort(-row.data)]
    return [(int(j), rank) for rank, j in enumerate(
        (j for j in order if j != seed_row and not is_tv[j]), 1)][:TOP]


def main():
    b = D.basic()
    graphs = {name: load(path) for name, path in GRAPHS.items()}
    assert all(M.shape == (b["N"], b["N"]) for M in graphs.values())
    pool, key = [], {}
    rng = random.Random(20261021)
    for si, (seed_key, expected_title) in enumerate(SEEDS, 1):
        seed_row = b["row_of"].get(seed_key)
        assert seed_row is not None, f"seed assente dal canone: {seed_key}"
        assert b["titoli"][seed_row] == expected_title, (seed_key, b["titoli"][seed_row])
        ranks = {name: dict(ranking(M, seed_row, b["titoli"], b["is_tv"]))
                 for name, M in graphs.items()}
        rows = sorted(set(ranks["V18"]) | set(ranks["KWLAT2"]))
        candidates = []
        for j in rows:
            qid = f"q{len(key) + 1:03d}"
            title = str(b["titoli"][j])
            key[qid] = {
                "seed": seed_key, "seed_title": expected_title,
                "row": j, "title": title,
                "v18_rank": ranks["V18"].get(j),
                "kwlat2_rank": ranks["KWLAT2"].get(j),
            }
            candidates.append({"id": qid, "title": title})
        rng.shuffle(candidates)
        pool.append({"seed": expected_title, "items": candidates})

    (OUT / "chiave-valutazione.json").write_text(
        json.dumps(key, ensure_ascii=False, indent=2), encoding="utf-8")
    page_data = json.dumps(pool, ensure_ascii=False).replace("</", "<\\/")
    page = r'''<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test cieco — somiglianza di spirito</title>
<style>
:root{color-scheme:dark;--bg:#111318;--card:#1b1e26;--line:#343946;--muted:#aeb4c2;--accent:#8fb8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#f2f3f7;font:16px/1.45 system-ui,sans-serif}
header{max-width:850px;margin:28px auto 16px;padding:0 18px}h1{font-size:1.6rem;margin:0 0 8px}p{color:var(--muted);margin:6px 0}
.seed{max-width:850px;margin:20px auto;padding:0 18px}.seed h2{font-size:1.15rem;margin:0 0 10px;color:var(--accent)}
.item{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:7px 0}
.title{font-weight:600}.buttons{display:flex;gap:5px;flex-shrink:0}.buttons button,footer button{border:1px solid #525968;border-radius:7px;background:#272b35;color:#eee;padding:7px 10px;cursor:pointer}
.buttons button.active{background:#476da8;border-color:#8fb8ff}.buttons button[data-v="0"].active{background:#7b3438}.buttons button[data-v="x"].active{background:#555c68}
footer{position:sticky;bottom:0;background:#111318ed;border-top:1px solid var(--line);padding:12px max(18px,calc((100vw - 814px)/2));display:flex;gap:10px;align-items:center}
#progress{color:var(--muted);white-space:nowrap}#export{margin-left:auto;background:#365f9a;border:0}textarea{display:block;width:min(850px,calc(100% - 36px));height:100px;margin:12px auto;background:#1b1e26;color:#eee;border:1px solid var(--line);padding:10px;display:none}
@media(max-width:620px){.item{align-items:flex-start;flex-direction:column}.buttons{width:100%}.buttons button{flex:1}footer{flex-wrap:wrap}#export{margin-left:0}}
</style></head><body>
<header><h1>Somiglianza di spirito — test cieco</h1>
<p>Per ogni seed, valuta i candidati pensando a tono, sensibilità, umorismo, stile o esperienza emotiva. Non premiare soltanto trama, argomento o genere condivisi.</p>
<p><b>0</b> = no · <b>1</b> = forse/parzialmente · <b>2</b> = sì, affine nello spirito · <b>?</b> = non conosco / non saprei. Le liste sono mescolate; non indicano quale grafo propone ciascun titolo.</p>
<p>Puoi interromperti e riprendere: le risposte restano salvate in questo browser.</p></header>
<main id="app"></main><footer><span id="progress"></span><button id="export">Copia risposte</button></footer><textarea id="payload" readonly aria-label="Risposte da copiare"></textarea>
<script>
const data = __DATA__, storageKey = 'yaca-spirito-v1';
let answers = {}; try { answers = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
const app = document.getElementById('app');
function draw(){
  app.innerHTML='';
  for(const group of data){
    const section=document.createElement('section'); section.className='seed';
    const h=document.createElement('h2'); h.textContent='Seed: '+group.seed; section.append(h);
    for(const item of group.items){
      const card=document.createElement('div'); card.className='item';
      const title=document.createElement('span'); title.className='title'; title.textContent=item.title; card.append(title);
      const buttons=document.createElement('div'); buttons.className='buttons';
      for(const [v,label] of [['0','No'],['1','Forse'],['2','Sì'],['x','?']]){
        const b=document.createElement('button'); b.textContent=label; b.dataset.v=v;
        if(answers[item.id]===v)b.classList.add('active');
        b.onclick=()=>{answers[item.id]=v;try{localStorage.setItem(storageKey,JSON.stringify(answers))}catch{};draw()};
        buttons.append(b);
      }
      card.append(buttons); section.append(card);
    }
    app.append(section);
  }
  const total=data.reduce((n,g)=>n+g.items.length,0), done=Object.keys(answers).length;
  document.getElementById('progress').textContent=`Valutati ${done}/${total}`;
}
draw();
document.getElementById('export').onclick=async()=>{
  const out={experiment:'yaca-spirito-v1',ratings:Object.entries(answers).map(([id,rating])=>({id,rating}))};
  const text=JSON.stringify(out);
  const box=document.getElementById('payload'); box.value=text; box.style.display='block';
  try{await navigator.clipboard.writeText(text);document.getElementById('export').textContent='Copiato — incollalo qui in chat'}
  catch{box.focus();box.select();document.getElementById('export').textContent='Selezionato — copia e incolla qui in chat'}
};
</script></body></html>'''.replace("__DATA__", page_data)
    (OUT / "test-cieco.html").write_text(page, encoding="utf-8")
    print(f"Creato test cieco: {len(SEEDS)} seed, {len(key)} candidati unici; "
          f"HTML: {OUT / 'test-cieco.html'}")
    for group in pool:
        print(f"  {group['seed']}: {len(group['items'])} candidati")


if __name__ == "__main__":
    main()
''