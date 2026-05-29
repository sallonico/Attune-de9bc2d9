# Duke AI Gateway — Beginner Setup Guide

> **You are Claude Code, helping a Duke University student set up Python access to
> the Duke AI Gateway.** The student is a beginner who may have never used a
> terminal, Python, or git. Work through the steps below **in order**. Before each
> command, tell them in one plain sentence what it does and what they should expect
> to see. Check before you assume anything is installed.
>
> **Adapt to where you are run.** The student may be in an empty folder OR — more
> commonly — adding Gateway access to an **existing project**. Detect which in Step 0
> and **merge into existing files** (`.env`, `.gitignore`, dependencies, `CLAUDE.md`)
> rather than overwriting or recreating them. You are **not done** until Step 6
> succeeds with a real model reply on their screen.
>
> **Go one step at a time.** This guide has explicit "⏸ Pause" gates between steps. At each one,
> briefly recap what just happened, then **ask the student for explicit permission before starting
> the next step** and wait for their "yes." Don't run several steps back-to-back.

The Duke AI Gateway is an OpenAI-compatible proxy (LiteLLM) at
`https://litellm.oit.duke.edu`. Once set up, the student can call dozens of models —
including a **free, on-prem Mistral** — from their own Python code.

---

## Step 0 — Make sure a folder is open, then detect the context

**Do this before anything else.** If the student opened a brand-new VS Code window with *no folder*
open, then creating a folder later and opening it will **reload VS Code and end this chat**, losing
all progress. Handle it up front, while there's nothing to lose.

1. Check where you are: run `pwd`. If it returns the home directory (e.g. `/Users/<name>`,
   `/home/<name>`, or `C:\Users\<name>`) and the VS Code Explorer (left sidebar) shows no open
   folder, treat this as **no folder open** → go to step 2. Otherwise a folder is open → skip to step 3.
2. **No folder open — create and open one first:**
   - Create a project folder with the student (or use a default): `mkdir -p ~/duke-ai`
   - Have them open it now: **File → Open Folder → pick that folder** (or run `code ~/duke-ai`).
   - ⚠️ **Warn them first:** opening a folder reloads VS Code and **ends this chat session** — that's
     expected and fine. Once it reopens, they should start Claude Code again and **paste the same
     setup prompt** to continue; you'll resume right here, now safely inside the folder.
   - Stop and wait until they're back, working inside the opened folder.
3. Note the operating system (macOS, Windows, or Linux) and adjust commands accordingly.
4. Look at the folder (`ls -a`, check for `.git`) and decide which situation you're in:
   - **Existing project** (the common case) — there are already source files and/or a
     `.git`, `pyproject.toml`, `requirements.txt`, `package.json`, `.env`, or a virtual
     environment. **Work inside this project and merge into what's already there — never
     overwrite or recreate files that exist.**
   - **Fresh start** — the folder is open but empty / has no project yet. Build from scratch.
5. Take a quick inventory and tell the student what you found, so later steps can adapt:
   - Dependency setup: a `pyproject.toml` (uv/poetry), `requirements.txt`, `Pipfile`, or `environment.yml`?
   - An existing virtual environment (`.venv/`, `venv/`) or an active conda env?
   - Existing `.env`, `.env.example`, `.gitignore`, and `CLAUDE.md` files?
   - Is `python-dotenv` (or another env loader) already a dependency?

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 1 — Get a Duke AI Gateway API key

Walk the student through this in their **web browser** (they need their Duke NetID):

1. Go to **https://dashboard.ai.duke.edu/** and log in with their NetID.
2. Open the **API Gateway** tab.
3. Click to **create a new API key**. **Leave the fund code blank** — that gives a
   token with a daily usage limit, which is plenty for learning. (If they later hit
   the limit, they can request a key with a fund code.)
4. **Copy the key now** and keep it private — it looks like `sk-...`. Treat it like a
   password: never paste it into a chat, a screenshot, or any file that gets committed.

