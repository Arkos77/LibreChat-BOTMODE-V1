import nodemailer from 'nodemailer';

function required(name) {
  const v=process.env[name];
  if (typeof v!=='string'||!v.trim()) throw new Error(`Missing required configuration ${name}`);
  return v.trim();
}
export function readConfig() {
  const base=required('REGISTRY_PUBLIC_URL');
  const url=new URL(base);
  if ((url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname!=='/') {
    throw new Error('REGISTRY_PUBLIC_URL must be HTTPS origin, or HTTP loopback for tests');
  }
  const adminToken=required('REGISTRY_ADMIN_TOKEN');
  const unsubscribeSecret=required('REGISTRY_UNSUBSCRIBE_SECRET');
  if ([adminToken,unsubscribeSecret].some(v=>/REPLACE_WITH|CHANGE_ME|PLACEHOLDER/i.test(v))) throw new Error('Replace example secrets before deployment');
  if (/\bexample\.(org|com|net)\b/i.test(url.hostname)) throw new Error('Configure an actual public registry hostname');
  if (adminToken.length<32||unsubscribeSecret.length<32||adminToken===unsubscribeSecret) throw new Error('Strong distinct registry secrets required');
  const port=Number(process.env.REGISTRY_PORT ?? 8789);
  if (!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid port');
  const mongoUri=required('REGISTRY_MONGODB_URI');
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) throw new Error('Invalid MongoDB URI');
  if (/CHANGE_ME|REPLACE_WITH/i.test(mongoUri)) throw new Error('Replace example MongoDB credentials');
  const smtpHost=required('REGISTRY_SMTP_HOST');
  const smtpPort=Number(process.env.REGISTRY_SMTP_PORT??587);
  if (![465,587].includes(smtpPort)) throw new Error('SMTP port 465 or 587 required');
  const smtpUser=required('REGISTRY_SMTP_USER');
  const smtpPass=required('REGISTRY_SMTP_PASSWORD');
  if (/CHANGE_ME|REPLACE_WITH/i.test(smtpPass)) throw new Error('Replace example SMTP credentials');
  const smtpFrom=required('REGISTRY_SMTP_FROM');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(smtpFrom)) throw new Error('SMTP_FROM requires mailbox address');
  const dbName=process.env.REGISTRY_DB_NAME || 'botmode_updates';
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(dbName)) throw new Error('Invalid DB name');
  return {publicUrl:url.origin,adminToken,unsubscribeSecret,port,mongoUri,smtpHost,smtpPort,smtpUser,smtpPass,smtpFrom,dbName};
}
export function createMailer(config) {
  const transport=nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,
    secure:config.smtpPort===465,requireTLS:config.smtpPort!==465,
    auth:{user:config.smtpUser,pass:config.smtpPass},
    connectionTimeout:15000,socketTimeout:20000});
  return async ({to,subject,text})=>transport.sendMail({from:config.smtpFrom,to,subject,text});
}
