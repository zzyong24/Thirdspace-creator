/**
 * 渠道包不得继承 CreatorOS 官方 DMG 背景，否则会在安装阶段泄露官方品牌。
 * 这里仅编译 Tauri 的确定性包配置，不参与渠道身份或业务判断。
 */
export function buildChannelTauriOverride({ manifest, icon, latestUrl }) {
  return {
    productName: manifest.displayName,
    mainBinaryName: manifest.binaryName,
    identifier: manifest.appIdentifier,
    bundle: {
      icon: [icon],
      macOS: {
        dmg: {
          background: null,
          windowPosition: null,
          windowSize: { width: 660, height: 400 },
          appPosition: { x: 180, y: 170 },
          applicationFolderPosition: { x: 480, y: 170 },
        },
      },
    },
    plugins: { updater: { endpoints: [latestUrl] } },
  };
}
