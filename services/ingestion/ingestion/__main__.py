"""Validate the local worker entrypoint without network or secret output."""

import argparse
import json
import os


def main() -> int:
    parser = argparse.ArgumentParser(description="Event Radar worker environment check")
    parser.add_argument("--check", action="store_true", required=True)
    args = parser.parse_args()
    environment = os.environ.get("APP_ENV", "development")
    if environment not in {"development", "staging"}:
        parser.error("APP_ENV must be development or staging")
    if args.check:
        print(
            json.dumps(
                {
                    "service": "ingestion",
                    "environment": environment,
                    "status": "ready",
                    "adapters": ["madrid_single_day"],
                    "backend_checked": False,
                }
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
