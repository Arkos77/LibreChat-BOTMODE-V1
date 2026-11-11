#!/usr/bin/env python3
"""Mac BOT MODE 3080 branding V12; conserver volumes, environnement, image V1.0.6, retour arrière."""
import json,subprocess,os,sys,time,urllib.request
from pathlib import Path
H=Path.home();B=H/'.local/share/botmode-branding';V12=B/'v12'
BK=H/'BOTMODE-BACKUPS/pre-avatar-v12-20261111'
BK.mkdir(parents=True,exist_ok=True);BK.chmod(0o700)
NAME="LibreChat-BOTMODE-FINAL";OLD="LibreChat-BOTMODE-FINAL-pre-avatar-v12-20261111"
ID="sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb"
def docker(*args):
 return subprocess.check_output(['docker',*args],text=True,stderr=subprocess.DEVNULL).strip()
def info(name):
 return json.loads(docker('inspect',name))[0]
def check(port,v4):
 try:
  with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/config',timeout=5) as r:
   assert json.load(r).get('appTitle')=='BOT MODE'
  with urllib.request.urlopen(f'http://127.0.0.1:{port}/login',timeout=5) as r:
   html=r.read()
   if v4:assert b'botmode-login-v4' in html and b'botmode-visual-skin-v11' in html and b'botmode-polish-v12' in html and b'botmode-avatar-mjk-v12' in html
  with urllib.request.urlopen(f'http://127.0.0.1:{port}/assets/logo.svg',timeout=5) as r:
   s=r.read()
   if v4:assert s==(V12/'logo.svg').read_bytes()
  return True
 except Exception:return False
def rollback():
 print('MAC_V12_ROLLBACK_BEGIN',flush=True)
 subprocess.run(['docker','rm','-f',NAME],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  docker('rename',OLD,NAME);docker('start',NAME)
  for _ in range(30):
   if check(3080,False):
    print('MAC_V12_ROLLBACK_PASS',flush=True)
    return
   time.sleep(2)
  print('MAC_V12_ROLLBACK_CONTAINER_RESTORED_NOT_READY',flush=True)
 except Exception as e:print('MAC_V12_ROLLBACK_FAILED',type(e).__name__,flush=True)
def main():
 assert check(3080,False) and check(3081,True)
 assert subprocess.run(['docker','inspect',OLD],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0
 j=info(NAME);c=j['Config'];h=j['HostConfig']
 assert j['State']['Running'] and j['Image']==ID
 assert h['NetworkMode']=='host' and not h['Privileged']
 assert c['Entrypoint']==['docker-entrypoint.sh'] and c['Cmd']==['npm','run','backend']
 assert len(j['Mounts'])==15 and all(x['Type']=='bind' for x in j['Mounts'])
 args=['docker','run','-d','--name',NAME,'--network','host','--restart',h['RestartPolicy']['Name']]
 envs=c['Env'];assert any(s=='APP_TITLE=BOT MODE' for s in envs)
 if not any(e.startswith('CUSTOM_FOOTER=') for e in envs):envs.append('CUSTOM_FOOTER=BOT MODE V1.0.6 — Votre écosystème d’agents IA spécialisés')
 assert all('\n' not in e for e in envs)
 efile=BK/'mac-v4-env';efile.write_text('\n'.join(envs)+'\n');efile.chmod(0o600)
 args+=['--env-file',str(efile),'--user',c['User'],'--workdir',c['WorkingDir']]
 changed=0
 for m in j['Mounts']:
  src=Path(m['Source']);dest=m['Destination']
  if str(src).startswith(str(B)+'/'):
   src=V12/src.name;changed+=1
  assert src.exists(),src
  spec=f'type=bind,source={src},target={dest}'
  if not m['RW']:spec+=',readonly'
  args+=['--mount',spec]
 assert changed==9,changed
 args.append('ghcr.io/arkos77/librechat-botmode-v1@'+ID)
 (BK/'previous-config.json').write_text(json.dumps(j,indent=2))
 (BK/'previous-config.json').chmod(0o600)
 print('MAC_V12_PREFLIGHT_PASS image=V1.0.6 mounts=15 replacement_mounts=9',flush=True)
 renamed=False
 try:
  docker('rename',NAME,OLD);renamed=True
  subprocess.run(['docker','stop','-t','15',OLD],stdout=subprocess.DEVNULL,check=True,timeout=40)
  subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True,text=True,timeout=60)
  for _ in range(60):
   if check(3080,True) and check(3081,True):
    jj=info(NAME);assert jj['Image']==ID and jj['State']['Running']
    (BK/'status.txt').write_text('PASS V1.0.6 3080/3081 visual skin v12 + logo MJK and native initials\n')
    print('MAC_V12_3080_PASS 3081_PASS',flush=True)
    return
   time.sleep(2)
  raise RuntimeError('New 3080 never passed health and branding check')
 except Exception as e:
  print('MAC_V12_FAIL',type(e).__name__,str(e)[:160],flush=True)
  if renamed:rollback()
  raise
if __name__=='__main__':main()
