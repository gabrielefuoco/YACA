import json

def verify():
    with open(".scratch/banco-casi/semi-04.json", "r", encoding="utf-8") as f:
        semi = json.load(f)
        
    with open(".scratch/banco-casi/risposte-04.json", "r", encoding="utf-8") as f:
        risposte = json.load(f)
        
    assert len(semi) == 20, f"Expected 20 seeds in semi-04, found {len(semi)}"
    assert len(risposte) == 20, f"Expected 20 seeds in risposte-04, found {len(risposte)}"
    
    all_titles = []
    
    for i in range(20):
        s_seed = semi[i]
        r_seed = risposte[i]
        
        # Exact order and key matching
        assert r_seed["seed"] == s_seed["key"], f"Mismatch at index {i}: expected {s_seed['key']}, got {r_seed['seed']}"
        assert list(r_seed.keys()) == ["seed", "suggerimenti"], f"Unexpected keys in risposte object at index {i}: {list(r_seed.keys())}"
        
        sugg = r_seed["suggerimenti"]
        assert len(sugg) == 20, f"Seed {r_seed['seed']} has {len(sugg)} suggestions, expected exactly 20"
        
        decades = set()
        for idx, item in enumerate(sugg):
            assert list(item.keys()) == ["titolo", "anno", "perche"], f"Keys mismatch in sugg {idx} of {r_seed['seed']}: {list(item.keys())}"
            assert isinstance(item["titolo"], str) and len(item["titolo"]) > 0
            assert isinstance(item["anno"], int) and 1880 <= item["anno"] <= 2026
            assert isinstance(item["perche"], str) and len(item["perche"]) > 0
            
            words = item["perche"].split()
            assert len(words) <= 12, f"Word count > 12 in {r_seed['seed']} item '{item['titolo']}': {len(words)} words ('{item['perche']}')"
            
            dec = item["anno"] // 10 * 10
            decades.add(dec)
            all_titles.append(item["titolo"])
            
        assert len(decades) >= 4, f"Seed {r_seed['seed']} has only {len(decades)} decades: {decades}"
        
    assert len(all_titles) == 400, f"Total titles count {len(all_titles)} != 400"
    unique_titles = set(all_titles)
    assert len(unique_titles) == 400, f"Found {400 - len(unique_titles)} duplicates! Total unique: {len(unique_titles)}"
    
    print("ALL VERIFICATIONS PASSED!")
    print(f"Total seeds verified: {len(risposte)}")
    print(f"Total suggestions verified: {len(all_titles)}")
    print(f"Total unique suggestions: {len(unique_titles)}")

if __name__ == "__main__":
    verify()
