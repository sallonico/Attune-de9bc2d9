## Duke AI Gateway

This project calls Duke's AI Gateway (a LiteLLM proxy), which is OpenAI-compatible.

In this repo: the key lives in `backend/.env` (`LITELLM_TOKEN`, `LITELLM_MODEL`), the
backend virtualenv is `backend/.venv`, and a working example is `backend/hello.py`
(run it from the `backend/` folder so it finds `.env`).

**How to make calls**
- Base URL: https://litellm.oit.duke.edu/v1
- API key: read from the `LITELLM_TOKEN` environment variable (in .env, never committed)
- SDK: the OpenAI Python SDK (`from openai import OpenAI`)
- Use `client.chat.completions.create(...)` — it works across ALL Gateway models
  (the Responses API only works for OpenAI models).

**Models & cost (USD per 1M tokens)** — run `/v1/models` for the full live list

| Model id           | Input | Output | When to use |
|--------------------|-------|--------|-------------|
| Mistral on-site    | FREE  | FREE   | Default. Bulk / structured work / learning. |
| gpt-5-nano         | $0.05 | $0.40  | Cheapest GPT-5. |
| GPT 4.1 Nano       | $0.10 | $0.40  | Cheapest GPT-4 class. |
| gpt-5-mini         | $0.25 | $2.00  | Best value for chat / reasoning. |
| Llama 4 Maverick   | $0.35 | $1.41  | Open source. |
| GPT 4.1 Mini       | $0.40 | $1.60  | Budget cloud. |
| Llama 3.3          | $0.71 | $0.71  | Open source. |
| gpt-5 / gpt-5-chat | $1.25 | $10.00 | Premium. |
| GPT 4.1            | $2.00 | $8.00  | Strong all-around. |

Model ids are case- and space-sensitive (e.g. "Mistral on-site", "GPT 4.1 Nano").
Newer models also exist (gpt-5.2, gpt-5.4, gpt-oss-120b, o4 Mini, embeddings, whisper).

**Rules**
- Students get ~$1/day of API usage. Default to the free "Mistral on-site" (it doesn't count
  against the budget); use "gpt-5-nano" as the cheap cloud backup; reserve pricier models for
  when quality genuinely requires it.
- Never hardcode or commit the API key. It lives in .env (gitignored).
