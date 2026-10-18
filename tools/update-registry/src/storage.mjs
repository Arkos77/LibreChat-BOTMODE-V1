import { MongoClient } from 'mongodb';

/** Dedicated central Mongo database. Never points to an installer's local MongoDB. */
export async function connectStore(mongoUri, dbName) {
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection('update_subscribers');
  const announcements = db.collection('update_announcements');
  await Promise.all([
    users.createIndex({email:1},{unique:true}),
    users.createIndex({status:1,createdAt:1}),
    users.createIndex({confirmationHash:1},{sparse:true}),
    users.createIndex({confirmationExpiresAt:1},{expireAfterSeconds:0}),
    users.createIndex({unsubscribeHash:1},{sparse:true}),
    announcements.createIndex({version:1,recipientKey:1},{unique:true}),
  ]);
  const store = {
    async upsertPending(email,confirmationHash,confirmationExpiresAt,unsubscribeHash,now) {
      try {
        await users.updateOne({email,$or:[
          {status:'unsubscribed'},
          {status:'pending',updatedAt:{$lt:new Date(now.getTime()-15*60*1000)}},
          {status:{$exists:false}},
        ]},{
          $set: {email,status:'pending',confirmationHash,confirmationExpiresAt,unsubscribeHash,updatedAt:now},
          $setOnInsert: {createdAt:now},
          $unset: {confirmedAt:'',unsubscribedAt:''},
        },{upsert:true});
        return true;
      } catch(error) {
        if (error?.code===11000) return false; // Already confirmed. No enumeration.
        throw error;
      }
    },
    async confirm(confirmationHash,now) {
      const doc=await users.findOneAndUpdate({confirmationHash,status:'pending',confirmationExpiresAt:{$gt:now}},{
        $set:{status:'confirmed',confirmedAt:now,updatedAt:now},
        $unset:{confirmationHash:'',confirmationExpiresAt:''},
      },{returnDocument:'after'});
      return Boolean(doc);
    },
    async unsubscribe(unsubscribeHash,now) {
      const result=await users.deleteOne({unsubscribeHash,status:'confirmed'});
      return result.deletedCount>0;
    },
    async countConfirmed() { return users.countDocuments({status:'confirmed'}); },
    async listConfirmed(offset,limit) {
      return users.find({status:'confirmed'},{projection:{_id:0,email:1,createdAt:1,confirmedAt:1}})
        .sort({createdAt:1,email:1}).skip(offset).limit(limit).toArray();
    },
    async *confirmedBatches(batchSize=100) {
      const cursor=users.find({status:'confirmed'},{projection:{_id:0,email:1}}).sort({email:1}).batchSize(batchSize);
      for await (const user of cursor) yield user;
    },
    async reserveAnnouncement(version,recipientKey,now) {
      try {await announcements.insertOne({version,recipientKey,status:'reserved',createdAt:now}); return true;}
      catch(error) {if(error?.code===11000)return false;throw error;}
    },
    async markAnnouncementSent(version,recipientKey,now) {
      await announcements.updateOne({version,recipientKey,status:'reserved'},{$set:{status:'sent',sentAt:now}});
    },
    async releaseFailedAnnouncement(version,recipientKey) {
      await announcements.deleteOne({version,recipientKey,status:'reserved'});
    },
  };
  return {store,close:()=>client.close()};
}
