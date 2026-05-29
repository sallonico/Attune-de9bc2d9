"""AI medication-timing suggestions — FREE by default.

Pipeline (all free, no API key, no budget impact):

  RxNorm/RxNav   -> normalize the drug name to a canonical name + rxcui
  OpenFDA label  -> fetch the real "dosage & administration" text
  rule extractor -> derive a time-of-day window + a reason QUOTED from that text

Three tiers, confidence-gated, and it NEVER surfaces an ungrounded "why":

  Tier 1 — grounded:   a timing phrase is found in the label -> window + a reason
                       that is a sentence taken from the label. confidence high.
  Tier 2 — partial:    only food guidance found -> default morning, reason quotes
                       the food sentence, confidence medium.
  Tier 3 — manual:     nothing usable -> window "morning", needsManual=True, no
                       reason. The UI drops to a plain time picker.

Every tier degrades gracefully and never blocks onboarding.

Optional LLM (OFF by default): if ``settings.DRUG_AI_ENABLED`` is true AND a
Duke Gateway token is set, the LLM is used to summarize the label (grounded) and,
as a last resort before manual, to suggest a bare window with NO reason. This
costs money on the Duke Gateway unless your key has the free "Mistral on-site",
so it stays disabled for the free prototype.

Future hook: true drug-drug interaction checking is intentionally absent — the
free NLM RxNav Drug Interaction API was discontinued in Jan 2024, so for the
single-medication scope there is no quality free source to wire in here.
"""
from __future__ import annotations

import json
import logging
import re

import httpx

from app.core.config import settings
from app.services.scheduling import WINDOWS

log = logging.getLogger("attune.drug_timing")

RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"
OPENFDA_LABEL = "https://api.fda.gov/drug/label.json"
HTTP_TIMEOUT = 8.0
MAX_LABEL_CHARS = 3000


# --------------------------------------------------------------------------- #
# Step 1 — normalize the medication name (RxNorm / RxNav). Free, no key.
# --------------------------------------------------------------------------- #
async def _normalize_name(client: httpx.AsyncClient, name: str) -> tuple[str | None, str]:
    try:
        r = await client.get(f"{RXNAV_BASE}/rxcui.json", params={"name": name})
        if r.status_code != 200:
            return None, name
        ids = (r.json().get("idGroup") or {}).get("rxnormId") or []
        rxcui = ids[0] if ids else None
        if not rxcui:
            return None, name
        canonical = name
        try:
            r2 = await client.get(
                f"{RXNAV_BASE}/rxcui/{rxcui}/property.json",
                params={"propName": "RxNorm Name"},
            )
            if r2.status_code == 200:
                props = (r2.json().get("propConceptGroup") or {}).get("propConcept") or []
                if props:
                    canonical = props[0].get("propValue") or name
        except Exception:  # noqa: BLE001 - canonical name is best-effort
            pass
        return rxcui, canonical
    except Exception as exc:  # noqa: BLE001
        log.info("RxNorm lookup failed for %r: %s", name, exc)
        return None, name


# --------------------------------------------------------------------------- #
# Step 2 — fetch the real "dosage & administration" label text (OpenFDA).
# Free, no key (rate-limited to 240/min, 1000/day unauthenticated).
# --------------------------------------------------------------------------- #
async def _fetch_label_text(client: httpx.AsyncClient, name: str) -> str:
    # Strip RxNorm dose/form suffixes ("Levothyroxine 0.05 MG Oral Tablet" -> first word)
    base = name.split()[0] if name else name
    for term in (name, base):
        for field in ("openfda.generic_name", "openfda.brand_name"):
            try:
                r = await client.get(
                    OPENFDA_LABEL,
                    params={"search": f'{field}:"{term}"', "limit": 1},
                )
                if r.status_code != 200:
                    continue
                results = r.json().get("results") or []
                if not results:
                    continue
                res = results[0]
                chunks: list[str] = []
                for key in ("dosage_and_administration", "when_using", "instructions_for_use"):
                    val = res.get(key)
                    if isinstance(val, list):
                        chunks.extend(val)
                text = " ".join(c for c in chunks if c).strip()
                if text:
                    return text[:MAX_LABEL_CHARS]
            except Exception as exc:  # noqa: BLE001
                log.info("OpenFDA lookup failed for %r (%s): %s", term, field, exc)
    return ""


