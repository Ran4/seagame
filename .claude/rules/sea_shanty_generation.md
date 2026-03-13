## Sea shanty generation

Package: `scripts/generate_sea_shanty/` (3 modules + `__main__.py`)
Dependencies: `scripts/pyproject.toml` (shared by all Python scripts)

```
scripts/generate_sea_shanty/
    __main__.py   — CLI + orchestration
    config.py     — Config, constants, paths, voices
    lyrics.py     — title + lyrics generation (OpenAI)
    audio.py      — voice recording + ffmpeg helpers
```

### Usage

```bash
cd scripts && uv run -m generate_sea_shanty                                    # full generation (lyrics + audio)
cd scripts && uv run -m generate_sea_shanty --only-text                        # lyrics + meta only, no audio
cd scripts && uv run -m generate_sea_shanty --only-text --output-type stdout   # title + lyrics to stdout
```

### What it does

Each run generates one new sea shanty:

1. **Title** — gpt-5.4 (temperature 1.5) generates 40 titles, randomly picks one from the last 10 (least generic). Existing folder names are excluded.
2. **Lyrics** — gpt-5.4 writes lyrics for the chosen title (~30s when sung, 1 verse + 1 chorus)
3. **Vocals** — gpt-audio, 4 voices (2 male, 2 female), recorded **line by line**
4. **Time-stretch** — per-line, all 4 recordings stretched to match the fastest voice (ffmpeg atempo)
5. **Assembly** — concatenate lines into full per-voice tracks + a mixed preview

### Output structure

```
public/audio/shanties/
    powderwake/
        powderwake__male_1.mp3      (voice: ballad)
        powderwake__male_2.mp3      (voice: ash)
        powderwake__female_1.mp3    (voice: shimmer)
        powderwake__female_2.mp3    (voice: coral)
        powderwake__mixed.mp3       (all 4 voices mixed together)
        powderwake__lyrics.txt
        powderwake__meta.md
```

### Voices

| Track       | OpenAI voice | Gender |
|-------------|-------------|--------|
| `male_1`    | ballad      | male   |
| `male_2`    | ash         | male   |
| `female_1`  | shimmer     | female |
| `female_2`  | coral       | female |

### Key design decisions

- **Two-step title generation**: Generating title+lyrics in one shot produces repetitive titles (gpt-5.4 fixates on "salt_and_*"). Generating 40 titles first with high temperature, then picking from the tail, gives much better variety.
- **Line-by-line recording**: Each lyric line is generated separately per voice, then time-stretched to match. This keeps voices in sync (whole-song recording drifts badly).
- **Fastest voice sets the pace**: `target = min(durations)` per line. Stretching speeds up slower voices rather than slowing down fast ones.
- **1% stretch threshold**: Skip stretching if within 1% of target to avoid artifacts.
- **0.8s pause** for empty lines (verse/chorus break).
- **Parallel generation**: All 4 voices for a line are generated concurrently (ThreadPoolExecutor).

### In-game playback (TODO)

Individual per-voice tracks exist so the game can dynamically layer them based on crew composition:
- Count male/female crew → pick matching tracks
- Play each with a small random offset (50-200ms) for natural feel
- More crew = more voices layered in

### Config

Reads `OPENAI_API_KEY` from `.env` via pydantic-settings. `ELEVENLABS_API_KEY` is in config but currently unused (ElevenLabs TTS can't sing — we use OpenAI gpt-audio instead).
