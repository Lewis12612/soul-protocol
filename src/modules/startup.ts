// ───────────────────────────────────────────────────────────────────────
// Startup 场景 — 启动场景（合并后：薄层包装器）
// 合并重构：startup + recovery → full-inject.ts
// 唯一差异：createL2=true
// ───────────────────────────────────────────────────────────────────────

import { createFullInjectScenario } from "./full-inject.js";

export const startupScenario = createFullInjectScenario({
  createL2: true,
  scenarioName: "startup",
});
