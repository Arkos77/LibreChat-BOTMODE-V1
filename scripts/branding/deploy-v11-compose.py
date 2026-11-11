#!/usr/bin/env python3
"""Déploiement V11 sur un conteneur BOT MODE géré par Docker Compose.
Sauvegarde l'inspection, vérifie la config et restaure le conteneur en cas d'échec.
Aucun volume ni conteneur non-API modifié.
"""
import argparse, json, os, subprocess, sys, time, urllib.request
from datetime import datetime
from pathlib import Path
IMAGE_ID="sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb"
def run(args,**kw):
    return subprocess.run(args,text=True,capture_output=True,**kw)
def inspect(name):
    r=run(["docker","inspect",name])
    if r.returncode:raise RuntimeError("Conteneur introuvable: "+name)
    return json.loads(r.stdout)[0]
def check(port,assets,expected):
    base=f"http://127.0.0.1:{port}"
    def fetch(path):
        with urllib.request.urlopen(base+path,timeout=5) as r:
            assert r.status==200
            return r.read()
    try:
        html=fetch("/login").decode("utf8")
        cfg=json.loads(fetch("/api/config"))
        logo=fetch("/assets/logo.svg")
        if expected:
            return "botmode-visual-skin-v11" in html and "botmode-polish-v11" in html and "botmode-login-v4" in html and cfg.get("appTitle")=="BOT MODE" and logo==(assets/"logo.svg").read_bytes()
        return cfg.get("appTitle")=="BOT MODE"
    except Exception:return False
def compose_args(files,proj):
    arr=["docker","compose","-p",proj]
    for f in files:arr+=["-f",f]
    return arr
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--container",required=True)
    ap.add_argument("--port",required=True,type=int,choices=[3080,3081])
    ap.add_argument("--assets-dir",default="~/.local/share/botmode-branding/v11")
    ap.add_argument("--backup-dir",default="~/BOTMODE-BACKUPS/pre-globe-v11-20261111")
    ap.add_argument("--confirm",action="store_true")
    args=ap.parse_args()
    if not args.confirm:raise RuntimeError("Utiliser --confirm après validation.")
    b=Path(args.backup_dir).expanduser();b.mkdir(mode=0o700,parents=True,exist_ok=True);b.chmod(0o700)
    assets=Path(args.assets_dir).expanduser().resolve()
    override=assets/"override.yml"
    assert override.is_file() and (assets/"logo.svg").is_file()
    j=inspect(args.container)
    lab=j["Config"]["Labels"]
    proj=lab.get("com.docker.compose.project")
    wd=lab.get("com.docker.compose.project.working_dir")
    raw=lab.get("com.docker.compose.project.config_files")
    if not all((proj,wd,raw)):raise RuntimeError("Conteneur non Compose: "+args.container)
    if j["Image"]!=IMAGE_ID:raise RuntimeError("Image actuelle non qualifiée V1.0.6")
    if not j["State"]["Running"] or not check(args.port,assets,False):raise RuntimeError("Service actuel indisponible")
    original=[x for x in raw.split(",") if x]
    for f in original:
        if not Path(f).is_file():raise RuntimeError("Fichier compose manquant: "+f)
    saved=b/(args.container+"-before-v11.json")
    saved.write_text(json.dumps(j,ensure_ascii=False,indent=2));saved.chmod(0o600)
    # Les surcharges anciennes de branding sont remplacées ; tout le reste est préservé.
    filtered=[f for f in original if not ("/botmode-branding/v" in f and f.endswith("/override.yml"))]
    newfiles=filtered+[str(override)]
    cmd=compose_args(newfiles,proj)
    validated=run(cmd+["config","--format","json"],cwd=wd)
    if validated.returncode:raise RuntimeError("docker compose config invalide")
    svc=json.loads(validated.stdout)["services"]["api"]
    ports=[str(x.get("published")) for x in svc.get("ports",[]) if isinstance(x,dict)]
    assert str(args.port) in ports and str(3081 if args.port==3080 else 3080) not in ports
    assert svc["image"].endswith(IMAGE_ID)
    mounts=svc.get("volumes",[])
    assert sum(str(m.get("source","")).startswith(str(assets)) for m in mounts)==9
    data_mounts=[m for m in j["Mounts"] if "/botmode-branding/" not in m["Source"]]
    destinations={m.get("target") for m in mounts}
    assert all(m["Destination"] in destinations for m in data_mounts),"Volume initial absent dans la configuration"
    print("PREFLIGHT_PASS",args.container,"port",args.port,"protected_data_mounts",len(data_mounts),flush=True)
    # Reconstruction API seulement, sans --renew-anon-volumes, sans suppression de volumes.
    launched=run(cmd+["up","-d","--no-deps","--force-recreate","api"],cwd=wd,timeout=160)
    if launched.returncode==0:
        for n in range(45):
            if check(args.port,assets,True):
                updated=inspect(args.container)
                if updated["Image"]==IMAGE_ID and updated["State"]["Running"]:
                    (b/(args.container+"-v11-PASS.txt")).write_text("PASS "+datetime.now().isoformat()+" V11 308"+str(args.port-3080)+"\n")
                    print("DEPLOY_V11_PASS",args.container,"port",args.port,flush=True)
                    return
            time.sleep(2)
    print("DEPLOY_FAIL_ROLLBACK",args.container,flush=True)
    rollback=run(compose_args(original,proj)+["up","-d","--no-deps","--force-recreate","api"],cwd=wd,timeout=160)
    print("ROLLBACK_COMMAND",rollback.returncode,flush=True)
    for n in range(35):
        if check(args.port,assets,False):
            print("ROLLBACK_HTTP_PASS",args.port,flush=True);break
        time.sleep(2)
    raise RuntimeError("Déploiement non validé; retour arrière effectué ou à vérifier")
if __name__=="__main__":
    main()
