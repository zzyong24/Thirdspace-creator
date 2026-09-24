import "server-only";
import type {Db} from "@creatoros/backend";
import {createWorkbenchFileRecoveryService} from "@creatoros/backend/modules/execution";
import {nativeFileCapabilities} from "./workbench-native-host";
import {createNativeFileReceiptReader} from "./workbench-native-client";

/** Production composition shared by the public transport and the isolated Native integration. */
export function createNativeFileRecoveryService(db:Db,options:Parameters<typeof createNativeFileReceiptReader>[0]&Pick<Parameters<typeof createWorkbenchFileRecoveryService>[1],"now"|"afterReconciled"|"shouldStop">={}){
 return createWorkbenchFileRecoveryService(db,{
  capabilities:nativeFileCapabilities,readReceipt:createNativeFileReceiptReader(options),now:options.now,afterReconciled:options.afterReconciled,shouldStop:options.shouldStop,
 });
}
