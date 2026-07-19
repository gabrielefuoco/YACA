from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

model = SentenceTransformer('BAAI/bge-small-en-v1.5')
words = ["toy", "sex toy", "vibrator", "dildo", "stuffed animal", "lego", "cab driver", "taxi driver", "mafia", "mob"]
embs = model.encode(words, normalize_embeddings=True)

print("--- Cosine Similarities ---")
pairs = [
    ("toy", "sex toy"),
    ("toy", "stuffed animal"),
    ("sex toy", "vibrator"),
    ("cab driver", "taxi driver"),
    ("mafia", "mob")
]

for w1, w2 in pairs:
    idx1 = words.index(w1)
    idx2 = words.index(w2)
    sim = cosine_similarity([embs[idx1]], [embs[idx2]])[0][0]
    print(f"{w1} <-> {w2} : {sim:.3f}")
