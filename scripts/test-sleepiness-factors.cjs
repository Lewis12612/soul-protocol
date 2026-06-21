#!/usr/bin/env node
// V3.8.8-beta3 睡意因子计算冒烟测试
const { calcCircadianFactor, calcUptimeFactor, calcMemoryLoadFactor } = require('./sleepiness-factors.cjs');

let passed = 0, failed = 0;

function assert(label, actual, expected, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(ok ? `  ✅ ${label}: ${actual.toFixed(3)}` : `  ❌ ${label}: ${actual.toFixed(3)} (expected ${expected})`);
  ok ? passed++ : failed++;
}

console.log("circadian factor:");
// circadian 依赖当前时间：传 timeOfDay 参数可测试
assert("midnight (0:00)", calcCircadianFactor(0), 1.0);
assert("noon (12:00)", calcCircadianFactor(12), 0.1);
assert("morning (8:00)", calcCircadianFactor(8), 0.6, 0.05);
assert("evening (20:00)", calcCircadianFactor(20), 0.6, 0.05);
assert("night (23:00)", calcCircadianFactor(23), 1.0);

console.log("\nuptime factor:");
assert("0h", calcUptimeFactor(0), 0);
assert("4h", calcUptimeFactor(4), 0.1667, 0.05);
assert("10h", calcUptimeFactor(10), 0.575, 0.05);
assert("20h", calcUptimeFactor(20), 0.933, 0.1);
assert("1.5h", calcUptimeFactor(1.5), 0);

console.log("\nmemory load factor (no files expected):");
assert("no files", calcMemoryLoadFactor("/nonexistent"), 0);

console.log(`\n${passed}/${passed+failed} passed`);
process.exit(failed > 0 ? 1 : 0);
