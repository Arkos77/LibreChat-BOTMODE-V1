import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const LIMIT = 8192;
const emailPattern = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;
const tokenPattern = /^[a-f0-9]{64}$/;
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const unsubscribeToken = (secret,email) => createHmac('sha256',secret).update(email).digest('hex');
export const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validEmail = (value) => value.length <= 254 && emailPattern.test(value);
export const csvValue = (value) => {
  const raw = String(value ?? '');
  const safe = /^[\t\r\n\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"','""')}"`;
};
const htmlEscape = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const sameSecret = (supplied, expected) => {
  if (typeof supplied !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
const document = (title, inner) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${htmlEscape(title)} — BOT MODE</title></head><body style="max-width:34rem;margin:4rem auto;font:1rem system-ui,sans-serif;padding:0 1rem"><h1>${htmlEscape(title)}</h1>${inner}</body></html>`;
const respond = (res,status,body,contentType='text/html; charset=utf-8') => {
  res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(body);
};
async function readForm(req) {
  const type = (req.headers['content-type'] ?? '').split(';')[0].toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') throw Object.assign(new Error('type'),{status:415});
  let size = 0; const chunks=[];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > LIMIT) throw Object.assign(new Error('size'),{status:413});
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
function checkToken(value) { return typeof value === 'string' && tokenPattern.test(value); }

/** Store and mailer are injected: no local runtime data is ever queried. */
export function createHandler({store,mailer,publicUrl,adminToken,unsubscribeSecret,clock=()=>Date.now(),maxPerHour=4}) {
  const byAddress = new Map();
  const throttled = (req) => {
    const key=req.socket.remoteAddress ?? 'unknown', now=clock();
    const recent=(byAddress.get(key)??[]).filter(t=>now-t<3600000);
    if (recent.length >= maxPerHour) { byAddress.set(key,recent); return true; }
    recent.push(now); byAddress.set(key,recent);
    if (byAddress.size>20000) byAddress.clear();
    return false;
  };
  return async function handle(req,res) {
    try {
      const url=new URL(req.url,'http://127.0.0.1');
      if (req.method==='GET' && url.pathname==='/health') return respond(res,200,'{"ok":true}','application/json; charset=utf-8');
      if (req.method==='GET' && url.pathname==='/') return respond(res,200,document('Recevoir les mises à jour',`<p>Inscription facultative aux nouvelles versions et correctifs BOT MODE. Aucune donnée de vos conversations ou de votre installation n’est envoyée.</p><form method="post" action="/subscribe"><label>E-mail <input type="email" name="email" required maxlength="254" autocomplete="email"></label><p><label><input type="checkbox" name="updates" value="yes" required> Je souhaite recevoir les notifications de versions et correctifs.</label></p><button>S’inscrire</button></form><p>Vous pouvez vous désinscrire depuis chaque e-mail.</p>`));
      if (req.method==='POST' && url.pathname==='/subscribe') {
        if (throttled(req)) return respond(res,429,document('Trop de demandes','<p>Réessayez plus tard.</p>'));
        const form=await readForm(req),email=normalizeEmail(form.get('email'));
        if (!validEmail(email) || form.get('updates')!=='yes') return respond(res,400,document('Inscription invalide','<p>Indiquez un e-mail valide et cochez la case.</p>'));
        const token=randomBytes(32).toString('hex');
        const unsubscribe=unsubscribeToken(unsubscribeSecret,email);
        const pending=await store.upsertPending(email,digest(token),new Date(clock()+48*3600000),digest(unsubscribe),new Date(clock()));
        if (pending) await mailer({to:email,subject:'Confirmez votre inscription BOT MODE',text:`Vous avez demandé les mises à jour de BOT MODE. Confirmez votre inscription : ${publicUrl}/confirm?token=${token}\n\nSi vous n’avez rien demandé, ignorez ce message. Lien valable 48 heures.`});
        return respond(res,200,document('Vérifiez votre boîte mail','<p>Si l’adresse est éligible, un message de confirmation a été envoyé.</p>'));
      }
      if (['/confirm','/unsubscribe'].includes(url.pathname) && req.method==='GET') {
        const token=url.searchParams.get('token');
        if (!checkToken(token)) return respond(res,400,document('Lien invalide','<p>Ce lien est invalide.</p>'));
        const isConfirm=url.pathname==='/confirm';
        return respond(res,200,document(isConfirm?'Confirmer l’inscription':'Se désinscrire',`<form method="post" action="${url.pathname}"><input type="hidden" name="token" value="${token}"><button>${isConfirm?'Confirmer mon adresse':'Arrêter les notifications'}</button></form>`));
      }
      if (['/confirm','/unsubscribe'].includes(url.pathname) && req.method==='POST') {
        const form=await readForm(req),token=form.get('token');
        if (!checkToken(token)) return respond(res,400,document('Lien invalide','<p>Ce lien est invalide.</p>'));
        if (url.pathname==='/confirm') {
          const ok=await store.confirm(digest(token),new Date(clock()));
          return respond(res,ok?200:410,document(ok?'Inscription confirmée':'Lien expiré',`<p>${ok?'Vous recevrez les mises à jour.':'Ce lien ne peut plus être utilisé.'}</p>`));
        }
        await store.unsubscribe(digest(token),new Date(clock()));
        return respond(res,200,document('Désinscription enregistrée','<p>Si cet abonnement était actif, il a été arrêté.</p>'));
      }
      if (url.pathname.startsWith('/admin/')) {
        const supplied=(req.headers.authorization??'').replace(/^Bearer /,'');
        if (!sameSecret(supplied,adminToken)) return respond(res,401,'{"error":"unauthorized"}','application/json; charset=utf-8');
        if (req.method==='GET' && url.pathname==='/admin/stats') {
          const total=await store.countConfirmed();
          return respond(res,200,JSON.stringify({confirmedSubscribers:total}),'application/json; charset=utf-8');
        }
        if (req.method==='GET' && url.pathname==='/admin/subscribers.csv') {
          if (await store.countConfirmed()>100000) return respond(res,413,'{"error":"export_limit"}','application/json; charset=utf-8');
          const lines=['email,createdAt,confirmedAt'];
          for (let offset=0;offset<100000;offset+=200) {
            const batch=await store.listConfirmed(offset,200);
            for (const u of batch) lines.push([csvValue(u.email),csvValue(u.createdAt?.toISOString()),csvValue(u.confirmedAt?.toISOString())].join(','));
            if (batch.length<200) break;
          }
          return respond(res,200,lines.join('\r\n')+'\r\n','text/csv; charset=utf-8');
        }
      }
      respond(res,404,document('Introuvable','<p>Page introuvable.</p>'));
    } catch (error) {
      if (error?.status===413||error?.status===415) return respond(res,error.status,document('Requête invalide','<p>Format ou taille non acceptée.</p>'));
      // No addresses, tokens, Mongo URIs, or SMTP responses in public errors.
      respond(res,503,document('Service temporairement indisponible','<p>Réessayez plus tard.</p>'));
    }
  };
}