# --------------------------------------------------------------------------- #
# Step 3a — FREE rule-based extraction from the label text.
# The returned reason is always a sentence taken from the label (grounded).
# --------------------------------------------------------------------------- #
# Ordered: the first matching window phrase wins.
_WINDOW_PATTERNS: list[tuple[str, str]] = [
    (r"\b(at bedtime|before bed|before sleep|at night|nightly)\b", "night"),
    (r"\b(in the evening|each evening|every evening|with the evening meal|with dinner)\b", "evening"),
    (r"\b(in the morning|each morning|every morning|before breakfast|upon (?:waking|arising)|first thing)\b", "morning"),
    (r"\b(at noon|midday|with lunch|in the afternoon)\b", "afternoon"),
]
_WITH_FOOD = re.compile(
    r"\b(with food|with a meal|with meals|with your meal|after meals?|after eating|after food|with milk)\b",
    re.I,
)
_WITHOUT_FOOD = re.compile(
    r"\b(empty stomach|before (?:a )?meals?|before food|before eating|without food|"
    r"\d+\s*(?:hour|minute|min|hr)s?\s+before|\d+\s*hours?\s+after (?:a )?meals?)\b",
    re.I,
)
# A timing phrase inside a negated sentence ("Do not take ... at bedtime") means
# the OPPOSITE, so such sentences must not drive classification.
_NEGATION = re.compile(
    r"\b(do not|don't|should not|shouldn't|must not|mustn't|cannot|can't|avoid|never|not be taken)\b",
    re.I,
)


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.;:])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]


def _trim(sentence: str) -> str:
    # Drop leading label section markers like "2 DOSAGE AND ADMINISTRATION ".
    sentence = re.sub(
        r"^\d+(?:\.\d+)*\s*(?:DOSAGE AND ADMINISTRATION\s+)?", "", sentence, flags=re.I
    ).strip()
    return sentence if len(sentence) <= 220 else sentence[:217].rstrip() + "…"


def _first_sentence_matching(text: str, pattern: re.Pattern[str] | str) -> str | None:
    """First sentence matching the pattern (used for food guidance)."""
    rx = pattern if isinstance(pattern, re.Pattern) else re.compile(pattern, re.I)
    for sentence in _split_sentences(text):
        if rx.search(sentence):
            return _trim(sentence)
    return None


def _first_positive_sentence(text: str, pattern: re.Pattern[str] | str) -> str | None:
    """First sentence matching the pattern that is NOT negated."""
    rx = pattern if isinstance(pattern, re.Pattern) else re.compile(pattern, re.I)
    for sentence in _split_sentences(text):
        if rx.search(sentence) and not _NEGATION.search(sentence):
            return _trim(sentence)
    return None


def extract_from_label(label_text: str) -> dict | None:
    """Free, grounded extraction. Returns a suggestion dict or None if nothing found.

    Keys: window, reason (quoted from label), withFood (bool|None), confidence.
    """
    if not label_text:
        return None
    with_food: bool | None = None
    if _WITHOUT_FOOD.search(label_text):
        with_food = False
    elif _WITH_FOOD.search(label_text):
        with_food = True

    # A clear (non-negated) time-of-day phrase -> high confidence, grounded reason.
    for pattern, window in _WINDOW_PATTERNS:
        sentence = _first_positive_sentence(label_text, pattern)
        if sentence:
            return {
                "window": window,
                "reason": sentence,
                "withFood": with_food,
                "confidence": "high",
            }

    # No time-of-day, but food guidance exists -> medium, morning default.
    if with_food is not None:
        food_sentence = _first_sentence_matching(
            label_text, _WITH_FOOD if with_food else _WITHOUT_FOOD
        )
        return {
            "window": "morning",
            "reason": food_sentence,
            "withFood": with_food,
            "confidence": "medium",
        }
    return None


