#!/usr/bin/env python3
"""Reproduce MJK V14 by replacing only the V13 About update UI, no image rebuild."""
from pathlib import Path
import argparse, hashlib, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
PATCH = ROOT / "branding/mjk-v14"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", default="~/.local/share/botmode-branding/v14")
    args = parser.parse_args()
    dest = Path(args.destination).expanduser()
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/branding/stage-v13.py"),
         "--destination", str(dest)], check=True,
    )
    source = (dest / "index.html").read_text(encoding="utf8")
    js = (PATCH / "update-check.js").read_text(encoding="utf8").rstrip("\n") + "\n"
    css = (PATCH / "update-check.css").read_text(encoding="utf8").rstrip("\n") + "\n"
    if "</script>" in js or "</style>" in css:
        raise RuntimeError("Unsafe patch")
    script = r'<script id="botmode-update-script-v13">[\s\S]*?</script>'
    style = r'<style id="botmode-update-style-v13">[\s\S]*?</style>'
    if len(re.findall(script, source)) != 1 or len(re.findall(style, source)) != 1:
        raise RuntimeError("Unexpected base V13 markup")
    html = re.sub(
        script,
        lambda m: '<script id="botmode-update-script-v14">\n' + js + '\n</script>',
        source, count=1,
    )
    html = re.sub(
        style,
        lambda m: '<style id="botmode-update-style-v14">\n' + css + '\n</style>',
        html, count=1,
    )
    for marker in [
        "botmode-update-script-v14", "botmode-update-style-v14",
        "botmode-avatar-mjk-v12", "botmode-polish-v12", "botmode-login-v4",
    ]:
        if marker not in html:
            raise RuntimeError("Missing feature: " + marker)
    temp = dest / ".index-v14.tmp"
    temp.write_text(html, encoding="utf8")
    temp.replace(dest / "index.html")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/branding/render-v14.py"),
         "--assets-dir", str(dest)], check=True,
    )
    print("MJK_V14_STAGE_PASS", dest, "INDEX_SHA256",
          hashlib.sha256((dest / "index.html").read_bytes()).hexdigest())

if __name__ == "__main__":
    main()
