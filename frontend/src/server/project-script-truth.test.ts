import { describe, expect, it } from "vitest";

import {
  contentRadarDraftSeedOf,
  resolveProjectScriptText,
  selectReadableProjectScriptArtifact,
} from "./project-script-truth";

describe("project script truth", () => {
  const briefDetail = {
    contentRadarEvidence: {
      adaptedDraftSeed: { contentText: "  雷达改写初稿  " },
    },
  };

  it("reads the adapted draft carried by a content-radar project", () => {
    expect(contentRadarDraftSeedOf(briefDetail)).toBe("雷达改写初稿");
  });

  it("uses the radar draft before the first persisted script version", () => {
    expect(
      resolveProjectScriptText({
        persistedText: null,
        persistedVersionCount: 0,
        briefDetail,
      }),
    ).toBe("雷达改写初稿");
  });

  it("keeps the persisted script authoritative after the first save", () => {
    expect(
      resolveProjectScriptText({
        persistedText: "正式口播稿",
        persistedVersionCount: 1,
        briefDetail,
      }),
    ).toBe("正式口播稿");
  });

  it("does not resurrect the radar draft after an intentionally empty save", () => {
    expect(
      resolveProjectScriptText({
        persistedText: "",
        persistedVersionCount: 1,
        briefDetail,
      }),
    ).toBeNull();
  });
});

describe("selectReadableProjectScriptArtifact", () => {
  it("优先读取已有正式版本的 output_script", () => {
    const selected = selectReadableProjectScriptArtifact([
      {
        id: "legacy",
        artifactType: "master_script",
        currentVersionId: "v-legacy",
      },
      {
        id: "canonical",
        artifactType: "output_script",
        currentVersionId: "v-current",
      },
    ]);

    expect(selected?.id).toBe("canonical");
  });

  it("output_script 尚无版本时兼容读取旧 master_script", () => {
    const selected = selectReadableProjectScriptArtifact([
      {
        id: "empty-output",
        artifactType: "output_script",
        currentVersionId: null,
      },
      {
        id: "legacy",
        artifactType: "master_script",
        currentVersionId: "v-legacy",
      },
    ]);

    expect(selected?.id).toBe("legacy");
  });

  it("没有正式版本时返回 null，让上层继续读取雷达初稿 seed", () => {
    expect(
      selectReadableProjectScriptArtifact([
        {
          id: "empty-output",
          artifactType: "output_script",
          currentVersionId: null,
        },
      ]),
    ).toBeNull();
  });
});

it("只跳明确预留，旧缺省与正式空稿仍权威",()=>{
 const master={artifactType:"master_script",currentVersionId:"master-v",id:"master"};
 const reserved={artifactType:"output_script",currentVersionId:"reserved-v",currentVersionIsReserved:true,id:"reserved"};
 expect(selectReadableProjectScriptArtifact([master,reserved])?.id).toBe("master");expect(selectReadableProjectScriptArtifact([reserved])).toBeNull();
 expect(selectReadableProjectScriptArtifact([master,{...reserved,currentVersionIsReserved:false}])?.id).toBe("reserved");
});
