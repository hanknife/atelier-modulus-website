#!/usr/bin/env python3
"""Low-cost text helper for DeepSeek OpenAI-compatible models."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEFAULT_MODEL = "deepseek-v4-flash"

PROMPTS = {
    "polish": "Polish the following architecture project text. Keep concrete details, avoid marketing cliches, and return concise bilingual-ready prose.",
    "translate": "Translate the following architecture text. Preserve project names, locations, and formatting. If a target language is specified, use it.",
    "summarize": "Summarize the following architecture text into a short project note and three keywords.",
    "classify": "Classify the following project or note. Return JSON with type, status_guess, tags, and language."
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def call_deepseek(command: str, text: str, target: str | None) -> str:
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise SystemExit("Missing DEEPSEEK_API_KEY. Add it to .env or your shell environment.")

    model = os.environ.get("CHEAP_LLM_MODEL", DEFAULT_MODEL)
    system = PROMPTS[command]
    if target:
        system += f"\nTarget language or direction: {target}."

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text}
        ],
        "temperature": 0.3
    }
    request = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"DeepSeek request failed: HTTP {exc.code}\n{detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"DeepSeek request failed: {exc.reason}") from exc

    return data["choices"][0]["message"]["content"].strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run cheap text tasks through DeepSeek.")
    parser.add_argument("command", choices=sorted(PROMPTS))
    parser.add_argument("--input", required=True, help="Input text file")
    parser.add_argument("--output", required=True, help="Output text file")
    parser.add_argument("--target", help="Optional target language, e.g. en, zh, de, zh-en, zh-de")
    args = parser.parse_args()

    load_env_file(Path(".env"))
    input_path = Path(args.input)
    output_path = Path(args.output)
    text = input_path.read_text(encoding="utf-8")
    result = call_deepseek(args.command, text, args.target)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result + "\n", encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
