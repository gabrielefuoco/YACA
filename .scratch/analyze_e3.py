import json

def analyze():
    with open(".scratch/e3_m1_results.json", encoding="utf-8") as f:
        m1 = json.load(f)
    with open(".scratch/e3_m2_results.json", encoding="utf-8") as f:
        m2 = json.load(f)

    long_profiles = ["castoffcrown", "warnok", "pepsipex"]
    all_profiles = [
        "sangam456", "hammers-lists", "sappss", "flixinatoor99", "moppierhead",
        "castoffcrown", "warnok", "pepsipex", "carverclan", "1jacobjohn"
    ]

    print("=== M1 (W_aff) SUMMARY: Remaining Clusters & Coverage (N=8) ===")
    print(f"{'Profile':15s} | {'tau=0.03 Cl(Cov)':18s} | {'tau=0.05 Cl(Cov)':18s} | {'tau=0.08 Cl(Cov)':18s} | {'tau=0.12 Cl(Cov)':18s}")
    print("-" * 95)
    for p in all_profiles:
        row = [f"{p:15s}"]
        for tau in ["0.03", "0.05", "0.08", "0.12"]:
            d = m1["W_aff"][tau][p]
            cl = d["remaining_clusters"]
            cov = d["coverage_pct"]
            ch = d["chosen_count"]
            row.append(f"{cl:2d} cl / {cov:4.1f}% ({ch})")
        print(" | ".join(row))

    print("\n=== M1 (Tr) SUMMARY: Remaining Clusters & Coverage (N=8) ===")
    print(f"{'Profile':15s} | {'tau=0.03 Cl(Cov)':18s} | {'tau=0.05 Cl(Cov)':18s} | {'tau=0.08 Cl(Cov)':18s} | {'tau=0.12 Cl(Cov)':18s}")
    print("-" * 95)
    for p in all_profiles:
        row = [f"{p:15s}"]
        for tau in ["0.03", "0.05", "0.08", "0.12"]:
            d = m1["Tr"][tau][p]
            cl = d["remaining_clusters"]
            cov = d["coverage_pct"]
            ch = d["chosen_count"]
            row.append(f"{cl:2d} cl / {cov:4.1f}% ({ch})")
        print(" | ".join(row))

    print("\n=== M2 SUMMARY: Remaining Clusters & Coverage (N=8) ===")
    for p in all_profiles:
        d = m2["0.03"][p]
        cl = d["remaining_clusters"]
        cov = d["coverage_pct"]
        ch = d["chosen_count"]
        print(f"{p:15s} | {cl:2d} cl / {cov:4.1f}% ({ch})")

    print("\n=== MIXED TAXONOMY LABELS CHECK (M1 W_aff & Tr & M2) ===")
    for rep in ["W_aff", "Tr"]:
        for tau in ["0.03", "0.05", "0.08", "0.12"]:
            for p in long_profiles:
                shelves = m1[rep][tau][p]["chosen_shelves"]
                for s in shelves:
                    if len(s["mixed_tax"]) > 2:
                        print(f"[VIOLATION] M1 {rep} tau={tau} {p}: shelf '{s['nome']}' mixes {len(s['mixed_tax'])} tax labels: {s['mixed_tax']}")

if __name__ == "__main__":
    analyze()
