import {it,expect} from "vitest";
import {createDb} from "@creatoros/backend";
import {createNotificationRepository} from "./notifications.repository";
import {createNotificationsService} from "./notifications.service";
const now=()=>"2026-10-04T00:00:00.000Z";
it("组通知列表、未读计数与标记读取采用同一可见集，系统通知保持可见",async()=>{
 const store=await createDb();let id=0;
 try {
 const service=createNotificationsService(createNotificationRepository(store.db),{now,nextId:p=>`${p}-${++id}`});
 const base={userId:"notification-user",requestId:"r",source:"user" as const};
 const a={...base,groupId:"group-a",accountId:null},b={...base,groupId:"group-b",accountId:null};
 const input={notificationType:"task",title:"任务完成",body:"",entityType:"task",entityId:"task-1"};
 const own=await service.create(a,input);await service.create(b,input);await service.create(base,{...input,notificationType:"system"});
 expect((await service.list(a,{page:1,pageSize:20})).total).toBe(2);
 expect(await service.getUnreadCount(a)).toBe(2);
 await expect(service.markRead(b,own.id)).rejects.toThrow("Notification not found");
 await service.markRead(a,own.id);
 expect(await service.getUnreadCount(a)).toBe(1);
 expect(await service.getUnreadCount(b)).toBe(2);
 }finally{await store.client.close();}
},30000);
