# Recreating the 90-second video

The video is generated entirely from code, so every frame and every word can be edited and rebuilt.

| File | Role |
|---|---|
| `script.json` | The narration, sentence by sentence. `text` is what appears in captions; `tts` is what the voice reads (years spelled out, A/B written as "A B"). `cues` mark words that trigger animations. |
| `make_narration.py` | Synthesises each sentence with Kokoro-82M, joins them with fixed pauses, pads the track to exactly 90.000 s and writes `build/narration.wav` plus `build/timeline.json` (start and end of every sentence). |
| `render.html` | Draws any frame of the video on a 1280×720 canvas with `renderFrame(t)`. Open it in a browser (served from the repository root) and drag the slider to scrub through the animation. |
| `make_captions.py` | Writes the WebVTT captions from `build/timeline.json`. |
| `render.mjs` | Captures all 2,700 frames (30 fps × 90 s) with a headless Chromium and pipes them to ffmpeg. |

## Steps

Requirements: Python 3.10+, Node 18+, ffmpeg, and Playwright with Chromium (`npm i playwright && npx playwright install chromium`).

```bash
# 1. narration (downloads ~350 MB of model files once)
pip install kokoro-onnx soundfile numpy
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
python3 video-source/make_narration.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin

# 2. frames (serve the repository root so the fonts resolve)
python3 -m http.server 8765 &
node video-source/render.mjs                     # writes video-source/build/frames.mp4
node video-source/render.mjs --preview 5,30,60   # optional: PNG stills for checking

# 3. combine picture and sound, exactly 90 s
ffmpeg -y -i video-source/build/frames.mp4 -i video-source/build/narration.wav \
  -map 0:v -map 1:a -c:v libx264 -preset veryfast -tune animation -crf 27 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -t 90 -movflags +faststart video/clt-explained-90s.mp4

ffmpeg -y -i video-source/build/narration.wav -c:a libmp3lame -b:a 128k video/clt-narration.mp3
```

Captions come from the same timings: `python3 video-source/make_captions.py` rewrites `video/clt-captions.vtt`. The timestamped table in `video/narration-script.md` lists the same start and end times.

## Editing tips

- Change wording in `script.json`, rerun step 1, then steps 2 and 3. If the narration grows past 90 s, `make_narration.py` stops and tells you; shorten a sentence or pass `--speed 1.1`.
- The animation follows the sentence timings automatically, so small wording changes need no edits to `render.html`.
- To use a different voice, change `voice` in `script.json` (for example `bf_emma` or `am_michael`; Kokoro ships about 50 voices).
- Mispronounced names are fixed through the `PHONEME_FIXES` table in `make_narration.py`.
