#!/usr/bin/env python3
"""Préparer MJK V11 à partir des assets V10 qualifiés, sans recompiler."""
from pathlib import Path
import argparse,shutil,hashlib,subprocess,sys
HERE=Path(__file__).resolve().parents[2]
BASE=HERE/"branding/mjk-v10/assets"
PATCH=HERE/"branding/mjk-v11"
FILES=["logo.svg","manifest.webmanifest","mascot.webp","favicon-16x16.png",
       "favicon-32x32.png","apple-touch-icon-180x180.png","icon-192x192.png","maskable-icon.png"]
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--destination",default="~/.local/share/botmode-branding/v11")
 a=p.parse_args()
 d=Path(a.destination).expanduser()
 d.mkdir(parents=True,exist_ok=True)
 for f in FILES:
  assert (BASE/f).is_file(),f
  shutil.copy2(BASE/f,d/f)
 shutil.copy2(PATCH/"index.html",d/"index.html")
 shutil.copy2(PATCH/"globe.svg",d/"mjk-globe.svg")
 subprocess.run([sys.executable,str(HERE/"scripts/branding/render-v11.py"),
                 "--assets-dir",str(d)],check=True)
 assert (d/"override.yml").is_file()
 print("MJK_V11_STAGE_PASS",d,"INDEX_SHA256",hashlib.sha256((d/"index.html").read_bytes()).hexdigest())
if __name__=="__main__":main()