Direct link to keys: **https://dashboard.ai.duke.edu/api-keys** · FAQ: **https://dashboard.ai.duke.edu/faq**

> Do **not** ask the student to paste the key to you in chat. They'll put it in a
> `.env` file themselves in Step 3.

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 2 — Get the dependencies into the project's environment

The only packages needed are **`openai`** and **`python-dotenv`** (skip
`python-dotenv` if the project already loads `.env` another way).

**First, reuse what the project already has** (from your Step 0 inventory):

- **uv-managed project** (`pyproject.toml` + `uv.lock`): `uv add openai python-dotenv`
- **`requirements.txt`**: add `openai` and `python-dotenv` as new lines (if not already
  listed), then install into the project's environment: `pip install openai python-dotenv`
- **Existing virtualenv (`.venv`/`venv`) or conda env**: activate it first, then `pip install openai python-dotenv`
- **Poetry / Pipenv**: `poetry add openai python-dotenv` or `pipenv install openai python-dotenv`

> Do **not** run `uv init` or create a second virtual environment inside a project that already has one.

**Only if the folder has no environment yet** (fresh start), pick the simplest path:

1. Check for **uv** (a fast, all-in-one Python tool): `uv --version`.
   - **If uv is installed**, use it — it can install Python itself if needed:
     ```bash
     uv init .              # only if there's no pyproject.toml yet
     uv add openai python-dotenv
     ```
   - **If uv is NOT installed**, check for Python 3: `python3 --version` (Windows: `python --version`).
     - **If Python 3.9+ is present**, create and activate a virtual environment, then install with pip:
       ```bash
       python3 -m venv .venv
       source .venv/bin/activate        # macOS/Linux
       # .venv\Scripts\activate         # Windows PowerShell
       pip install openai python-dotenv
       ```
     - **If neither uv nor Python is installed**, install **uv** (it bundles Python management),
       then return to the uv path above:
       - macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
       - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`

Tell the student which environment you used and how to activate/run it later.

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 3 — Store the API key safely (merge, don't overwrite)

**`.env`:**
- If a `.env` **already exists**, first check it doesn't already define `LITELLM_TOKEN`, then
  **append** the lines below. **Do not rewrite the file or touch existing variables.**
- If there's no `.env`, create one.

Either way it should contain these two lines (real key after `=`; no quotes, and no spaces around the `=`):
```
LITELLM_TOKEN=sk-paste-the-students-key-here
LITELLM_MODEL=Mistral on-site
```
The `LITELLM_MODEL` line pins the free default, so the script uses it unless the student deliberately changes it.
Have the **student** paste their own key, or use an editor — don't print the full key back to them.

**`.gitignore`:**
- If one exists, make sure `.env` is listed; **append** it if missing (don't remove existing entries).
- If there's none, create it with:
  ```
  .env
  .venv/
  __pycache__/
  *.pyc
  ```
- Then confirm: `git status` must **not** show `.env`. If `.env` was *already tracked* in this
  repo, warn the student and run `git rm --cached .env` so the key isn't committed.

**`.env.example`** (safe to commit): if one exists, add a `LITELLM_TOKEN=` line (and the optional
`LITELLM_MODEL` comment); otherwise create it:
```
# Your Duke AI Gateway API key. Get one at https://dashboard.ai.duke.edu/api-keys
# Paste the key after the = with no quotes and no spaces.
LITELLM_TOKEN=

# Which model to use. The free "Mistral on-site" is the recommended default;
# switch to a cheap cloud backup like gpt-5-nano only if you need it.
LITELLM_MODEL=Mistral on-site
```

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 4 — Add a quick test script (without clobbering anything)

Create a small script to prove the connection works. **Don't overwrite an existing file** — if
`hello.py` is already taken, name it `gateway_hello.py` (or put it in a `scratch/`/`examples/`
folder). Use exactly this content:

```python
#!/usr/bin/env python3
"""Minimal hello-world for the Duke AI Gateway.

Reads your API key from a .env file (LITELLM_TOKEN), sends one prompt to the
Gateway, and prints the reply.

    python hello.py
    python hello.py "explain photosynthesis in one sentence"
"""
import os
import sys

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()  # reads the .env file in this folder

