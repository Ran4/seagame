Sprites require `OPENAI_API_KEY` in `.env`. SFX supports three backends per sound (see `generate-sfx.mjs`).
ElevenLabs sounds require `ELEVENLABS_API_KEY` in `.env`. Scripts skip already-existing files.
```
node scripts/generate-sprites.mjs   # pixel art tiles + crew
node scripts/generate-music.mjs     # shanty.wav
node scripts/generate-sfx.mjs       # SFX (procedural → sfx/, elevenlabs → elevenlabs-generated/)
```
Delete a file and rerun to regenerate just that one.
