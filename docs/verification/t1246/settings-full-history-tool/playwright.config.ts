import reviewed from "../driver/playwright.config";
import {resolve} from "node:path";
export default {
 ...reviewed,
 testDir:resolve(process.cwd(),"tests-t1246-settings-history-full"),
 reporter:[["list"],["json",{outputFile:resolve(process.env.CREATOROS_T1246_RUN_DIR!,process.env.CREATOROS_T1246_SETTINGS_PHASE === "list" ? "list-results.json" : "results.json")}]],
};
