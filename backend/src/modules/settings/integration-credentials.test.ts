import {describe,it,expect} from 'vitest';
import {createDb,sql} from '@creatoros/backend';
import {createIntegrationCredentials} from './integration-credentials';
const a={userId:'a',requestId:'a',source:'user' as const},b={...a,userId:'b'};
describe('RedFox independent credentials',()=>{
 it('encrypts, isolates users, masks status, replaces and removes',async()=>{const {db}=await createDb();const service=createIntegrationCredentials(db,Buffer.alloc(32,1));await service.save(a,'secret-one');expect((await service.status(a)).configured).toBe(true);expect((await service.status(b)).configured).toBe(false);expect(await service.resolve(b)).toBeNull();const raw=await db.execute(sql`select * from integration_credentials`);expect(JSON.stringify(raw.rows)).not.toContain('secret-one');expect(JSON.stringify(await service.status(a))).not.toContain('secret-one');await service.save(a,'secret-two');expect((await service.resolve(a))?.key).toBe('secret-two');await service.remove(a);expect(await service.resolve(a)).toBeNull();});
 it('never falls back to plaintext without master key',async()=>{const {db}=await createDb();await expect(createIntegrationCredentials(db,null).save(a,'secret')).rejects.toThrow('加密服务');});
});

describe("EveryInfra independent credentials", () => {
  const globalHost = "https://api.everyinfra.com";
  const mainlandHost = "https://api-cn.everyinfra.com";

  it("encrypts the key, isolates users and RedFox, and updates just the host without re-entering a key", async () => {
    const { db, client } = await createDb();
    try {
      const service = createIntegrationCredentials(db, Buffer.alloc(32, 1));
      await service.save(a, "old-provider-fixture");
      expect(await service.statusEveryInfra(a)).toEqual({
        provider: "everyinfra", configured: false, updatedAt: null, baseUrl: globalHost,
      });
      expect(await service.resolveEveryInfra(a)).toBeNull();
      const saved = await service.saveEveryInfra(a, { secret: "new-provider-fixture", baseUrl: globalHost });
      expect(saved).toMatchObject({ configured: true, baseUrl: globalHost });
      expect(JSON.stringify(saved)).not.toContain("new-provider-fixture");
      expect(await service.resolveEveryInfra(b)).toBeNull();

      await service.saveEveryInfra(a, { baseUrl: mainlandHost });
      expect(await service.resolveEveryInfra(a)).toEqual({ apiKey: "new-provider-fixture", baseUrl: mainlandHost });
      const raw = await db.execute(sql`select encrypted_secret,options from integration_credentials where provider='everyinfra'`);
      expect(raw.rows[0]?.options).toEqual({ baseUrl: mainlandHost });
      expect(JSON.stringify(raw.rows)).not.toContain("new-provider-fixture");

      await service.removeEveryInfra(a);
      expect(await service.resolveEveryInfra(a)).toBeNull();
      expect((await service.resolve(a))?.key).toBe("old-provider-fixture");
    } finally {
      await client.close();
    }
  });
});
