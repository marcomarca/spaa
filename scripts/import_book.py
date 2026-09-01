#!/usr/bin/env python3
"""CLI utility to import Markdown files directly into the SPAA server."""

import argparse
import sys
from pathlib import Path
import httpx


def main():
    parser = argparse.ArgumentParser(description="Import a Markdown book into SPAA master server.")
    parser.add_argument("file", type=Path, help="Path to markdown (.md) file")
    parser.add_argument("--title", type=str, help="Book title (defaults to filename)")
    parser.add_argument("--author", type=str, default="", help="Author name")
    parser.add_argument("--language", type=str, default="es", choices=["es", "en"], help="Book language")
    parser.add_argument("--server", type=str, default="http://localhost:8000", help="SPAA Server URL")

    args = parser.parse_args()

    if not args.file.exists():
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    title = args.title or args.file.stem.replace("-", " ").replace("_", " ").title()
    markdown_content = args.file.read_text(encoding="utf-8")

    print(f"Importing '{title}' ({args.language}) to {args.server}...")

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{args.server}/api/books/import",
                json={
                    "title": title,
                    "author": args.author,
                    "markdown_text": markdown_content,
                    "language": args.language,
                    "mode": "auto",
                },
            )
            if resp.status_code != 200:
                print(f"Server error ({resp.status_code}): {resp.text}", file=sys.stderr)
                sys.exit(1)

            data = resp.json()
            print(f"Successfully imported book ID: {data['id']}")
            print(f"Total chapters parsed: {len(data.get('chapters', []))}")
            for chap in data.get("chapters", []):
                print(f"  - Cap {chap['sequence']}: {chap['title']} ({chap['word_count']} words)")
    except Exception as e:
        print(f"Connection failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
