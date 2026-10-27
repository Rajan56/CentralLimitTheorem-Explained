# The Central Limit Theorem in 90 seconds: narration script

Total length: 1:30.0 (90.000 s). Narration voice: Kokoro-82M, voice `af_heart`, speed 1.06. No music.
Timestamps are measured from the generated narration track (`make_narration.py`), so they match the video exactly.

| Time | Scene | Narration | On screen |
|---|---|---|---|
| 0:00.7 to 0:06.0 | 1. What happens | Roll one die, and every number from one to six is equally likely. The picture is flat. | One die: six equal bars. Ten dice rolled, their averages pile into a histogram, a normal curve appears. |
| 0:06.3 to 0:10.5 | 1. What happens | Now roll ten dice, average them, and repeat that thousands of times. |  |
| 0:10.8 to 0:12.7 | 1. What happens | The averages pile up into a bell. |  |
| 0:13.3 to 0:15.1 | 2. The theorem | This is the Central Limit Theorem. | Title, four very different populations funnel into one bell; formula x̄ ≈ N(μ, σ/√n) with the bell narrowing as n grows. |
| 0:15.5 to 0:23.1 | 2. The theorem | Take many independent samples from almost any population with finite variance, and the sample means become approximately normal. |  |
| 0:23.4 to 0:29.5 | 2. The theorem | They centre on the true mean, μ, and their spread, the standard error, is σ divided by the square root of n. |  |
| 0:30.2 to 0:34.5 | 3. Why it works | Why does this happen? In an average, high and low values cancel each other out. | Six values on a number line merge into their average; two-dice combinations stack into a triangle; skewed waiting times vs. means for n = 2, 10, 50. |
| 0:34.8 to 0:38.9 | 3. Why it works | And there are far more combinations that land near the middle than at the edges. |  |
| 0:39.3 to 0:45.5 | 3. Why it works | Even strongly skewed data, like waiting times, are smoothed into a bell once the samples are large enough. |  |
| 0:46.1 to 0:48.1 | 4. How it was discovered | The idea took two centuries to build. | Timeline 1700 to 1950 with de Moivre (1733), Laplace (1810), Lyapunov (1901), Pólya (1920). |
| 0:48.4 to 1:00.6 | 4. How it was discovered | Abraham de Moivre found the bell in coin tosses in 1733. Laplace generalised it around 1810, Lyapunov proved it in 1901, and George Pólya named it in 1920. |  |
| 1:01.3 to 1:11.6 | 5. What it is used for | Today it sits underneath confidence intervals, hypothesis tests, opinion polls, clinical trials, A/B tests, and the control charts that keep factories on target. | Six tiles: confidence intervals, hypothesis tests, polls, clinical trials, A/B tests, control charts; then estimate ± 1.96·σ/√n and the poll example. |
| 1:11.9 to 1:17.4 | 5. What it is used for | Whenever research reports an average with a margin of error, this theorem is quietly doing the work. |  |
| 1:18.0 to 1:24.6 | 6. The fine print | Just remember the conditions: independent observations, finite variance, and bigger samples for skewed data. | Checklist of conditions, then the end card with the link to the interactive lab. |
| 1:24.9 to 1:28.0 | 6. The fine print | Now open the lab, and watch the bell appear for yourself. |  |

Speech ends at 1:28.0; the end card holds until 1:30.0.

## Pronunciation notes

The synthesiser receives a phonetic spelling for names it tends to misread: de Moivre ("de MWAHV"), Laplace ("la-PLAHSS"), Lyapunov ("LYAH-poo-noff"), Pólya ("POL-ya"), and A/B is read as "A B". Years are written out in words in the TTS text (for example "seventeen thirty-three").
