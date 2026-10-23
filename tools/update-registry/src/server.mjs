import { createServer } from 'node:http';
import { createHandler } from './core.mjs';
import { readConfig,createMailer } from './config.mjs';
import { connectStore } from './storage.mjs';

const config=readConfig();
const {store,close}=await connectStore(config.mongoUri,config.dbName);
const server=createServer(createHandler({store,mailer:createMailer(config),
  publicUrl:config.publicUrl,adminToken:config.adminToken,unsubscribeSecret:config.unsubscribeSecret}));
server.listen(config.port, '127.0.0.1',()=>console.log(`Update registry listening on loopback port ${config.port}`));
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close(()=>close().then(()=>process.exit(0))));