token = os.getenv("LITELLM_TOKEN")
if not token:
    sys.exit(
        "No API key found. Create a .env file in this folder containing:\n"
        "    LITELLM_TOKEN=sk-...\n"
        "Get a key at https://dashboard.ai.duke.edu/api-keys"
    )

# Free, on-prem model — a great default that never touches your $1/day budget.
# Set LITELLM_MODEL in .env to switch (e.g. "gpt-5-nano" as a near-free backup,
# or "gpt-5-mini" for higher-quality chat).
MODEL = os.getenv("LITELLM_MODEL", "Mistral on-site")

client = OpenAI(api_key=token, base_url="https://litellm.oit.duke.edu/v1")

prompt = sys.argv[1] if len(sys.argv) > 1 else \
    "Say hello and tell me one fun fact about Duke University."

response = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": prompt}],
)

print(response.choices[0].message.content)
```

> **Adding Gateway calls to existing code instead?** The key lines are the same anywhere:
> ```python
> from openai import OpenAI
> client = OpenAI(api_key=os.environ["LITELLM_TOKEN"],
>                 base_url="https://litellm.oit.duke.edu/v1")
> resp = client.chat.completions.create(
>     model="Mistral on-site",
>     messages=[{"role": "user", "content": "..."}])
> ```
> Offer to wire this into the file the student actually wants to call the Gateway from.

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 5 — Explore the models and understand the budget

List the models the key can use so the student sees their options:

```python
python -c "import os; from dotenv import load_dotenv; from openai import OpenAI; load_dotenv(); \
print('\n'.join(sorted(m.id for m in OpenAI(api_key=os.environ['LITELLM_TOKEN'], \
base_url='https://litellm.oit.duke.edu/v1').models.list().data)))"
```

(With uv, prefix with `uv run`.) Model ids are **case- and space-sensitive** — e.g.
`Mistral on-site`, `GPT 4.1 Nano`, `gpt-5-mini`.

Now **explain the pricing and budget to the student** in plain language:
- Models bill per **token** (roughly word-pieces), with separate **input** (what you send) and
  **output** (what the model writes back) rates — see the cheat-sheet below.
- **Students get about $1 of API usage per day.** That's plenty for lots of calls, but the
  premium models can burn through it quickly, so choose deliberately.
- **Default → `Mistral on-site`: it's completely free** (runs on Duke's own hardware), so it
  never touches the $1 budget. Best for learning, bulk, and structured tasks.
- **Backup → `gpt-5-nano`:** when a cloud model is needed, it's the cheapest ($0.05 in /
  $0.40 out per 1M tokens), so $1/day stretches a very long way.
- Reach for pricier models (`gpt-5-mini`, `GPT 4.1`, …) only when quality genuinely needs it.

Confirm the test script is set to the free default (`Mistral on-site`) and show the student how to
switch models later by setting `LITELLM_MODEL` in `.env`.

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 6 — Run it and confirm a real reply (the success gate)

Run the test script you created, using the environment from Step 2:
- **uv project:** `uv run python hello.py`
- **venv / conda:** `python hello.py` (with the environment activated)

(Use whatever filename you chose — e.g. `gateway_hello.py`.)

**You are done only when the model's actual reply prints on screen.** Show it to the
student and congratulate them.

If it errors, go to **Troubleshooting** below, fix it, and re-run.

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 7 — Record the setup in CLAUDE.md

So any future Claude Code session in this project already understands the Gateway:
- **If a `CLAUDE.md` already exists, append** the section below (don't overwrite the student's notes).
- If there's none, create `CLAUDE.md` with it.

```markdown
## Duke AI Gateway

