"""fetch-anilist-tags.py — scarica generi e tag AniList per gli anime del canone.

  PYTHONPATH=. py .scratch/distillazione-grafo/fetch-anilist-tags.py

Legge `.cache/anilist-map.json` (costruito dall'anibridge), interroga AniList a blocchi di 50 id
e salva `.cache/anilist-tags.json`: per ogni id AniList, generi e tag con la loro rilevanza
(`rank`, 0-100) e il flag spoiler. Nessuna autenticazione: la GraphQL pubblica basta.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

URL = 'https://graphql.anilist.co'
OUT = '.cache/anilist-tags.json'
Q = """
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      idMal
      format
      episodes
      averageScore
      popularity
      genres
      tags { name rank isMediaSpoiler }
    }
  }
}
"""
lock = threading.Lock()
STAT = {'ok': 0, 'err': 0, '429': 0}


def chiedi(ids, tentativi=6):
    body = json.dumps({'query': Q, 'variables': {'ids': ids}}).encode()
    for t in range(tentativi):
        req = urllib.request.Request(URL, data=body, headers={
            'Content-Type': 'application/json', 'Accept': 'application/json',
            'User-Agent': 'YACA/1.0 (anime tags)'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            if 'errors' in d:
                raise RuntimeError(str(d['errors'])[:200])
            with lock:
                STAT['ok'] += 1
            return d['data']['Page']['media']
        except urllib.error.HTTPError as e:
            with lock:
                STAT['429' if e.code == 429 else 'err'] += 1
            time.sleep(2.0 + 2.0 * t)
        except Exception:
            with lock:
                STAT['err'] += 1
            time.sleep(1.0 + t)
    return []


def main():
    mappa = json.load(open('.cache/anilist-map.json', encoding='utf-8'))
    ids = mappa['ids']
    fatto = {}
    if os.path.exists(OUT):
        fatto = json.load(open(OUT, encoding='utf-8'))
        print(f'ripresa: {len(fatto):,} già scaricati', flush=True)
    da_fare = [i for i in ids if str(i) not in fatto]
    blocchi = [da_fare[i:i + 50] for i in range(0, len(da_fare), 50)]
    print(f'id {len(ids):,} · da fare {len(da_fare):,} · blocchi {len(blocchi)}', flush=True)

    def uno(blocco):
        return chiedi(blocco)

    with ThreadPoolExecutor(max_workers=3) as ex, open(OUT + '.tmp', 'w', encoding='utf-8') as tmp:
        fut = {ex.submit(uno, b): b for b in blocchi}
        fatti = 0
        tutti = dict(fatto)
        for fu in as_completed(fut):
            for m in fu.result():
                tutti[str(m['id'])] = {
                    'mal': m.get('idMal'), 'format': m.get('format'),
                    'episodes': m.get('episodes'), 'score': m.get('averageScore'),
                    'pop': m.get('popularity'), 'genres': m.get('genres') or [],
                    'tags': [[t['name'], t.get('rank', 0), bool(t.get('isMediaSpoiler'))]
                             for t in (m.get('tags') or [])]}
            fatti += 1
            if fatti % 10 == 0:
                print(f'  {fatti}/{len(blocchi)} blocchi · ok {STAT["ok"]} err {STAT["err"]} '
                      f'429 {STAT["429"]}', flush=True)
    json.dump(tutti, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'\nscritti {len(tutti):,} anime in {OUT} · chiamate ok {STAT["ok"]} · '
          f'err {STAT["err"]} · 429 {STAT["429"]}', flush=True)


if __name__ == '__main__':
    main()
