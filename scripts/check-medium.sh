#!/bin/bash
# Heartbeat Check - Medium Version v2
# 功能：INDEX 一致性 + L2 增量 + L3 统计 + 状态追踪
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

CURRENT_DATE=$(date +%Y-%m-%d)
CURRENT_TIME=$(date -Iseconds)

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
# 主逻辑
# ========================
INDEX_JSON=$(check_index)
L2_JSON=$(check_l2)
L3_JSON=$(check_l3)

# 构建输出
cat << EOF
{
  "check_type": "medium",
  "check_time": "$CURRENT_TIME",
  "index": $INDEX_JSON,
  "l2": $L2_JSON,
  "l3": $L3_JSON
}
EOF

# 保存状态
cat > "$LAST_CHECK" << EOF
{
  "check_time": "$CURRENT_TIME",
  "l2": $L2_JSON
}
EOF