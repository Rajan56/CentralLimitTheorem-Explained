"""Generate the narration track and sentence timings for the 90-second video.

Uses Kokoro-82M (Apache 2.0) through the kokoro-onnx package, which runs offline on a CPU.

    pip install kokoro-onnx soundfile numpy
    # model files (about 350 MB) from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
    python make_narration.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin

Outputs (next to this script):
    build/narration.wav      exactly TOTAL seconds, 24 kHz mono
    build/timeline.json      start/end of every sentence (seconds), used by render.html and for captions
"""
import argparse, json, os
import numpy as np
import soundfile as sf

TOTAL = 90.0          # final length in seconds
LEAD_IN = 0.7         # silence before the first word
GAP = 0.32            # pause between sentences
SCENE_GAP = 0.65      # pause between scenes

# espeak's default guesses for these names are off, so the phonemes are corrected before synthesis
PHONEME_FIXES = {
    'mˈɔɪvɚ': 'mwˈɑːv',            # de Moivre
    'lˈæpleɪs': 'ləplˈɑːs',         # Laplace
    'lˈaɪɐpˌʌnɑːv': 'ljˈɑːpʊnˌɔːf',  # Lyapunov
    'pˈɑːlɪə': 'pˈoʊljə',           # Polya
    'ɐ bˈiː': 'ˈeɪ bˈiː',           # A/B
}

here = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='kokoro-v1.0.onnx')
    ap.add_argument('--voices', default='voices-v1.0.bin')
    ap.add_argument('--speed', type=float, default=None)
    args = ap.parse_args()

    from kokoro_onnx import Kokoro
    script = json.load(open(os.path.join(here, 'script.json'), encoding='utf-8'))
    speed = args.speed or script.get('speed', 1.0)
    k = Kokoro(args.model, args.voices)

    clips, sr = [], 24000
    for s in script['sentences']:
        ph = k.tokenizer.phonemize(s['tts'], 'en-us')
        for a, b in PHONEME_FIXES.items():
            ph = ph.replace(a, b)
        audio, sr = k.create(ph, voice=script['voice'], speed=speed, lang='en-us', is_phonemes=True)
        audio = trim(np.asarray(audio, dtype=np.float32), sr)
        clips.append(audio)

    timeline, t = [], LEAD_IN
    pieces = [np.zeros(int(LEAD_IN * sr), np.float32)]
    for i, (s, a) in enumerate(zip(script['sentences'], clips)):
        if i > 0:
            gap = SCENE_GAP if s['scene'] != script['sentences'][i - 1]['scene'] else GAP
            pieces.append(np.zeros(int(gap * sr), np.float32))
            t += gap
        dur = len(a) / sr
        timeline.append({**s, 'start': round(t, 3), 'end': round(t + dur, 3)})
        pieces.append(a)
        t += dur
    speech_end = t
    total_samples = int(TOTAL * sr)
    track = np.concatenate(pieces)
    if len(track) > total_samples:
        raise SystemExit(f'Narration is {len(track)/sr:.2f}s, longer than {TOTAL}s. Shorten the script or raise --speed.')
    track = np.concatenate([track, np.zeros(total_samples - len(track), np.float32)])
    peak = np.max(np.abs(track)) or 1.0
    track = track / peak * 0.89

    os.makedirs(os.path.join(here, 'build'), exist_ok=True)
    sf.write(os.path.join(here, 'build', 'narration.wav'), track, sr, subtype='PCM_16')
    json.dump({'total': TOTAL, 'speechEnd': round(speech_end, 3), 'scenes': script['scenes'], 'sentences': timeline},
              open(os.path.join(here, 'build', 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'speech ends at {speech_end:.2f}s of {TOTAL}s (speed {speed})')


def trim(a, sr, thresh=0.01):
    """Cut leading/trailing near-silence so the gaps between sentences are controlled here."""
    idx = np.where(np.abs(a) > thresh)[0]
    if not len(idx):
        return a
    lo = max(0, idx[0] - int(0.03 * sr))
    hi = min(len(a), idx[-1] + int(0.08 * sr))
    return a[lo:hi]


if __name__ == '__main__':
    main()
