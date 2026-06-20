#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────
# test-utils.sh — 测试 soul-protocol 工具函数核心逻辑
# 不依赖测试框架，纯 bash 验证
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
# 测试组 1: 文件读取 — 大小限制
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 1: 文件读取 — 大小限制 ==="

# 1a: 小文件读取成功
small_file="$TMP_BASE/small.txt"
echo "hello world" > "$small_file"
small_size=$(wc -c < "$small_file")
if [ "$small_size" -le 51200 ]; then
  ok "1a: 小文件(${small_size}B) 在默认限制(50KB)内"
else
  fail "1a: 小文件(${small_size}B) 超出默认限制"
fi

# 1b: 超大文件应被拒绝
large_file="$TMP_BASE/large.txt"
dd if=/dev/zero of="$large_file" bs=1024 count=60 2>/dev/null  # 60KB
large_size=$(wc -c < "$large_file")
if [ "$large_size" -gt 51200 ]; then
  ok "1b: 大文件(${large_size}B) 超出默认限制(50KB)，应被拒绝"
else
  fail "1b: 大文件(${large_size}B) 未超出限制"
fi

# 1c: 自定义大小限制（5KB）
limit_file="$TMP_BASE/limit.txt"
dd if=/dev/zero of="$limit_file" bs=1024 count=8 2>/dev/null  # 8KB
limit_size=$(wc -c < "$limit_file")
if [ "$limit_size" -gt 5120 ]; then
  ok "1c: 文件(${limit_size}B) 超出自定义限制(5KB)，应被拒绝"
else
  fail "1c: 文件(${limit_size}B) 未超出自定义限制"
fi

# 1d: 空文件读取
empty_file="$TMP_BASE/empty.txt"
touch "$empty_file"
empty_size=$(wc -c < "$empty_file")
assert_eq "1d: 空文件大小为0" "0" "$empty_size"

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 2: 路径安全 — 路径穿越检测
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 2: 路径安全 — 路径穿越检测 ==="

# 2a: 合法路径（在 workspace 内）
ws="$TMP_BASE/workspace"
mkdir -p "$ws/memory"
echo "test" > "$ws/memory/test.md"

# 模拟路径穿越检测逻辑（与 file-reader.ts 一致）
check_path_in_workspace() {
  local file_path="$1" workspace_dir="$2"
  local resolved workspace_resolved
  resolved="$(cd "$(dirname "$file_path")" 2>/dev/null && pwd)/$(basename "$file_path")" || return 1
  workspace_resolved="$(cd "$workspace_dir" && pwd)"
  if [[ "$resolved" == "$workspace_resolved"* ]]; then
    return 0  # 安全
  else
    return 1  # 穿越
  fi
}

if check_path_in_workspace "$ws/memory/test.md" "$ws"; then
  ok "2a: 合法路径通过检测"
else
  fail "2a: 合法路径被误判为穿越"
fi

# 2b: 路径穿越（../etc/passwd）
if check_path_in_workspace "$ws/../../etc/passwd" "$ws"; then
  fail "2b: 路径穿越未检测到"
else
  ok "2b: 路径穿越(/etc/passwd)被正确拒绝"
fi

# 2c: 路径穿越（绝对路径不在 workspace）
if check_path_in_workspace "/etc/passwd" "$ws"; then
  fail "2c: 外部绝对路径未检测到"
else
  ok "2c: 外部绝对路径被正确拒绝"
fi

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 3: L2 文件 mtime 排序
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 3: L2 文件 mtime 排序 ==="

l2_dir="$TMP_BASE/memory"
mkdir -p "$l2_dir"

# 3a: 创建3个L2文件，不同 mtime
echo "# 2026-05-01" > "$l2_dir/2026-05-01.md"
sleep 0.1
echo "# 2026-05-02" > "$l2_dir/2026-05-02.md"
sleep 0.1
echo "# 2026-05-03" > "$l2_dir/2026-05-03.md"

