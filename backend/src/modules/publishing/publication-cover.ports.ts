// 前置类型协议；正式service实现必须root按同tx注入公开owner。
import type {Db} from '@creatoros/backend';
import type {RequestContext,WorkAssetFile} from '@creatoros/contract';
import type {ProjectsService} from '../projects';
import type {PublishingService} from './publishing.service';
export interface PublicationCoverSavePorts {
 projects(tx:Db):Pick<ProjectsService,'getOutput'|'getProject'>;
 publishing(tx:Db):Pick<PublishingService,'getPublication'|'listRevisions'>;
 /** 真Assets公开port+项目link，exactfile/image/checksum；事务持共享锁或原不可变证明，不取currentFile。 */
 readExactImageFile(ctx:RequestContext,projectId:string,file:WorkAssetFile,tx:Db):Promise<{assetId:string;assetFileId:string;checksum:string}>;
}
