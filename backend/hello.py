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
