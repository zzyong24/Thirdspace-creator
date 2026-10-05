import { Callable } from '/Users/zyongzhu/.codex/worktrees/t1062-migration-convergence/Thirdspace-creator/ai-worker/node_modules/@xenova/transformers/src/utils/core.js';

class ProbeProcessor extends Callable {
  async _call(input) {
    return { input_features: { inputLength: input.length } };
  }
}

const processor = new ProbeProcessor();
const result = {
  typeofProcessor: typeof processor,
  prototypeConstructor: Object.getPrototypeOf(processor)?.constructor?.name,
  memberApplyType: typeof processor.apply,
  reflectApplyResult: await Reflect.apply(processor, null, [new Float32Array(7)]),
};
try {
  await processor.apply(null, [new Float32Array(7)]);
  result.memberApply = { ok: true };
} catch (error) {
  result.memberApply = {
    ok: false,
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
  };
}
console.log(JSON.stringify(result, null, 2));
