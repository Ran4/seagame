from pathlib import Path

from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SHANTIES_DIR = PROJECT_ROOT / "public" / "audio" / "shanties"

VOICES = {
    "male_1": "ballad",
    "male_2": "ash",
    "female_1": "shimmer",
    "female_2": "coral",
}

PAUSE_SECONDS = 0.8


class Config(BaseSettings):
    OPENAI_API_KEY: str
    ELEVENLABS_API_KEY: str = ""

    model_config = {"env_file": PROJECT_ROOT / ".env"}
