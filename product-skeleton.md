# [ATTUNE] — Product Skeleton
*Internal document for team use. Last updated: May 2026.*

---

## Overview

> [ATTUNE is a physical medication adherence device paired with a HIPAA-compliant web app. It logs doses, gives a adherence calendar, and AI helps create reminders around your schedule, with an optional caregiver view and wellness check-ins, so patients and the people who support them can see the full picture of adherence over time.]

**The physical device is the hook. The software is the reason people stay.**

Our hardware attracts users. But long-term retention is driven entirely by the software experience — the features that reduce cognitive burden, build trust with caregivers, and create a habit loop around medication adherence.

### Who This Is For

This product is built for anyone who takes something on a schedule — not just patients.

| User Type | Example | What They Need Most |
|---|---|---|
| Elderly patients | Managing multiple chronic medications | Simplicity, caregiver connection, safety |
| Adults on a new prescription | Starting a 90-day treatment | Habit formation, low-friction scheduling |
| Caregivers | Managing a parent's medication remotely | Visibility, peace of mind, alerts |
| General population | Daily vitamins, supplements, wellness routines | Flexibility, motivation, consistency tracking |
| Wellness users | Protein, magnesium, adaptogens, etc. | Low-stakes entry point, habit building |

**Design implication:** The software must work across this full spectrum — from someone managing a prescribed medication to someone trying to remember their morning vitamins. This product is not intended for patients with chronical conditions. Tone, prompts, and setup language should feel approachable for all of these users, never clinical or intimidating. 

---

## Why This Matters — Maslow's Hierarchy of Needs

Each core feature addresses a fundamental human need, not just a convenience.

| Feature | Maslow's Need | Why It Matters (one sentence) |
|---|---|---|
| Adherence Calendar | Esteem | Seeing your own consistency builds confidence and accountability, turning adherence into a visible personal achievement — whether that's a prescription or a daily supplement. |
| Caregiver Dashboard | Love & Belonging | Caregivers need to feel connected and capable; this feature reduces the anxiety of not knowing and the pain of not being able to help. |
| AI Scheduling Assistant | Safety | Removing the pressure of picking the "perfect" time eliminates a key barrier to starting any daily health routine in the first place. |
| Setup Flow | Physiological | Whether it's a critical medication or a wellness supplement, getting the routine right is foundational to health — setup must be frictionless enough that it never becomes a reason to give up. |

---

## Software Features

### 1. Adherence Calendar

**What it does:** Gives users visual, ongoing feedback on whether they are taking their medication as scheduled.

**Why it drives retention:** The physical device brings users in. The calendar gives them a reason to open the app again tomorrow. Seeing streaks and gaps makes adherence feel real and personal.

**Maslow's need addressed:** Esteem — self-tracking and visible progress reinforce a sense of competence and personal responsibility.

**Status:** [TBD]

**Open questions:**
- What does a "missed dose" look like vs. a "late dose" in the calendar UI?
- Does the calendar show a weekly or monthly view by default?
- Are there any nudges or messages triggered by patterns in the calendar data?

---

### 2. Caregiver Dashboard

**What it does:** Allows a trusted person (family member, caregiver, etc.) to monitor a user's medication adherence remotely.

**Why it drives retention:** Addressing the emotional reality that someone else cares deeply about the user's health — and often feels helpless. The dashboard gives caregivers agency, which in turn reduces pressure on the user and reinforces their motivation to stay consistent.

**Maslow's need addressed:** Love & Belonging — medication adherence is rarely just a personal struggle; the caregiver relationship is central to long-term success.

**Status:** [TBD]

**Open questions:**
- How does a caregiver get connected to a user account? (invite link, shared code, etc.)
- What notifications does a caregiver receive and when?
- What level of detail does a caregiver see — full history, or just recent activity?
- Are there any privacy controls for the user to limit what a caregiver sees?

---

### 3. AI Scheduling Assistant

**What it does:** Helps users figure out the best time(s) to take their medication through a guided, conversational prompt flow — rather than asking them to pick a time cold.

**Why it drives retention:** The anxiety of "picking wrong" is a real barrier. A bad schedule leads to missed doses; missed doses lead to guilt; guilt leads to abandonment. AI removes that decision pressure entirely.

**Maslow's need addressed:** Safety — a good schedule makes medication feel manageable and low-risk, supporting a stable daily health routine.

