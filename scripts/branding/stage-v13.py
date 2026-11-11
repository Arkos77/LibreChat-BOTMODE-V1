#!/usr/bin/env python3
"""Stage optional MJK V13 About update checker from pinned V12 assets."""
from pathlib import Path
import argparse, hashlib, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
PATCH = ROOT / "branding/mjk-v13"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", default="~/.local/share/botmode-branding/v13")
    args = parser.parse_args()
    dest = Path(args.destination).expanduser()
    dest.mkdir(mode=0o700, parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/branding/stage-v12.py"),
         "--destination", str(dest)], check=True
    )
    original = (dest / "index.html").read_text(encoding="utf-8")
    js = (PATCH / "update-check.js").read_text(encoding="utf-8")
    css = (PATCH / "update-check.css").read_text(encoding="utf-8")
    if not js.endswith("\n") or not css.endswith("\n"):
        raise RuntimeError("V13 sources must end with newline")
    if original.count("</head>") != 1 or original.count("</body>") != 1:
        raise RuntimeError("Unexpected V12 markup")
    if "botmode-avatar-mjk-v12" not in original or "botmode-polish-v12" not in original:
        raise RuntimeError("Base V12 unrecognized")
    if "botmode-update-script-v13" in original or "</script>" in js or "</style>" in css:
        raise RuntimeError("Patch content not safe")
    html = original.replace(
        "</head>", '<style id="botmode-update-style-v13">\n' + css + "\n</style>\n</head>", 1
    )
    html = html.replace(
        "</body>", '<script id="botmode-update-script-v13">\n' + js + "\n</script>\n</body>", 1
    )
    temp = dest / ".index-v13.tmp"
    temp.write_text(html, encoding="utf-8")
    temp.replace(dest / "index.html")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/branding/render-v13.py"),
         "--assets-dir", str(dest)], check=True
    )
    print("MJK_V13_STAGE_PASS", dest,
          "INDEX_SHA256", hashlib.sha256((dest / "index.html").read_bytes()).hexdigest())

if __name__ == "__main__":
    main()