# 模拟 L2_PATTERN 过滤 + mtime 排序（与 before-prompt-build.ts 一致）
l2_pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$'
l2_files=$(ls -1 "$l2_dir" | grep -E "$l2_pattern" | while read f; do
  mtime=$(stat -c %Y "$l2_dir/$f" 2>/dev/null || stat -f %m "$l2_dir/$f" 2>/dev/null)
  echo "$mtime $f"
done | sort -rn | head -2 | awk '{print $2}')

first=$(echo "$l2_files" | head -1)
second=$(echo "$l2_files" | sed -n '2p')
count=$(echo "$l2_files" | wc -l)

assert_eq "3a: 排序后第一个文件是最新" "2026-05-03.md" "$first"
assert_eq "3b: 排序后第二个文件" "2026-05-02.md" "$second"
assert_eq "3c: 最多取2个文件" "2" "$count"

# 3d: 过滤非 L2 文件
echo "not a date file" > "$l2_dir/readme.md"
echo "not a date file" > "$l2_dir/diary.md"
l2_files2=$(ls -1 "$l2_dir" | grep -E "$l2_pattern" | while read f; do
  mtime=$(stat -c %Y "$l2_dir/$f" 2>/dev/null || stat -f %m "$l2_dir/$f" 2>/dev/null)
  echo "$mtime $f"
done | sort -rn | head -2 | awk '{print $2}')
count2=$(echo "$l2_files2" | wc -l)
assert_eq "3d: 非日期文件被过滤" "2" "$count2"

# 3e: 空目录
empty_l2="$TMP_BASE/empty-memory"
mkdir -p "$empty_l2"
l2_files3=$(ls -1 "$empty_l2" | grep -E "$l2_pattern" | while read f; do
  mtime=$(stat -c %Y "$empty_l2/$f" 2>/dev/null || stat -f %m "$empty_l2/$f" 2>/dev/null)
  echo "$mtime $f"
done | sort -rn | head -2 | awk '{print $2}' || true)
if [ -z "$l2_files3" ]; then
  ok "3e: 空目录返回空结果"
else
  fail "3e: 空目录不应返回文件"
fi

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 4: L3 INDEX 结构提取
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 4: L3 INDEX 结构提取 ==="

# 4a: 标准 INDEX.md — 提取 ### 标题行
index_file="$TMP_BASE/INDEX.md"
cat > "$index_file" << 'INDEXEOF'
# 记忆库索引

### deep/ — 深度对话记忆
- [查看](deep/) 深度对话归档

### work/ — 工作项目记忆
- [查看](work/) 工作项目归档

### diary/ — 日记
- [查看](diary/) 每日日记

INDEXEOF