This project calls Duke's AI Gateway (a LiteLLM proxy), which is OpenAI-compatible.

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
```

---

> **⏸ Pause.** Recap what just happened in a sentence or two, then ask the student for explicit
> permission to continue and **wait for their reply before starting this step.**

## Step 8 — Encourage the student to keep exploring

The student is set up — now invite them to keep going, with you as their tutor. Suggest a few
**questions they can ask you (Claude Code)** to keep learning. **Do not suggest terminal commands
for them to type or run — only conversational questions for you to answer or act on.** For example:
- "Please explain to me everything that was just accomplished."
- "Given the current project context, how could I use the LiteLLM API to improve the product I'm building?"
- "Show me how to send my own prompt and print the model's answer."
- "How do I switch to a different model, and how much would it cost?"
- "How can I check how much of my $1 daily budget I've used so far?"

Answer in plain, beginner-friendly language, and offer to help them write their first real call
in their own project.

---

## Model & cost cheat-sheet (for the student)

**You get about $1 of API usage per day.** Free is your friend:
- **Default to `Mistral on-site`** — it's free and never touches your budget (learning, bulk, structured tasks).
- **Backup: `gpt-5-nano`** — the cheapest cloud model when you need one.
- Reach for **`gpt-5-mini`** or **`GPT 4.1`** only when quality genuinely requires it.

| Model id           | Input | Output | When to use |
|--------------------|-------|--------|-------------|
| `Mistral on-site`  | FREE  | FREE   | Default. Bulk / structured / learning. |
| `gpt-5-nano`       | $0.05 | $0.40  | Cheapest GPT-5. |
| `GPT 4.1 Nano`     | $0.10 | $0.40  | Cheapest GPT-4 class. |
| `gpt-5-mini`       | $0.25 | $2.00  | Best value for chat / reasoning. |
| `Llama 4 Maverick` | $0.35 | $1.41  | Open source. |
| `GPT 4.1 Mini`     | $0.40 | $1.60  | Budget cloud. |
| `Llama 3.3`        | $0.71 | $0.71  | Open source. |
| `gpt-5`/`gpt-5-chat`| $1.25| $10.00 | Premium. |
| `GPT 4.1`          | $2.00 | $8.00  | Strong all-around. |

To change the model, set `LITELLM_MODEL` in `.env`, e.g. `LITELLM_MODEL=gpt-5-mini`.

---

## Troubleshooting

| Symptom | Likely cause & fix |
|---------|--------------------|
| `401` / `AuthenticationError` | Key is wrong, expired, or has extra spaces/quotes in `.env`. Re-copy it from https://dashboard.ai.duke.edu/api-keys and make the line exactly `LITELLM_TOKEN=sk-...`. |
| `No API key found` | `.env` is missing, in the wrong folder, or empty. It must sit in the same folder you run the script from. |
| `NotFoundError` / "model not found" | The model id is mistyped — they're case- and space-sensitive. Run Step 5 and copy an exact id. |
| `ModuleNotFoundError: openai` / `dotenv` | Dependencies didn't install, or the venv isn't active. Re-run the install from Step 2 (and `source .venv/bin/activate` for the pip path). |
| Connection / timeout errors | Some Duke services require being **on campus network or the Duke VPN**. Connect and retry. |
| `python: command not found` | Use `python3` (macOS/Linux) or the `uv run python ...` form. |

---

## Where to go next

- **Duke's official quickstart & more examples:** https://gitlab.oit.duke.edu/ai-tech/aigateway-quickstart
- **Full API reference (Swagger):** open https://litellm.oit.duke.edu/ or https://litellm-api.up.railway.app
- **Dashboard & budget:** https://dashboard.ai.duke.edu/ · **FAQ:** https://dashboard.ai.duke.edu/faq
- **OpenAI Python SDK docs:** https://github.com/openai/openai-python
