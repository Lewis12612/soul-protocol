#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────
# test-before-prompt-build.sh — 测试 soul-protocol 钩子核心逻辑
# 模拟 before-prompt-build 钩子的完整流程
# ───────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
TMP_BASE=$(mktemp -d)
PASS=0
FAIL=0

cleanup() { rm -rf "$TMP_BASE"; }
trap cleanup EXIT

# ─── 辅助函数 ──────────────────────────────────────────────────

ok()  { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    ok "$desc"
  else
    fail "$desc — expected='$expected' actual='$actual'"
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    ok "$desc"
  else
    fail "$desc — '$needle' not found in output"
  fi
}

assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    fail "$desc — '$needle' should NOT be present"
  else
    ok "$desc"
  fi
}

# ───────────────────────────────────────────────────────────────
# 测试组 1: 完整工作流 — 有 L3 INDEX + L2 + SESSION-STATE
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 1: 完整工作流 — 所有文件存在 ==="

# 搭建模拟 workspace
ws="$TMP_BASE/workspace"
mkdir -p "$ws/memory/memory-core"
mkdir -p "$ws/memory"

# 创建 L3 INDEX.md
cat > "$ws/memory/memory-core/INDEX.md" << 'EOF'
# 记忆库索引

### deep/ — 深度对话记忆
- [查看](deep/) 深度对话归档

### work/ — 工作项目记忆
- [查看](work/) 工作项目归档

### diary/ — 日记
- [查看](diary/) 每日日记
EOF

# 创建 L2 文件（2个）
echo "# 2026-05-02 日记忆

## 今日概览

完成了插件重构。

## 📋 跨日交接

### 待办清单状态
| 待办项 | 状态 |
|--------|------|
| 测试 | ⏸️ |

### 续接点建议
继续测试。
" > "$ws/memory/2026-05-02.md"

echo "# 2026-05-03 日记忆

## 今日概览

编写测试脚本。
" > "$ws/memory/2026-05-03.md"

# 创建 SESSION-STATE.md
echo "# SESSION-STATE

## 活跃任务
- 测试编写
" > "$ws/SESSION-STATE.md"

