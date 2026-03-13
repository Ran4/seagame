"""Generate a sea shanty using OpenAI (lyrics via gpt-5.4, vocals via gpt-audio).

Records each line separately with 4 voices (2 male, 2 female), time-stretches
per-line to keep voices in sync, then assembles full tracks + a mixed preview.

Usage:
  cd scripts && uv run -m generate_sea_shanty                                    # full generation
  cd scripts && uv run -m generate_sea_shanty --only-text                        # lyrics + meta only
  cd scripts && uv run -m generate_sea_shanty --only-text --output-type stdout   # title + lyrics to stdout
"""

import argparse
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from .audio import (
    concat_audio,
    generate_line_audio,
    generate_silence,
    get_duration,
    mix_tracks,
    time_stretch,
)
from .config import PAUSE_SECONDS, SHANTIES_DIR, VOICES, Config
from .lyrics import existing_shanty_titles, generate_lyrics, generate_title


def parse_args():
    parser = argparse.ArgumentParser(description="Generate a sea shanty")
    parser.add_argument("--only-text", action="store_true",
                        help="Generate lyrics + meta only, no audio")
    parser.add_argument("--output-type", choices=["folder", "stdout"], default="folder",
                        help="Output destination: folder (default) saves files, stdout prints title + lyrics")
    args = parser.parse_args()
    if args.output_type == "stdout" and not args.only_text:
        parser.error("--output-type stdout requires --only-text")
    return args


def main():
    args = parse_args()
    config = Config()  # pyright: ignore # noqa

    existing = existing_shanty_titles()
    quiet = args.output_type == "stdout"

    if not quiet:
        print("Generating title...")
    title = generate_title(config, existing)
    if title in existing:
        print(f"Failed to generate a unique title (got \"{title}\").", file=sys.stderr)
        return

    if not quiet:
        print(f"  Title: {title}")
        print("Generating lyrics...")
    lyrics = generate_lyrics(config, title)

    if quiet:
        print(f"{title}\n\n{lyrics}")
        return

    print(f"  Lyrics:\n{lyrics}\n")

    song_dir = SHANTIES_DIR / title
    song_dir.mkdir(parents=True, exist_ok=True)

    lyrics_path = song_dir / f"{title}__lyrics.txt"
    lyrics_path.write_text(lyrics)

    # Save metadata
    voice_list = ", ".join(f"{k}={v}" for k, v in VOICES.items())
    meta_path = song_dir / f"{title}__meta.md"
    meta_path.write_text(
        f"# {title}\n\n"
        f"- **Generated**: {date.today()}\n"
        f"- **Lyrics**: OpenAI gpt-5.4\n"
        f"- **Vocals**: OpenAI gpt-audio ({voice_list})\n"
        f"- **Method**: line-by-line recording, per-line time-stretch to fastest\n"
    )

    if args.only_text:
        print(f"  Saved: {lyrics_path.name}")
        print(f"  Saved: {meta_path.name}")
        print("Done! (text only, no audio)")
        return

    tmp = song_dir / "_tmp"
    tmp.mkdir(exist_ok=True)

    lines = lyrics.split("\n")

    voice_lines: dict[str, list[Path]] = {vn: [] for vn in VOICES}
    mixed_lines: list[Path] = []

    for i, line in enumerate(lines):
        if not line.strip():
            silence = tmp / f"line_{i:02d}_silence.mp3"
            generate_silence(silence, PAUSE_SECONDS)
            mixed_lines.append(silence)
            for vn in VOICES:
                voice_lines[vn].append(silence)
            print(f"  Line {i}: [pause {PAUSE_SECONDS}s]")
            continue

        print(f'  Line {i}: "{line}"')

        raw: dict[str, Path] = {}

        def gen(vn: str, vid: str, idx: int = i, text: str = line):
            audio = generate_line_audio(config, vid, text)
            p = tmp / f"line_{idx:02d}_{vn}_raw.mp3"
            p.write_bytes(audio)
            return vn, p

        with ThreadPoolExecutor(max_workers=4) as pool:
            for vn, p in pool.map(lambda kv: gen(kv[0], kv[1]), VOICES.items()):
                raw[vn] = p

        durs = {vn: get_duration(p) for vn, p in raw.items()}
        target = min(durs.values())  # fastest voice sets the pace
        dur_str = " ".join(f"{vn}={d:.1f}s" for vn, d in durs.items())
        print(f"    Durations: {dur_str} → target={target:.1f}s")

        stretched: dict[str, Path] = {}
        for vn, raw_path in raw.items():
            s_path = tmp / f"line_{i:02d}_{vn}.mp3"
            tempo = durs[vn] / target
            # Skip stretching if within 1% — avoids artifacts for negligible difference
            if abs(tempo - 1.0) < 0.01:
                s_path.write_bytes(raw_path.read_bytes())
            else:
                time_stretch(raw_path, s_path, tempo)
            stretched[vn] = s_path
            voice_lines[vn].append(s_path)

        mixed_path = tmp / f"line_{i:02d}_mixed.mp3"
        mix_tracks(list(stretched.values()), mixed_path)
        mixed_lines.append(mixed_path)

    print("\nAssembling tracks...")

    mixed_out = song_dir / f"{title}__mixed.mp3"
    concat_audio(mixed_lines, mixed_out)
    dur = get_duration(mixed_out)
    print(f"  {mixed_out.name} ({dur:.1f}s)")

    for vn in VOICES:
        out = song_dir / f"{title}__{vn}.mp3"
        concat_audio(voice_lines[vn], out)
        dur = get_duration(out)
        print(f"  {out.name} ({dur:.1f}s)")

    shutil.rmtree(tmp)
    print("Done!")


if __name__ == "__main__":
    main()