**Status:** 🔧 Needs work — see Schedule Formatting section below.

---

## Schedule Formatting Feature (In Progress)

This is a known gap. The current implementation needs a rethink. Below is the proposed direction.

### Problem
Asking users to enter a time directly doesn't work for everyone. Schedules vary by day. Users don't always know what time is "best." A blank text field creates friction and drop-off.

### Proposed Flow

```
Step 1: "Would you like help choosing a time to take [medication]?"
        → [ Yes, help me ] [ I'll enter my own time ]

Step 2 (if Yes): "Does your schedule vary day to day?"
        → [ Pretty consistent ] [ It depends on the day ]

Step 3a (Consistent): "What time generally works best for you?"
        → Multiple choice: [ Morning ] [ Afternoon ] [ Evening ] [ Night ]
        → Follow-up: pick a specific time window within that block

Step 3b (Varies): "Let's go day by day. What time works on weekdays?"
        → Multiple choice per day or by grouping (weekdays / weekends / specific days)

Step 4: Confirmation — show the schedule back to the user in plain language
        → "So you'll take [medication] at 8:00 PM on weekdays and 9:00 PM on Saturdays. Does that look right?"
        → [ Looks good ] [ Let me change something ]
```

### Design Principles for Prompts
- **Always multiple choice where possible** — reduce typing and decision fatigue
- **Plain language only** — no medical or technical jargon
- **One question at a time** — never show two decisions on the same screen
- **Easy to change** — every step should have a back option
- **Confirm before saving** — show the full schedule in plain English before committing

### Open Questions
- Should the AI suggest a time based on the medication type (e.g., "this medication is often taken with food, morning or evening works best")?
- How do we handle medications that need to be taken multiple times a day — same flow repeated, or a different UI?
- What happens if a user skips this flow — can they set the schedule later?

---

## Setup Flow

**Goal:** Get a new user from zero to a configured medication schedule in as few steps as possible.

### Current Steps (MVP)
1. Enter login information
2. Enter name
3. Enter one medication
4. Enter how many times per day they need to take it
5. → AI Scheduling Assistant flow (see above)

**Status:** Needs more work. The current setup page is functional but not polished. The scheduling step in particular requires a redesign (see above).

**Open questions:**
- What happens after setup — do users land on the calendar, a home dashboard, or the first scheduled dose?
- Can users add more than one medication during setup, or is that a post-onboarding action?
- Is there a "guest" or "try it first" mode, or is account creation required upfront?
- What does the error state look like if a user enters an unrecognized medication name?

---

## Pitching the Software

> This section is for internal use when explaining why the software matters alongside the hardware.

**The device attracts. The software retains.**

The physical device solves the "I forgot" problem in a tangible, satisfying way. But hardware alone cannot address the emotional and behavioral dimensions of long-term adherence — the guilt of missing a dose, the anxiety of a caregiver who can't check in, the paralysis of setting up a new routine.

The software turns a useful gadget into a trusted daily health companion. And critically — this product isn't just for patients. It's for anyone who takes something on a schedule: a prescription, a vitamin stack, a magnesium supplement before bed. That's nearly everyone. The addressable market is much larger than "medication."

Each feature addresses a real human barrier:

- **Adherence Calendar** → "Am I actually doing this?" — gives users proof of their own effort, whether they're tracking a blood pressure medication or a morning probiotic
- **Caregiver Dashboard** → "Is my loved one okay?" — gives caregivers peace of mind and removes emotional burden from the user
- **AI Scheduling** → "When should I take this?" — removes a key point of friction before any routine is even established

These are not nice-to-haves. They are the reason users stay past the first week — and the reason a wellness supplement user becomes just as loyal as a patient.

---

## Open Items & Next Steps

| Item | Owner | Status |
|---|---|---|
| Redesign schedule formatting flow | TBD | 🔧 In progress |
| Refine setup page UX | TBD | 🔧 Needs work |
| Define caregiver connection flow | TBD | ❓ Not started |
| Write copy for AI scheduling prompts | TBD | ❓ Not started |
| Confirm Maslow framing with team | TBD | ❓ Not started |
| Define post-setup landing experience | TBD | ❓ Not started |

---

*This document is a living skeleton. Sections marked [TBD] require team input before they can be finalized.*
