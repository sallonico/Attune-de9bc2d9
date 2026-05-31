"""Drive the running ATTUNE app with Playwright + system Chrome, screenshot the
onboarding flow and dashboard, and report any browser console errors.

    ./.venv/bin/python scripts/drive_app.py
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/tmp/attune-shots")
OUT.mkdir(exist_ok=True)
EMAIL = f"tz-demo-{int(time.time())}@example.com"
PASSWORD = "password12345"

console_msgs = []


def shot(page, name):
    p = OUT / name
    page.screenshot(path=str(p), full_page=True)
    print(f"  shot  {p}")


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        # Force a US Eastern browser so an 8:30 dose must render as 8:30, not 4:30.
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 1000},
            timezone_id="America/New_York",
            locale="en-US",
        )
        page = ctx.new_page()
        page.on("console", lambda m: console_msgs.append((m.type, m.text)))
        page.on("pageerror", lambda e: console_msgs.append(("pageerror", str(e))))

        print(f"signup as {EMAIL}")
        page.goto(BASE, wait_until="networkidle")
        shot(page, "01-auth.png")

        page.fill('input[type=email]', EMAIL)
        page.fill('input[type=password]', PASSWORD)
        page.get_by_role("button", name="Create account").click()

        # Step 1: name
        page.get_by_placeholder("e.g. Margaret").wait_for(timeout=15000)
        shot(page, "02-onboarding-name.png")
        page.get_by_placeholder("e.g. Margaret").fill("Margaret")
        page.get_by_role("button", name="Continue").click()

        # Step 2: medication -> triggers AI suggestion
        page.get_by_placeholder("e.g. Levothyroxine").wait_for(timeout=15000)
        page.get_by_placeholder("e.g. Levothyroxine").fill("Vyvanse")
        page.get_by_role("button", name="Continue").click()

        # Step 3: when to take it — wait for the suggestion to resolve, set 08:30
        page.wait_for_selector('input[type=time]', timeout=40000)
        page.wait_for_timeout(1500)
        page.eval_on_selector(
            'input[type=time]',
            "el => { el.value='08:30'; el.dispatchEvent(new Event('input',{bubbles:true})); "
            "el.dispatchEvent(new Event('change',{bubbles:true})); }",
        )
        shot(page, "03-onboarding-time.png")
        page.get_by_role("button", name="Continue").click()

        # Step 4: routine (defaults are fine)
        page.wait_for_timeout(800)
        page.get_by_role("button", name="Continue").click()

        # Step 5: features -> complete
        page.wait_for_timeout(800)
        page.get_by_role("button", name="Complete Setup").click()

        # Dashboard
        page.wait_for_timeout(3000)
        shot(page, "04-dashboard.png")

        # Schedule tab (timezone card + tz-correct next dose)
        try:
            page.get_by_role("button", name="Schedule").click()
            page.wait_for_timeout(2500)
            shot(page, "05-schedule.png")
        except Exception as e:
            print(f"  (schedule tab nav failed: {e})")

        ctx.close()
        browser.close()

    print("\n=== browser console (errors/warnings) ===")
    interesting = [(t, x) for (t, x) in console_msgs if t in ("error", "warning", "pageerror")]
    if not interesting:
        print("  none 🎉")
    for t, x in interesting:
        print(f"  [{t}] {x[:300]}")
    print(f"\ntotal console msgs: {len(console_msgs)}")


if __name__ == "__main__":
    sys.exit(main())
