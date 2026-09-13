import {describe,it,expect} from 'vitest';
import {createDb,sql} from '@creatoros/backend';
import {createIntegrationCredentials} from './integration-credentials';
const a={userId:'a',requestId:'a',source:'user' as const},b={...a,userId:'b'};
describe('RedFox independent credentials',()=>{
 it('encrypts, isolates users, masks status, replaces and removes',async()=>{const {db}=await createDb();const service=createIntegrationCredentials(db,Buffer.alloc(32,1));await service.save(a,'secret-one');expect((await service.status(a)).configured).toBe(true);expect((await service.status(b)).configured).toBe(false);expect(await service.resolve(b)).toBeNull();const raw=await db.execute(sql`select * from integration_credentials`);expect(JSON.stringify(raw.rows)).not.toContain('secret-one');expect(JSON.stringify(await service.status(a))).not.toContain('secret-one');await service.save(a,'secret-two');expect((await service.resolve(a))?.key).toBe('secret-two');await service.remove(a);expect(await service.resolve(a)).toBeNull();});
 it('never falls back to plaintext without master key',async()=>{const {db}=await createDb();await expect(createIntegrationCredentials(db,null).save(a,'secret')).rejects.toThrow('加密服务');});
});
