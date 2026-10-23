import { readConfig, createMailer } from './config.mjs';
import { connectStore } from './storage.mjs';
import { unsubscribeToken } from './core.mjs';
import { validateReleaseTarget, verifyPublishedRelease } from './release.mjs';

const args=process.argv.slice(2);
const sending=args.includes('--send');
const allowed=new Set(['--send','--version','--release-url']);
for(let i=0;i<args.length;i++) {
  if (!allowed.has(args[i])) throw new Error('Unexpected CLI parameter');
  if(args[i]!=='--send') i++;
}
const param=(name)=>{const pos=args.indexOf(name);return pos>=0?args[pos+1]:null};
const version=param('--version'),releaseUrl=param('--release-url');
validateReleaseTarget(version, releaseUrl);
if (sending && process.env.REGISTRY_CONFIRM_SEND!=='YES') throw new Error('Set REGISTRY_CONFIRM_SEND=YES for intentional sending');
if (sending) await verifyPublishedRelease(version, releaseUrl);
const config=readConfig();
const {store,close}=await connectStore(config.mongoUri,config.dbName);
const mailer=sending?createMailer(config):null;
let eligible=0,sent=0,skipped=0,failed=0;
try {
  for await(const user of store.confirmedBatches()) {
    eligible++;
    if (!sending) continue;
    const recipientKey=unsubscribeToken(config.unsubscribeSecret,user.email);
    const reserved=await store.reserveAnnouncement(version,recipientKey,new Date());
    if (!reserved) { skipped++;continue; }
    const unsub=`${config.publicUrl}/unsubscribe?token=${unsubscribeToken(config.unsubscribeSecret,user.email)}`;
    try {
      await mailer({to:user.email,subject:`BOT MODE — version ${version} disponible`,text:`Une nouvelle version BOT MODE est disponible : ${version}\n\nPublication officielle : ${releaseUrl}\n\nLes mises à jour ne sont jamais installées automatiquement depuis cet e-mail. Vérifiez la release avant toute mise à jour.\n\nSe désinscrire : ${unsub}`});
      await store.markAnnouncementSent(version,recipientKey,new Date());
      sent++;
    } catch(_error) {
      failed++;
      await store.releaseFailedAnnouncement(version,recipientKey);
    }
    await new Promise(resolve=>setTimeout(resolve,200)); // simple SMTP throttle, no massive parallel burst
  }
} finally {await close();}
console.log(JSON.stringify({mode:sending?'sent':'dry-run',version,eligible,sent,skipped,failed}));
if (failed) process.exitCode=1;
