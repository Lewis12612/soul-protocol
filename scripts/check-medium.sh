#!/bin/bash
# Heartbeat Check - Medium Version v3
# 功能：INDEX 一致性 + L2 增量 + L3 统计 + 状态追踪 + D层锚点
# 频率：每 2 小时

set -e

# ========================
# 配置
# ========================
WORKSPACE="${WORKSPACE:-$HOME/.openclaw/workspace}"
MEMORY_CORE="$WORKSPACE/memory/memory-core"
INDEX_FILE="$MEMORY_CORE/INDEX.md"
STATE_DIR="$WORKSPACE/memory/.heartbeat"
LAST_CHECK="$STATE_DIR/last-medium.json"
EXTRA_BASE_PATH="${EXTRA_BASE_PATH:-${HOME}/dialogue-logs}"

CURRENT_DATE=$(date +%Y-%m-%d)
CURRENT_TIME=$(date -Iseconds)
CURRENT_TS=$(date +%s)
YEAR=$(date +%Y)
MONTH=$(date +%m)

mkdir -p "$STATE_DIR"

# ========================
# INDEX 一致性检测
# ========================
check_index() {
    # 统计实际文件数（排除 diary/ 目录，diary 不参与 INDEX）
    local file_count=$(find "$MEMORY_CORE" -name "*.md" -type f \
        ! -name "INDEX.md" \
        ! -name "README.md" \
        ! -name "PRIORITY.md" \
        ! -path "*/diary/*" \
        2>/dev/null | wc -l)
    
    # 统计 INDEX 记录数
    local index_count=$(grep -oE '\[[^]]+\]\([^)]+\.md\)' "$INDEX_FILE" 2>/dev/null | \
        grep -v "INDEX.md" | wc -l)
    
    local consistent=false
    [ "$file_count" -eq "$index_count" ] && consistent=true
    
    echo "{\"file_count\": $file_count, \"index_count\": $index_count, \"consistent\": $consistent}"
}

# ========================
# L2 状态（含增量）
# ========================
check_l2() {
    local l2_file="$WORKSPACE/memory/$CURRENT_DATE.md"
    
    if [ -f "$l2_file" ]; then
        local lines=$(wc -l < "$l2_file")
        local bytes=$(wc -c < "$l2_file")
        
        # 增量计算
        local new_lines=0
        if [ -f "$LAST_CHECK" ]; then
            local last_lines=$(jq '.l2.lines // 0' "$LAST_CHECK" 2>/dev/null || echo "0")
            new_lines=$((lines - last_lines))
            [ "$new_lines" -lt 0 ] && new_lines=0
        else
            new_lines=$lines
        fi
        
        echo "{\"exists\": true, \"lines\": $lines, \"bytes\": $bytes, \"new_lines\": $new_lines}"
    else
        echo "{\"exists\": false, \"lines\": 0, \"bytes\": 0, \"new_lines\": 0}"
    fi
}

# ========================
# L3 统计
# ========================
check_l3() {
    local deep=$(find "$MEMORY_CORE/deep-dialogue" -name "*.md" -type f 2>/dev/null | wc -l)
    local work=$(find "$MEMORY_CORE/work-dialogue" -name "*.md" -type f 2>/dev/null | wc -l)
    local daily=$(find "$MEMORY_CORE/daily-dialogue" -name "*.md" -type f 2>/dev/null | wc -l)
    local diary=$(find "$MEMORY_CORE/diary" -name "*.md" -type f 2>/dev/null | wc -l)
    
    # total 不包含 diary（diary 是独立的）
    echo "{\"deep\": $deep, \"work\": $work, \"daily\": $daily, \"diary\": $diary, \"total\": $((deep + work + daily))}"
}

# ========================
# D层锚点：L2 格式校验
# ========================
check_l2_format() {
    local l2_file="$WORKSPACE/memory/$CURRENT_DATE.md"
    local format_valid=true
    local issues_json="[]"

    if [ ! -f "$l2_file" ]; then
        format_valid=false
        issues_json=$(jq -n '[{"section": "L2文件不存在", "type": "MISSING"}]')
        echo "{\"format_valid\": $format_valid, \"format_issues\": $issues_json}"
        return
    fi

    # 检查必需段落（从 sleepiness.json 配置读取，默认 4 个核心段落）
    local config_file="$WORKSPACE/skills/soul-protocol/config/sleepiness.json"
    local format_sections_json=$(jq -r '.protocol_verification.medium.format_sections' "$config_file" 2>/dev/null)
    if [ -z "$format_sections_json" ] || [ "$format_sections_json" = "null" ]; then
        format_sections_json='["长期项目追踪","待办清单状态","续接点建议","文件位置速查"]'
    fi

    local section_count=$(echo "$format_sections_json" | jq -r 'length')
    local missing=()
    for i in $(seq 0 $((section_count - 1))); do
        local section=$(echo "$format_sections_json" | jq -r ".[$i]")
        if ! grep -qE "^###?\s+.*${section}" "$l2_file" && ! grep -qF "$section" "$l2_file"; then
            format_valid=false
            missing+=("$section")
        fi
    done

    if [ "$format_valid" = false ]; then
        # 构建 JSON 数组
        issues_json="["
        local first=true
        for m in "${missing[@]}"; do
            if [ "$first" = true ]; then first=false; else issues_json+=", "; fi
            issues_json+="\"$m\""
        done
        issues_json+="]"
    fi

    echo "{\"format_valid\": $format_valid, \"format_issues\": $issues_json}"
}

