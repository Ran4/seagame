import json
import random
import re

import httpx

from .config import SHANTIES_DIR, Config

TITLES_PROMPT = """\
Generate a JSON array of 40 original sea shanty song titles (pirate/sailor theme).
Each title should be a short snake_case slug (e.g. "drunken_sailor", "randy_dandy_o").
Be creative and varied — avoid repeating patterns or starting many titles the same way.

Respond in JSON: {"titles": ["title_1", "title_2", ...]}
"""

LYRICS_PROMPT = """\
Write lyrics for a sea shanty called "{title}".
It should take about 30 seconds to sing aloud.
Keep it to 1 verse and 1 chorus, roughly 6-10 lines total.

Respond in JSON: {{"lyrics": "..."}}
The lyrics should be plain text with newlines between lines.
"""


def existing_shanty_titles() -> list[str]:
    if not SHANTIES_DIR.exists():
        return []
    return [d.name for d in SHANTIES_DIR.iterdir() if d.is_dir()]


def generate_title(config: Config, avoid_titles: list[str]) -> str:
    """Generate 40 titles, randomly pick one from the last 10 (least generic)."""
    avoid = ""
    if avoid_titles:
        avoid = f"\n\nDo NOT use any of these titles (already taken): {', '.join(avoid_titles)}"
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"},
        json={
            "model": "gpt-5.4",
            "messages": [{"role": "user", "content": TITLES_PROMPT + avoid}],
            "response_format": {"type": "json_object"},
            "temperature": 1.5,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = json.loads(resp.json()["choices"][0]["message"]["content"])
    titles = data["titles"]
    # Pick randomly from the last 10 (least obvious)
    candidates = titles[-10:]
    candidates = [t for t in candidates if t not in avoid_titles]
    if not candidates:
        candidates = [t for t in titles if t not in avoid_titles]
    title = random.choice(candidates)
    title = re.sub(r"[^a-z0-9_]", "_", title.lower())
    title = re.sub(r"_+", "_", title).strip("_")
    return title


def generate_lyrics(config: Config, title: str) -> str:
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"},
        json={
            "model": "gpt-5.4",
            "messages": [{"role": "user", "content": LYRICS_PROMPT.format(title=title)}],
            "response_format": {"type": "json_object"},
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = json.loads(resp.json()["choices"][0]["message"]["content"])
    return data["lyrics"]
