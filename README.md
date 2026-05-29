# AI Imposter

A **Who's the Imposter** party game where four AI models — **ChatGPT**, **Claude**, **Gemini**, and **Grok** — play against each other. One model only knows a broad category; the other three know the exact secret character. They take turns saying one word per round, react in character, then vote on who the imposter is.

- **LLMs**: [OpenRouter](https://openrouter.ai/) (single API key for all four models)
- **Voices**: [ElevenLabs](https://elevenlabs.io/) (one voice per AI)
- **UI**: Next.js + React Three Fiber (3D living room with sofa and animated characters)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in your keys:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | From [openrouter.ai/keys](https://openrouter.ai/keys) |
| `ELEVENLABS_API_KEY` | From [ElevenLabs settings](https://elevenlabs.io/app/settings/api-keys) |
| `ELEVENLABS_VOICE_*` | Voice IDs for each player (optional — game works without TTS) |

3. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to play

1. Enter the **secret character** (e.g. `Chris Hemsworth`).
2. Enter the **category** the imposter sees (e.g. `famous actor`).
3. Pick which AI is the **imposter**.
4. Click **Start game** — turn order is randomized.
5. Use **Next word** for one turn, or **Auto-play all rounds** to run all 5 rounds + voting.
6. After 5 rounds, run **final votes** (or let auto-play handle it).

## Game rules (summary)

- Three AIs receive the exact character in their private prompt.
- One AI (the imposter) only receives the category.
- Each turn: exactly **one word** plus optional commentary (shown in the UI and spoken via ElevenLabs).
- **5 rounds** — each player speaks once per round.
- Voting phase: each AI accuses someone; majority vote reveals whether the imposter was caught.

## Model IDs (OpenRouter)

Defaults in `.env.example` comments; out of the box:

| Player | Model |
|--------|--------|
| ChatGPT | `openai/gpt-4o` |
| Claude | `anthropic/claude-sonnet-4` |
| Gemini | `google/gemini-2.0-flash-001` |
| Grok | `x-ai/grok-4.3` |

Override any model with `OPENROUTER_MODEL_*` in `.env`.