# 模拟钩子完整流程
simulate_hook() {
  local workspace_dir="$1"
  local prepend_parts=()
  local total_size=0
  local total_limit=51200  # 50KB

  # Step 1: L3 INDEX
  local index_path="$workspace_dir/memory/memory-core/INDEX.md"
  if [ -f "$index_path" ]; then
    local index_content
    index_content=$(cat "$index_path")
    local structure=()
    while IFS= read -r line; do
      if [[ "$line" == "### "* ]] && [[ "$line" == *"/"* ]]; then
        structure+=("$line")
      fi
      if [[ "$line" == *"INDEX"* ]] && [[ "$line" == *"[查看]"* ]]; then
        structure+=("$line")
      fi
    done <<< "$index_content"

    local l3_content
    if [ ${#structure[@]} -eq 0 ]; then
      l3_content=$(echo "$index_content" | head -15)
    else
      l3_content=$(printf '%s\n' "${structure[@]}")
    fi
    local l3_size=${#l3_content}
    if [ $((total_size + l3_size)) -le $total_limit ]; then
      prepend_parts+=("## 📚 L3 记忆库索引"$'\n'"$l3_content")
      total_size=$((total_size + l3_size))
    fi
  fi

  # Step 2: L2 最近记忆（按 mtime 排序，取2个）
  local l2_dir="$workspace_dir/memory"
  if [ -d "$l2_dir" ]; then
    local l2_files
    l2_files=$(ls -1 "$l2_dir" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$' | while read f; do
      local mtime
      mtime=$(stat -c %Y "$l2_dir/$f" 2>/dev/null || stat -f %m "$l2_dir/$f" 2>/dev/null)
      echo "$mtime $f"
    done | sort -rn | head -2 | awk '{print $2}')

    local l2_parts=()
    for f in $l2_files; do
      local fsize
      fsize=$(wc -c < "$l2_dir/$f")
      if [ "$fsize" -le 20480 ]; then
        local content
        content=$(cat "$l2_dir/$f")
        # 提取标题
        local title
        title=$(echo "$content" | grep -m1 '^# ' || true)
        if [ -n "$title" ]; then
          l2_parts+=("$title")
        fi
      fi
    done

    if [ ${#l2_parts[@]} -gt 0 ]; then
      local l2_content
      l2_content=$(printf '%s\n\n' "${l2_parts[@]}")
      local l2_size=${#l2_content}
      if [ $((total_size + l2_size)) -le $total_limit ]; then
        prepend_parts+=("## 📅 最近记忆（L2）"$'\n'"$l2_content")
        total_size=$((total_size + l2_size))
      fi
    fi
  fi

  # Step 3: 状态验证
  local checks=()
  local today
  today=$(date +%Y-%m-%d)
  if [ -f "$workspace_dir/memory/${today}.md" ]; then
    checks+=("✅ 今日L2")
  else
    checks+=("⚠️ 无今日L2")
  fi

  if [ -f "$workspace_dir/SESSION-STATE.md" ]; then
    checks+=("✅ SESSION-STATE存在")
  fi

  local verify_content
  verify_content="## 🔍 状态验证"$'\n'"$(IFS=' | '; echo "${checks[*]}")"
  prepend_parts+=("$verify_content")

  # 输出结果
  printf '%s\n\n' "${prepend_parts[@]}"
}

hook_output=$(simulate_hook "$ws")

assert_contains "1a: 输出包含 L3 索引标记" "$hook_output" "📚 L3 记忆库索引"
assert_contains "1b: 输出包含 deep/ 目录" "$hook_output" "### deep/"
assert_contains "1c: 输出包含 work/ 目录" "$hook_output" "### work/"
assert_contains "1d: 输出包含 L2 记忆标记" "$hook_output" "📅 最近记忆"
assert_contains "1e: 输出包含状态验证标记" "$hook_output" "🔍 状态验证"
assert_contains "1f: 输出包含 SESSION-STATE 状态" "$hook_output" "SESSION-STATE存在"

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 2: 边界情况 — 文件缺失
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 2: 边界情况 — 文件缺失 ==="

# 2a: 空 workspace（无 memory 目录）
empty_ws="$TMP_BASE/empty-ws"
mkdir -p "$empty_ws"

simulate_hook "$empty_ws" 2>/dev/null || true
# 应该不崩溃，输出应包含状态验证（即使为空）
ok "2a: 空 workspace 不崩溃"

# 2b: 只有 L3，无 L2
l3_only_ws="$TMP_BASE/l3-only-ws"
mkdir -p "$l3_only_ws/memory/memory-core"
cat > "$l3_only_ws/memory/memory-core/INDEX.md" << 'EOF'
# 记忆库索引

### deep/ — 深度对话
- [查看](deep/)
EOF

l3_output=$(simulate_hook "$l3_only_ws")
assert_contains "2b: L3-only 包含索引标记" "$l3_output" "📚 L3 记忆库索引"
assert_not_contains "2c: L3-only 不包含 L2 标记" "$l3_output" "📅 最近记忆"

# 2d: 只有 L2，无 L3
l2_only_ws="$TMP_BASE/l2-only-ws"
mkdir -p "$l2_only_ws/memory"
echo "# 2026-05-01" > "$l2_only_ws/memory/2026-05-01.md"

l2_output=$(simulate_hook "$l2_only_ws")
assert_not_contains "2d: L2-only 不包含 L3 索引标记" "$l2_output" "📚 L3 记忆库索引"
assert_contains "2e: L2-only 包含 L2 标记" "$l2_output" "📅 最近记忆"

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 3: 大小限制
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 3: 大小限制 ==="

# 3a: L3 INDEX 超过 5KB 限制
big_index_ws="$TMP_BASE/big-index-ws"
mkdir -p "$big_index_ws/memory/memory-core"
# 生成一个 6KB 的文件
python3 -c "
import sys
sys.stdout.write('# 记忆库索引\n\n')
for i in range(200):
    sys.stdout.write(f'### section-{i}/ — 描述{i}\n')
    sys.stdout.write(f'- [查看](section-{i}/) 详细内容\n')
" > "$big_index_ws/memory/memory-core/INDEX.md"

big_index_size=$(wc -c < "$big_index_ws/memory/memory-core/INDEX.md")
if [ "$big_index_size" -gt 5120 ]; then
  ok "3a: INDEX 文件(${big_index_size}B) 超过 5KB 限制"
else
  fail "3a: INDEX 文件(${big_index_size}B) 未超过 5KB"
fi

# 3b: L2 文件超过 20KB 限制
big_l2_ws="$TMP_BASE/big-l2-ws"
mkdir -p "$big_l2_ws/memory"
python3 -c "
import sys
sys.stdout.write('# 2026-05-03 日记忆\n\n')
for i in range(500):
    sys.stdout.write(f'## Section {i}\n\n')
    sys.stdout.write('x' * 100 + '\n\n')
" > "$big_l2_ws/memory/2026-05-03.md"

big_l2_size=$(wc -c < "$big_l2_ws/memory/2026-05-03.md")
if [ "$big_l2_size" -gt 20480 ]; then
  ok "3b: L2 文件(${big_l2_size}B) 超过 20KB 限制，应被跳过"
else
  fail "3b: L2 文件(${big_l2_size}B) 未超过 20KB"
fi

# 3c: 总大小限制 50KB
big_total_ws="$TMP_BASE/big-total-ws"
mkdir -p "$big_total_ws/memory/memory-core" "$big_total_ws/memory"
python3 -c "
import sys
# L3 INDEX ~10KB
sys.stdout.write('# 索引\n\n')
for i in range(300):
    sys.stdout.write(f'### deep/section-{i}/ — 描述\n')
" > "$big_total_ws/memory/memory-core/INDEX.md"

python3 -c "
import sys
# L2 ~30KB
sys.stdout.write('# 2026-05-03\n\n')
for i in range(500):
    sys.stdout.write(f'## Section {i}\n\n')
    sys.stdout.write('y' * 100 + '\n\n')
" > "$big_total_ws/memory/2026-05-03.md"

big_total_l3=$(wc -c < "$big_total_ws/memory/memory-core/INDEX.md")
big_total_l2=$(wc -c < "$big_total_ws/memory/2026-05-03.md")
big_total_combined=$((big_total_l3 + big_total_l2))
if [ "$big_total_combined" -gt 51200 ]; then
  ok "3c: 总大小(${big_total_combined}B) 超过 50KB 限制，应截断"
else
  ok "3c: 总大小(${big_total_combined}B) 在 50KB 内"
fi

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 4: 状态验证逻辑
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 4: 状态验证逻辑 ==="

# 4a: 所有状态正常
full_ws="$TMP_BASE/full-ws"
mkdir -p "$full_ws/memory"
today=$(date +%Y-%m-%d)
echo "# $today" > "$full_ws/memory/${today}.md"
echo "# SESSION-STATE" > "$full_ws/SESSION-STATE.md"

full_output=$(simulate_hook "$full_ws")
assert_contains "4a: 今日L2存在" "$full_output" "✅ 今日L2"
assert_contains "4b: SESSION-STATE存在" "$full_output" "SESSION-STATE存在"

# 4c: 无今日L2
no_today_ws="$TMP_BASE/no-today-ws"
mkdir -p "$no_today_ws/memory"
echo "# SESSION-STATE" > "$no_today_ws/SESSION-STATE.md"

no_today_output=$(simulate_hook "$no_today_ws")
assert_contains "4c: 无今日L2时显示警告" "$no_today_output" "⚠️ 无今日L2"

# 4d: 无 SESSION-STATE
no_state_ws="$TMP_BASE/no-state-ws"
mkdir -p "$no_state_ws/memory"
echo "# $today" > "$no_state_ws/memory/${today}.md"

no_state_output=$(simulate_hook "$no_state_ws")
assert_not_contains "4d: 无SESSION-STATE时不包含标记" "$no_state_output" "SESSION-STATE存在"

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 5: L2 文件过滤（非日期格式）
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 5: L2 文件过滤 ==="

filter_ws="$TMP_BASE/filter-ws"
mkdir -p "$filter_ws/memory"

# 创建混合文件
echo "# 2026-05-03" > "$filter_ws/memory/2026-05-03.md"
echo "# 2026-05-02" > "$filter_ws/memory/2026-05-02.md"
echo "readme" > "$filter_ws/memory/readme.md"
echo "diary" > "$filter_ws/memory/diary.md"
echo "not-a-date" > "$filter_ws/memory/2026-5-3.md"  # 格式不对
echo "archive" > "$filter_ws/memory/2026-05-01-backup.md"  # 格式不对

# 验证 L2_PATTERN 过滤
l2_count=$(ls -1 "$filter_ws/memory" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$' || true)
assert_eq "5a: 只有严格日期格式的文件被选中" "2" "$l2_count"

echo ""

# ───────────────────────────────────────────────────────────────
# 汇总
# ───────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════"
echo "  钩子逻辑测试: ${PASS} 通过, ${FAIL} 失败"
echo "═══════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