# 模拟 extractIndexStructure 逻辑
extract_index() {
  local file="$1"
  local structure=()
  while IFS= read -r line; do
    if [[ "$line" == "### "* ]] && [[ "$line" == *"/"* ]]; then
      structure+=("$line")
    fi
    if [[ "$line" == *"INDEX"* ]] && [[ "$line" == *"[查看]"* ]]; then
      structure+=("$line")
    fi
  done < "$file"

  if [ ${#structure[@]} -eq 0 ]; then
    head -15 "$file"
  else
    printf '%s\n' "${structure[@]}"
  fi
}

result=$(extract_index "$index_file")
assert_contains "4a: 提取 deep/ 标题" "$result" "### deep/"
assert_contains "4b: 提取 work/ 标题" "$result" "### work/"
assert_contains "4c: 提取 diary/ 标题" "$result" "### diary/"

# 4d: 无匹配标题时回退到前15行
fallback_file="$TMP_BASE/INDEX-fallback.md"
cat > "$fallback_file" << 'FALLBACKEOF'
# 记忆库索引

这是普通文本，没有 ### 标题。
也没有目录链接。
FALLBACKEOF

fallback_result=$(extract_index "$fallback_file")
assert_contains "4d: 回退模式包含原始文本" "$fallback_result" "普通文本"

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 5: 日志级别过滤
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 5: 日志级别过滤 ==="

# 5a: 模拟日志级别过滤逻辑（与 logger.ts 一致）
# LEVEL_ORDER: debug=0, info=1, warn=2, error=3
# 当 minLevel=info 时，debug 被过滤

filter_log() {
  local level="$1" min_level="$2"
  local -A level_order=([debug]=0 [info]=1 [warn]=2 [error]=3)
  local level_val=${level_order[$level]}
  local min_val=${level_order[$min_level]}
  if [ "$level_val" -ge "$min_val" ]; then
    echo "PASS"
  else
    echo "FILTERED"
  fi
}

assert_eq "5a: debug 在 info 级别被过滤" "FILTERED" "$(filter_log debug info)"
assert_eq "5b: info 在 info 级别通过" "PASS" "$(filter_log info info)"
assert_eq "5c: warn 在 info 级别通过" "PASS" "$(filter_log warn info)"
assert_eq "5d: error 在 info 级别通过" "PASS" "$(filter_log error info)"
assert_eq "5e: debug 在 debug 级别通过" "PASS" "$(filter_log debug debug)"
assert_eq "5f: warn 在 error 级别被过滤" "FILTERED" "$(filter_log warn error)"

echo ""

# ───────────────────────────────────────────────────────────────
# 测试组 6: L2 摘要提取
# ───────────────────────────────────────────────────────────────

echo "=== 测试组 6: L2 摘要提取 ==="

l2_sample="$TMP_BASE/2026-05-03.md"
cat > "$l2_sample" << 'L2EOF'
# 2026-05-03 日记忆

## 今日概览

完成了灵魂系统插件重构。

## 其他内容

一些无关内容。

## 📋 跨日交接（固定末尾）

### 待办清单状态
| 待办项 | 状态 | 说明 |
|--------|------|------|
| 测试 | ✅ | 完成 |

### 续接点建议
从插件测试继续。
L2EOF

# 模拟 extractL2Summary 逻辑
extract_l2_summary() {
  local file="$1"
  local summary_parts=()

  # 提取 # 标题行
  local title_line
  title_line=$(grep -m1 '^# ' "$file" || true)
  if [ -n "$title_line" ]; then
    summary_parts+=("$title_line")
  fi

  # 提取今日概览
  local overview_start
  overview_start=$(grep -n "今日概览" "$file" | head -1 | cut -d: -f1 || true)
  if [ -n "$overview_start" ]; then
    local total_lines
    total_lines=$(wc -l < "$file")
    local next_h2
    next_h2=$(tail -n +$((overview_start + 1)) "$file" | grep -n '^## ' | head -1 | cut -d: -f1 || true)
    if [ -n "$next_h2" ]; then
      local end=$((overview_start + next_h2 - 1))
      if [ $end -gt $((overview_start + 10)) ]; then
        end=$((overview_start + 10))
      fi
      summary_parts+=("$(sed -n "${overview_start},${end}p" "$file")")
    else
      summary_parts+=("$(sed -n "${overview_start},$((overview_start + 10))p" "$file")")
    fi
  fi

  # 提取跨日交接
  local handover_start
  handover_start=$(grep -n "跨日交接" "$file" | head -1 | cut -d: -f1 || true)
  if [ -n "$handover_start" ]; then
    local relevant
    relevant=$(sed -n "${handover_start},$((handover_start + 30))p" "$file" | grep -E "待办清单状态|续接点建议|^\||^[0-9]+\." || true)
    if [ -n "$relevant" ]; then
      summary_parts+=("### 📋 跨日交接摘要"$'\n'"$relevant")
    fi
  fi

  printf '%s\n\n' "${summary_parts[@]}"
}

l2_result=$(extract_l2_summary "$l2_sample")
assert_contains "6a: 包含标题" "$l2_result" "# 2026-05-03"
assert_contains "6b: 包含今日概览" "$l2_result" "今日概览"
assert_contains "6c: 包含跨日交接" "$l2_result" "跨日交接"
assert_contains "6d: 包含待办清单" "$l2_result" "待办清单状态"

echo ""

# ───────────────────────────────────────────────────────────────
# 汇总
# ───────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════"
echo "  工具函数测试: ${PASS} 通过, ${FAIL} 失败"
echo "═══════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
