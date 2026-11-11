#!/usr/bin/env python3
"""Assemble MJK V12 from versioned V10/V11 assets, no image rebuild or extra container."""
import argparse
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "branding/mjk-v10/assets"
V11 = ROOT / "branding/mjk-v11"
PATCH = ROOT / "branding/mjk-v12"
FILES = [
    "logo.svg", "manifest.webmanifest", "mascot.webp", "favicon-16x16.png",
    "favicon-32x32.png", "apple-touch-icon-180x180.png",
    "icon-192x192.png", "maskable-icon.png",
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--destination", default="~/.local/share/botmode-branding/v12")
    args = ap.parse_args()
    dst = Path(args.destination).expanduser()
    dst.mkdir(mode=0o700, parents=True, exist_ok=True)
    for f in FILES:
        if not (BASE / f).is_file():
            raise RuntimeError("V10 asset missing: " + f)
        shutil.copy2(BASE / f, dst / f)
    shutil.copy2(V11 / "globe.svg", dst / "mjk-globe.svg")
    html = (V11 / "index.html").read_text(encoding="utf-8")
    js = (PATCH / "avatar-recolor.js").read_text(encoding="utf-8")
    if not js.endswith("\n"):
        raise RuntimeError("Expected script final newline")
    if html.count("botmode-polish-v11") != 1:
        raise RuntimeError("Unexpected V11 style version")
    if html.count("filter:hue-rotate(145deg) saturate(2.1) brightness(1.12)!important;") != 1:
        raise RuntimeError("Unexpected avatar selector (review required)")
    if html.count("</body>") != 1 or "botmode-avatar-mjk-v12" in html:
        raise RuntimeError("Unexpected V11 document")
    html = html.replace("botmode-polish-v11", "botmode-polish-v12", 1)
    html = html.replace(
        "filter:hue-rotate(145deg) saturate(2.1) brightness(1.12)!important;",
        "filter:none!important;", 1
    )
    html = html.replace(
        "</body>",
        '<script id="botmode-avatar-mjk-v12">\n' + js + '\n</script>\n</body>', 1
    )
    assert "botmode-avatar-mjk-v12" in html and "botmode-visual-skin-v11" in html
    tmp = dst / ".index-v12.tmp"
    tmp.write_text(html, encoding="utf-8")
    tmp.replace(dst / "index.html")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/branding/render-v12.py"),
         "--assets-dir", str(dst)], check=True
    )
    sha = hashlib.sha256((dst / "index.html").read_bytes()).hexdigest()
    print("MJK_V12_STAGE_PASS", dst, "INDEX_SHA256", sha)

if __name__ == "__main__":
    main()
