// ───────────────────────────────────────────────────────────────────────
// Recovery 场景 — compact 后恢复（合并后：薄层包装器）
// 合并重构：startup + recovery → full-inject.ts
// 唯一差异：createL2=false（compact 后 L2 已存在）
// ───────────────────────────────────────────────────────────────────────

import { createFullInjectScenario } from "./full-inject.js";

export const recoveryScenario = createFullInjectScenario({
  createL2: false,
  scenarioName: "recovery",
});
