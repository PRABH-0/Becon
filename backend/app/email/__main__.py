"""CLI entrypoint for Becon email operations.

Usage:
    python -m app.email --send-test you@example.com
    python -m app.email --run-batch
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.database import SessionLocal
from app.email.digest import build_user_digest, run_digest_scheduler_batch
from app.email.resend_client import ResendClient
from app.models import UserProfile

logger = logging.getLogger("becon.email.cli")


def main() -> None:
    parser = argparse.ArgumentParser(description="Becon Daily Email Digest CLI")
    parser.add_argument("--send-test", type=str, help="Recipient email address for test digest dispatch")
    parser.add_argument("--run-batch", action="store_true", help="Run scheduled digest batch check")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.send_test:
            recipient = args.send_test.strip()
            print(f"Generating test digest dispatch for {recipient}...")

            # Find user or create mock user profile for preview
            user = db.query(UserProfile).filter(UserProfile.email == recipient).first()
            if not user:
                user = db.query(UserProfile).filter(UserProfile.is_anonymous.is_(False)).first()
                if not user:
                    user = UserProfile(
                        name="Developer Tester",
                        email=recipient,
                        role="Software Engineer",
                        interests="Python, TypeScript, Docker",
                        is_anonymous=False,
                        email_digest_enabled=True,
                    )
                else:
                    # Temporary override for test recipient
                    user.email = recipient

            digest_bundle = build_user_digest(db, user)
            if not digest_bundle:
                print("Could not build digest (no cards available or user ineligible).")
                sys.exit(1)

            html_body, text_body, cards, reading_time, unsub_url = digest_bundle
            subject = f"[TEST] Becon Daily: {cards[0].title} (~{reading_time} min read)"

            client = ResendClient()
            res = client.send_email(
                to=recipient,
                subject=subject,
                html_body=html_body,
                text_body=text_body,
                unsubscribe_url=unsub_url,
            )

            print(f"Email Dispatch Status: {res.status}")
            print(f"Message ID:            {res.id}")
            print(f"Dry-Run Mode:          {res.is_dry_run}")
            if res.error:
                print(f"Error:                 {res.error}")
            print("\nPreview Plain-Text Fallback:\n" + ("-" * 60))
            print(text_body[:800] + ("...\n[truncated]" if len(text_body) > 800 else ""))

        elif args.run_batch:
            print("Executing scheduled digest dispatch batch...")
            sent = run_digest_scheduler_batch(db)
            print(f"Dispatched {sent} scheduled digest emails.")

        else:
            parser.print_help()

    finally:
        db.close()


if __name__ == "__main__":
    main()
