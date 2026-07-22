import pickle
import re

with open('cache/kws_f15.pkl', 'rb') as f:
    valid_keywords, kw_to_id, id_to_kw = pickle.load(f)

# NSFW Regex
nsfw_pattern = re.compile(r'\b(sex|sexy|sexual|sexuality|porn\w*|eroti\w*|nude|nudity|rape|incest|masturbat\w*|vibrator|dildo|bdsm|fetish\w*|orgasm|3p|4p|sexually)\b', re.IGNORECASE)

nsfw_kws = [k for k in valid_keywords if nsfw_pattern.search(k)]

japanese_pattern = re.compile(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]')
jap_kws = [k for k in valid_keywords if japanese_pattern.search(k)]

# "Mood" or "feeling" keywords heuristically
mood_kws = [k for k in valid_keywords if k.endswith('ing') or k in ['powerful', 'intense', 'awestruck', 'enthusiastic']]

print(f"Total valid keywords: {len(valid_keywords)}")
print(f"NSFW matched: {len(nsfw_kws)} (e.g., {nsfw_kws[:10]})")
print(f"Japanese matched: {len(jap_kws)} (e.g., {jap_kws[:10]})")
print(f"Mood matched: {len(mood_kws)} (e.g., {mood_kws[:10]})")
