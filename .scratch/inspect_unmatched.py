import pandas as pd

m_df = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'original_title', 'release_date', 'production_countries', 'original_language'])
t_df = pd.read_parquet('.cache/tmdb/tv.parquet', columns=['id', 'name', 'original_name', 'first_air_date', 'production_countries', 'original_language'])

unmatched_names = [
    'Baahubali', 'Dhoom', 'Drunken Master', 'Supercop', 'Raid 2', 'Ong-Bak',
    'Anatomie', 'weiße Band', 'All of Us Are Dead', 'Parasyte', 'El hoyo', 'Platform',
    'Ostře sledované vlaky', 'Jamón', 'Cowboy Bebop', 'One Piece', 'Tengoku to jigoku',
    'Ne le dis', 'Salinui', 'Memories of Murder', 'Hoshi no Koe', 'Honneamise',
    'Nausicaa', 'Naushika', 'Kisaragi', 'Ano natsu', 'Joheunnom', 'Lemonade Joe',
    'Yojimbo', 'Tetsuo', 'Aknyeo', 'Villainess', 'Serbuan maut', 'Riki-Oh',
    'Ugetsu', 'Janghwa', 'Marnie', 'Nosferatu', 'Astérix', 'Shinjû',
    'Ram-Leela', 'Devdas', 'Dare mo shiranai', 'Hotaru no haka', 'Grave of the Fireflies', 'Hausu'
]

for name in unmatched_names:
    m = m_df[m_df.title.str.contains(name, case=False, na=False) | m_df.original_title.str.contains(name, case=False, na=False)]
    t = t_df[t_df.name.str.contains(name, case=False, na=False) | t_df.original_name.str.contains(name, case=False, na=False)]
    print(f"=== SEARCH: {name} ===")
    for _, r in m.head(2).iterrows():
        print(f"  MOVIE: {r.id} | {r.title} | {r.original_title} | {r.release_date} | {r.original_language} | {r.production_countries}")
    for _, r in t.head(2).iterrows():
        print(f"  TV: {r.id} | {r.name} | {r.original_name} | {r.first_air_date} | {r.original_language} | {r.production_countries}")
