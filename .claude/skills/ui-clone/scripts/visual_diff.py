#!/usr/bin/env python3
"""Create a simple pixel-difference image and report mismatch percentage."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare two screenshots")
    parser.add_argument("reference")
    parser.add_argument("implementation")
    parser.add_argument("--out", required=True)
    parser.add_argument("--threshold", type=int, default=12, help="per-channel tolerance, 0-255")
    args = parser.parse_args()

    try:
        from PIL import Image, ImageChops
    except ImportError as exc:
        raise SystemExit("Pillow is required: python -m pip install pillow") from exc

    reference = Image.open(args.reference).convert("RGB")
    implementation = Image.open(args.implementation).convert("RGB")

    width = min(reference.width, implementation.width)
    height = min(reference.height, implementation.height)
    reference = reference.crop((0, 0, width, height))
    implementation = implementation.crop((0, 0, width, height))

    raw_diff = ImageChops.difference(reference, implementation)
    diff_pixels = 0
    total = width * height
    highlight = Image.new("RGB", (width, height), "black")
    src = raw_diff.load()
    dst = highlight.load()

    for y in range(height):
        for x in range(width):
            r, g, b = src[x, y]
            if max(r, g, b) > args.threshold:
                diff_pixels += 1
                dst[x, y] = (255, min(255, g + 40), min(255, b + 40))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    highlight.save(out)

    percent = (diff_pixels / total * 100) if total else 100
    print(f"{percent:.4f}%")


if __name__ == "__main__":
    main()
