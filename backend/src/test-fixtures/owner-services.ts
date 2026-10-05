import {createProjectsService} from "../modules/projects/projects.service";
import {createProjectRepository} from "../modules/projects/projects.repository";
import {createAssetsService} from "../modules/assets/assets.service";
import {createAssetRepository} from "../modules/assets/assets.repository";

// 测试装配根负责构造真实 owner；领域测试只获得 service，不跨模块直接持有 repository。
export function createFixtureProjectsService(db:Parameters<typeof createProjectRepository>[0],deps:Parameters<typeof createProjectsService>[1]) {
  return createProjectsService(createProjectRepository(db),deps);
}
export function createFixtureAssetsService(db:Parameters<typeof createAssetRepository>[0],repoDeps:Parameters<typeof createAssetRepository>[1],storage:Parameters<typeof createAssetsService>[1],deps:Parameters<typeof createAssetsService>[2]) {
  return createAssetsService(createAssetRepository(db,repoDeps),storage,deps);
}
