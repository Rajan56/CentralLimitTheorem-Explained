"""Write video/clt-captions.vtt from build/timeline.json (run after make_narration.py)."""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(here, 'build', 'timeline.json'), encoding='utf-8'))


def ts(t):
    m, s = divmod(t, 60)
    return f"00:{int(m):02d}:{s:06.3f}"


lines = ["WEBVTT", "", "NOTE Captions for 'The Central Limit Theorem in 90 seconds'. Timings come from the narration track.", ""]
for i, s in enumerate(d['sentences'], 1):
    lines += [str(i), f"{ts(s['start'])} --> {ts(s['end'] + 0.25)}", s['text'], ""]
out = os.path.join(here, '..', 'video', 'clt-captions.vtt')
open(out, 'w', encoding='utf-8').write("\n".join(lines))
print('wrote', os.path.normpath(out))
