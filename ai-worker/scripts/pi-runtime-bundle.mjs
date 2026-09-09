/**
 * Pi 根入口同时静态导出 models、又被 lazy provider 引用。其 sideEffects 白名单不含
 * index.js，CJS 打包会保留 createModels 函数却删除 init_models 调用，使 ModelsImpl
 * 尚未初始化。只纠正 Pi 根入口标注，不关闭全局 tree shaking 或加载真实供应商。
 */
export function piRuntimeInitializationPlugin() {
  return {
    name: "creatoros-pi-runtime-initialization",
    setup(build) {
      const resolving = Symbol("pi-runtime-resolving");
      build.onResolve({filter: /^@earendil-works\/pi-ai$/}, async args => {
        if (args.pluginData === resolving) return;
        const resolved = await build.resolve(args.path, {
          resolveDir: args.resolveDir,
          kind: args.kind,
          pluginData: resolving,
        });
        return {...resolved, sideEffects: true};
      });
    },
  };
}
