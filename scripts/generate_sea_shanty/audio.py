import base64
import subprocess
from pathlib import Path

import httpx

from .config import Config

LINE_PROMPT = (
    "Sing this single line from a sea shanty. "
    "Moderate, steady shanty tempo. "
    "Start singing immediately — no spoken intro, no preamble. "
    "Sing ONLY this one line, nothing else:\n\n"
)


def generate_line_audio(config: Config, voice: str, line: str) -> bytes:
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"},
        json={
            "model": "gpt-audio",
            "modalities": ["text", "audio"],
            "audio": {"voice": voice, "format": "mp3"},
            "messages": [{"role": "user", "content": f"{LINE_PROMPT}{line}"}],
        },
        timeout=60,
    )
    resp.raise_for_status()
    audio_b64 = resp.json()["choices"][0]["message"]["audio"]["data"]
    return base64.b64decode(audio_b64)


def get_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    return float(r.stdout.strip())


def time_stretch(src: Path, dst: Path, tempo: float):
    # atempo supports 0.5–2.0, chain for values outside that range
    filters = []
    t = tempo
    while t > 2.0:
        filters.append("atempo=2.0")
        t /= 2.0
    while t < 0.5:
        filters.append("atempo=0.5")
        t *= 2.0
    filters.append(f"atempo={t}")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-filter:a", ",".join(filters), str(dst)],
        capture_output=True,
    )


def generate_silence(dst: Path, duration: float):
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i",
         f"anullsrc=r=44100:cl=stereo", "-t", str(duration),
         "-c:a", "libmp3lame", str(dst)],
        capture_output=True,
    )


def mix_tracks(inputs: list[Path], dst: Path):
    args = []
    for p in inputs:
        args.extend(["-i", str(p)])
    subprocess.run(
        ["ffmpeg", "-y"] + args +
        ["-filter_complex", f"amix=inputs={len(inputs)}:duration=longest", str(dst)],
        capture_output=True,
    )


def concat_audio(inputs: list[Path], dst: Path):
    list_file = dst.parent / f"_concat_{dst.stem}.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in inputs))
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(list_file), "-c:a", "libmp3lame", "-q:a", "2", str(dst)],
        capture_output=True,
    )
    list_file.unlink()