# --------------------------------------------------------------------------- #
# Step 3b — OPTIONAL LLM (Duke Gateway). OFF unless DRUG_AI_ENABLED + token set.
# --------------------------------------------------------------------------- #
def _llm_available() -> bool:
    return bool(settings.DRUG_AI_ENABLED and settings.LITELLM_TOKEN)


def _extract_json(content: str | None) -> dict | None:
    if not content:
        return None
    start, end = content.find("{"), content.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(content[start : end + 1])
    except json.JSONDecodeError:
        return None


async def _call_llm(messages: list[dict]) -> dict | None:
    if not _llm_available():
        return None
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.LITELLM_TOKEN, base_url=settings.LITELLM_BASE_URL)
        resp = await client.chat.completions.create(
            model=settings.LITELLM_MODEL,
            messages=messages,
            temperature=0,
        )
        return _extract_json(resp.choices[0].message.content)
    except Exception as exc:  # noqa: BLE001 - any failure falls through to next tier
        log.warning("Duke Gateway suggestion failed: %s", exc)
        return None


def _ungrounded_messages(name: str) -> list[dict]:
    # Deliberately forbids a justification: an ungrounded "why" is the liability.
    return [
        {"role": "system", "content": "You are a scheduling assistant. Respond with ONLY minified JSON."},
        {
            "role": "user",
            "content": (
                f"Medication: {name}\n"
                "No official label text is available. Based only on widely-known, general "
                "timing guidance, suggest a likely time-of-day window.\n"
                'Return JSON: {"window":"morning"|"afternoon"|"evening"|"night",'
                '"confidence":"high"|"low","reason":null}\n'
                "Do NOT invent any medical justification. The reason field MUST be null."
            ),
        },
    ]


# --------------------------------------------------------------------------- #
# Result shape + orchestration
# --------------------------------------------------------------------------- #
def _result(
    *,
    window: str,
    reason: str | None,
    confidence: str,
    with_food: bool | None,
    rxcui: str | None,
    tier: str,
) -> dict:
    return {
        "window": window,
        "reason": reason,
        "confidence": confidence,
        "withFood": with_food,
        "rxcui": rxcui,
        "tier": tier,                       # "grounded" | "unverified" | "manual"
        "grounded": tier == "grounded",
        "unverified": tier == "unverified",
        "needsManual": tier == "manual",
    }


async def suggest_timing(medication: str, with_food: bool | None = None) -> dict:
    name = medication.strip()
    rxcui: str | None = None
    canonical = name
    label_text = ""
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            rxcui, canonical = await _normalize_name(client, name)
            label_text = await _fetch_label_text(client, canonical or name)
    except Exception as exc:  # noqa: BLE001
        log.info("Drug lookup pipeline error for %r: %s", name, exc)

    # Tier 1 — FREE, grounded on the real label text (rule-based).
    extracted = extract_from_label(label_text)
    if extracted:
        return _result(
            window=extracted["window"],
            reason=extracted["reason"],
            confidence=extracted["confidence"],
            with_food=with_food if with_food is not None else extracted.get("withFood"),
            rxcui=rxcui,
            tier="grounded",
        )

    # Tier 2 — OPTIONAL LLM, no reason, only when enabled and confident.
    data = await _call_llm(_ungrounded_messages(canonical or name))
    if data and data.get("window") in WINDOWS and data.get("confidence") == "high":
        return _result(
            window=data["window"],
            reason=None,
            confidence="high",
            with_food=with_food,
            rxcui=rxcui,
            tier="unverified",
        )

    # Tier 3 — manual: safe default, UI drops to the time picker.
    return _result(
        window="morning",
        reason=None,
        confidence="low",
        with_food=with_food,
        rxcui=rxcui,
        tier="manual",
    )
