import json

def print_tables():
    with open(".scratch/e1_results.json", encoding="utf-8") as f:
        e1 = json.load(f)
    with open(".scratch/e2_results.json", encoding="utf-8") as f:
        e2 = json.load(f)

    print("=== E1 — AGE FILTER (Sweep N in {90, 180, 365}) ===")
    print(f"{'Profile':15s} | {'Seeds':5s} | {'Base Cl':7s} | {'N=90 Drp(Tax)':13s} | {'N=180 Drp(Tax)':15s} | {'N=365 Drp(Tax)':15s} | {'Elig Cov (Base->90->180->365)':30s} | {'Served N=8 Cov (Base->90)':26s}")
    print("-" * 140)
    for p, v in e1.items():
        s90 = v["sweeps"]["90"]
        s180 = v["sweeps"]["180"]
        s365 = v["sweeps"]["365"]
        d90_str = f"{s90['n_dropped']} ({s90['dropped_tax']} tax)"
        d180_str = f"{s180['n_dropped']} ({s180['dropped_tax']} tax)"
        d365_str = f"{s365['n_dropped']} ({s365['dropped_tax']} tax)"
        cov_all_str = f"{v['base_cov_all']:.1f}% -> {s90['cov_all_pct']:.1f}% -> {s180['cov_all_pct']:.1f}% -> {s365['cov_all_pct']:.1f}%"
        cov_s8_str = f"{v['base_cov_8']:.1f}% ({v['base_served_8']}) -> {s90['cov_8_pct']:.1f}% ({s90['served_8']})"
        print(f"{p:15s} | {v['n_seeds']:5d} | {v['base_n_cl']:7d} | {d90_str:13s} | {d180_str:15s} | {d365_str:15s} | {cov_all_str:30s} | {cov_s8_str:26s}")
        if s90['dropped_tax_names']:
            print(f"   [!] N=90 dropped taxonomy on {p}: {s90['dropped_tax_names']}")

    print("\n=== E2 — SIZE FILTER (Sweep S in {4, 5}, exemption if min_eta < 90) ===")
    print(f"{'Profile':15s} | {'Seeds':5s} | {'Base Cl':7s} | {'S=4 Drp(Tax/Saved)':18s} | {'S=5 Drp(Tax/Saved)':18s} | {'Elig Cov (Base->S4->S5)':25s} | {'Served N=8 Cov (Base->S4->S5)':28s}")
    print("-" * 135)
    for p, v in e2.items():
        s4 = v["sweeps"]["4"]
        s5 = v["sweeps"]["5"]
        s4_str = f"{s4['n_dropped']} ({s4['dropped_tax']} tax / {s4['freshness_saved']} svd)"
        s5_str = f"{s5['n_dropped']} ({s5['dropped_tax']} tax / {s5['freshness_saved']} svd)"
        cov_all_str = f"{v['base_cov_all']:.1f}% -> {s4['cov_all_pct']:.1f}% -> {s5['cov_all_pct']:.1f}%"
        cov_s8_str = f"{v['base_cov_8']:.1f}% -> {s4['cov_8_pct']:.1f}% -> {s5['cov_8_pct']:.1f}%"
        print(f"{p:15s} | {v['n_seeds']:5d} | {v['base_n_cl']:7d} | {s4_str:18s} | {s5_str:18s} | {cov_all_str:25s} | {cov_s8_str:28s}")
        if s4['dropped_tax_names']:
            print(f"   [!] S=4 dropped taxonomy on {p}: {s4['dropped_tax_names']}")
        if s5['dropped_tax_names']:
            print(f"   [!] S=5 dropped taxonomy on {p}: {s5['dropped_tax_names']}")

if __name__ == "__main__":
    print_tables()