# ========================
# D层锚点：EXTRA 新鲜度
# ========================
check_extra_freshness() {
    local extra_dir="$EXTRA_BASE_PATH/$YEAR/$MONTH/$CURRENT_DATE"
    local last_conversation="null"
    local unrecorded_hours=0

    if [ -d "$extra_dir" ]; then
        # 找最新（最后修改）的 .md 或 .txt 文件
        local latest_file=$(find "$extra_dir" -type f \( -name "*.md" -o -name "*.txt" \) -printf "%T@ %p\n" 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
        if [ -n "$latest_file" ]; then
            local file_ts=$(stat -c %Y "$latest_file" 2>/dev/null || echo "0")
            last_conversation="\"$(date -Iseconds -d "@$file_ts" 2>/dev/null || date -Iseconds)\""
            if [ "$file_ts" -gt 0 ]; then
                # 使用 awk 做浮点数除法（避免依赖 bc）
                unrecorded_hours=$(awk -v now="$CURRENT_TS" -v ft="$file_ts" 'BEGIN { printf "%.1f", (now - ft) / 3600 }')
            fi
        fi
    fi

    echo "{\"last_conversation\": $last_conversation, \"unrecorded_hours\": $unrecorded_hours}"
}

# ========================
# D层锚点：SESSION-STATE 状态
# ========================
check_session_state() {
    local session_file="$WORKSPACE/SESSION-STATE.md"
    local active_tasks=0
    local stale=true

    if [ -f "$session_file" ]; then
        # 统计 "活跃任务" 段落下的非空表格行（排除表头和分隔行）
        local section=$(sed -n '/## 📋 活跃任务/,/^## /p' "$session_file" 2>/dev/null | head -n -1)
        if echo "$section" | grep -q "|"; then
            # 表格格式: 统计数据行（排除 --- 分隔行和标题行）
            active_tasks=$(echo "$section" | grep -E '^\|.*\|.*\|' | grep -vE '^\|[- ]{3,}\|' | grep -v '任务\s*|' | grep -cE '^\|' 2>/dev/null || echo 0)
        fi

        # 清理可能的空白/换行
        active_tasks=$(echo "$active_tasks" | tr -d '\n' | tr -d ' ')
        if [ -z "$active_tasks" ] || [ "$active_tasks" = "0" ]; then
            active_tasks=0
        fi

        [ "$active_tasks" -gt 0 ] 2>/dev/null && stale=false
    fi

    echo "{\"active_tasks\": $active_tasks, \"stale\": $stale}"
}

# ========================
# D层锚点：L2 锚点（整合 L2 状态 + 格式）
# ========================
build_protocol_anchors() {
    local l2_json="$1"
    local l2_format_json="$2"
    local extra_json="$3"
    local session_json="$4"

    # 提取 L2 last_update 和 hours_stale
    local l2_exists=$(echo "$l2_json" | jq -r '.exists')
    local l2_lines=$(echo "$l2_json" | jq -r '.lines')
    local l2_last_update="null"
    local l2_hours_stale=0

    if [ "$l2_exists" = "true" ]; then
        local l2_file="$WORKSPACE/memory/$CURRENT_DATE.md"
        local l2_ts=$(stat -c %Y "$l2_file" 2>/dev/null || echo "0")
        if [ "$l2_ts" -gt 0 ]; then
            l2_last_update="\"$(date -Iseconds -d "@$l2_ts" 2>/dev/null || date -Iseconds)\""
            l2_hours_stale=$(awk -v now="$CURRENT_TS" -v ft="$l2_ts" 'BEGIN { printf "%.1f", (now - ft) / 3600 }')
        fi
    fi

    # 清理数字中的空白
    local hs_clean=$(echo "$l2_hours_stale" | tr -d ' \n\r')
    [ -z "$hs_clean" ] && hs_clean=0

    local format_valid=$(echo "$l2_format_json" | jq -r '.format_valid')
    local format_issues=$(echo "$l2_format_json" | jq -c '.format_issues')

    cat << EOF
{
  "protocol_anchors": {
    "l2": {
      "last_update": $l2_last_update,
      "hours_stale": $hs_clean,
      "lines": $l2_lines,
      "format_valid": $format_valid,
      "format_issues": $format_issues
    },
    "extra": $extra_json,
    "session_state": $session_json
  }
}
EOF
}

# ========================
# 主逻辑
# ========================
INDEX_JSON=$(check_index)
L2_JSON=$(check_l2)
L3_JSON=$(check_l3)
L2_FORMAT_JSON=$(check_l2_format)
EXTRA_JSON=$(check_extra_freshness)
SESSION_JSON=$(check_session_state)
ANCHORS_JSON=$(build_protocol_anchors "$L2_JSON" "$L2_FORMAT_JSON" "$EXTRA_JSON" "$SESSION_JSON")

# 构建输出（使用 jq 合并 anchors 到主 JSON）
OUTPUT_JSON=$(jq -n \
  --argjson anchors "$ANCHORS_JSON" \
  --arg check_type "medium" \
  --arg check_time "$CURRENT_TIME" \
  --argjson index "$INDEX_JSON" \
  --argjson l2 "$L2_JSON" \
  --argjson l3 "$L3_JSON" \
  '{check_type: $check_type, check_time: $check_time, index: $index, l2: $l2, l3: $l3} * $anchors')

echo "$OUTPUT_JSON"

# 保存状态
cat > "$LAST_CHECK" << EOF
{
  "check_time": "$CURRENT_TIME",
  "l2": $L2_JSON
}
EOF