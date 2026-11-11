#!/usr/bin/env python3
"""Rendu reproductible des ressources BOT MODE MJK V13.
Image officielle v1.0.6 uniquement; pas de secret ni modification des données.
"""
from pathlib import Path
import json, argparse, xml.etree.ElementTree as ET
IMAGE="ghcr.io/arkos77/librechat-botmode-v1@sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb"
MOUNTS=[
  ("logo.svg","/app/client/dist/assets/logo.svg"),
  ("logo.svg","/app/client/public/assets/logo.svg"),
  ("index.html","/app/client/dist/index.html"),
  ("manifest.webmanifest","/app/client/dist/manifest.webmanifest"),
  ("favicon-16x16.png","/app/client/dist/assets/favicon-16x16.png"),
  ("favicon-32x32.png","/app/client/dist/assets/favicon-32x32.png"),
  ("apple-touch-icon-180x180.png","/app/client/dist/assets/apple-touch-icon-180x180.png"),
  ("icon-192x192.png","/app/client/dist/assets/icon-192x192.png"),
  ("maskable-icon.png","/app/client/dist/assets/maskable-icon.png"),
]
def render(asset_dir:Path)->str:
    asset_dir=asset_dir.expanduser().resolve(strict=True)
    assert asset_dir.is_dir()
    for filename,_ in MOUNTS:
        p=asset_dir/filename
        if not p.is_file() or p.is_symlink():
            raise ValueError("Resource missing or symlink: "+filename)
    index=(asset_dir/"index.html").read_text("utf8")
    assert '<title>BOT MODE</title>' in index
    assert 'botmode-visual-skin-v11' in index and 'botmode-polish-v12' in index and 'botmode-avatar-mjk-v12' in index and 'botmode-update-script-v13' in index and 'botmode-update-style-v13' in index and 'botmode-login-v4' in index
    assert 'data-testid="nav-user"' in index
    assert "botmode-visual-skin-v9" not in index
    logo=(asset_dir/"logo.svg").read_text("utf8")
    ET.fromstring(logo)
    assert "MJK" in logo
    manifest=json.loads((asset_dir/"manifest.webmanifest").read_text("utf8"))
    assert manifest["name"]=="BOT MODE"
    lines=[
        "services:",
        "  api:",
        "    image: "+IMAGE,
        "    environment:",
        '      APP_TITLE: "BOT MODE"',
        '      CUSTOM_FOOTER: "BOT MODE V1.0.6 — Votre écosystème d’agents IA spécialisés"',
        "    volumes:"
    ]
    for filename,target in MOUNTS:
        lines+=["      - type: bind",
                "        source: "+json.dumps(str(asset_dir/filename),ensure_ascii=False),
                "        target: "+target,
                "        read_only: true"]
    return "\n".join(lines)+"\n"
if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--assets-dir",default="~/.local/share/botmode-branding/v13")
    parser.add_argument("--output",default=None)
    args=parser.parse_args()
    folder=Path(args.assets_dir).expanduser()
    output=Path(args.output).expanduser() if args.output else folder/"override.yml"
    assert output.parent.resolve()==folder.resolve()
    output.write_text(render(folder),encoding="utf8")
    output.chmod(0o600)
    print("BRANDING_RENDER_PASS",output,"mounts",len(MOUNTS))
