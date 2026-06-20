#!/bin/bash
# Consistency Check - V3.6 防断点检测
# 功能：检测 L3/L4 一致性、状态标记覆盖率、AGENTS.md 行为一致性
# 频率：周终任务前执行
# 注意：此脚本只检测，无副作用（不修改任何文件）

set -e

# ========================
# 配置
# ========================
WORKSPACE="${WORKSPACE:-$HOME/.openclaw/workspace}"
MEMORY_CORE="$WORKSPACE/memory/memory-core"
MEMORY_DIR="$WORKSPACE/memory"

CURRENT_DATE=$(date +%Y-%m-%d)
CURRENT_TIME=$(date -Iseconds)

# ========================
# L3 状态标记覆盖率检测
# ========================
check_l3_status_markers() {
    local deep_dir="$MEMORY_CORE/deep-dialogue"
    local total_files=0
    local marked_files=0
    local unmarked_files=""
    
    # 检查 deep-dialogue 中所有文件
    for file in "$deep_dir"/*.md; do
        [ -f "$file" ] || continue
        total_files=$((total_files + 1))
        
        # 检查是否有状态标记（已验证/理论探索/demo）
        if grep -qE "（已验证）|（理论探索）|（demo）" "$file" 2>/dev/null; then
            marked_files=$((marked_files + 1))
        else
            # 检查是否有关键领悟部分但无状态标记
            if grep -q "## 💡 关键领悟" "$file" 2>/dev/null; then
                unmarked_files="$unmarked_files\n  - $(basename "$file")"
            fi
        fi
    done
    
    local coverage_rate=0
    if [ "$total_files" -gt 0 ]; then
        coverage_rate=$((marked_files * 100 / total_files))
    fi
    
    cat << EOF
{
  "total_deep_files": $total_files,
  "marked_files": $marked_files,
  "coverage_rate": $coverage_rate,
  "unmarked_critical_files": "$(echo -e "$unmarked_files")"
}
EOF
}

# ========================
# L4 文件老化状态检测
# ========================
check_l4_aging() {
    local soul_file="$WORKSPACE/SOUL.md"
    local identity_file="$WORKSPACE/IDENTITY.md"
    local user_file="$WORKSPACE/USER.md"
    local memory_file="$WORKSPACE/MEMORY.md"
    local agents_file="$WORKSPACE/AGENTS.md"
    
    local now_ts=$(date +%s)
    local threshold_days=30
    local warning_days=7
    
    check_file_age() {
        local file_path="$1"
        local file_name="$2"
        local days_old=0
        
        if [ -f "$file_path" ]; then
            local mod_ts=$(stat -c %Y "$file_path" 2>/dev/null || echo "$now_ts")
            days_old=$(( (now_ts - mod_ts) / 86400 ))
        else
            days_old=999
        fi
        
        local status="ok"
        if [ "$days_old" -gt "$threshold_days" ]; then
            status="critical"
        elif [ "$days_old" -gt "$warning_days" ]; then
            status="warning"
        fi
        
        echo "{\"file\": \"$file_name\", \"days_old\": $days_old, \"status\": \"$status\"}"
    }
    
    local soul_age=$(check_file_age "$soul_file" "SOUL.md")
    local identity_age=$(check_file_age "$identity_file" "IDENTITY.md")
    local user_age=$(check_file_age "$user_file" "USER.md")
    local memory_age=$(check_file_age "$memory_file" "MEMORY.md")
    local agents_age=$(check_file_age "$agents_file" "AGENTS.md")
    
    # 统计老化文件数量
    local critical_count=0
    local warning_count=0
    
    for age_json in "$soul_age" "$identity_age" "$user_age" "$memory_age" "$agents_age"; do
        local status=$(echo "$age_json" | jq -r '.status')
        if [ "$status" = "critical" ]; then
            critical_count=$((critical_count + 1))
        elif [ "$status" = "warning" ]; then
            warning_count=$((warning_count + 1))
        fi
    done
    
    cat << EOF
{
  "files": [
    $soul_age,
    $identity_age,
    $user_age,
    $memory_age,
    $agents_age
  ],
  "critical_count": $critical_count,
  "warning_count": $warning_count,
  "threshold_days": $threshold_days,
  "warning_days": $warning_days
}
EOF
}

# ========================
# AGENTS.md 和实际行为一致性检测
# ========================
check_agents_consistency() {
    local agents_file="$WORKSPACE/AGENTS.md"
    local memory_core_index="$MEMORY_CORE/INDEX.md"
    local priority_file="$MEMORY_CORE/PRIORITY.md"
    
    local issues=""
    local consistency_score=100
    
    # 检查 1: AGENTS.md 是否存在
    if [ ! -f "$agents_file" ]; then
        issues="$issues\n  - AGENTS.md 不存在"
        consistency_score=$((consistency_score - 50))
    fi
    
    # 检查 2: AGENTS.md 提到的读取顺序是否与实际文件一致
    if [ -f "$agents_file" ]; then
        # 检查是否提到 SESSION-STATE.md
        if ! grep -q "SESSION-STATE" "$agents_file" 2>/dev/null; then
            issues="$issues\n  - AGENTS.md 未提及 SESSION-STATE.md 读取"
            consistency_score=$((consistency_score - 10))
        fi
        
        # 检查是否提到 memory-core/INDEX.md
        if ! grep -q "INDEX.md" "$agents_file" 2>/dev/null; then
            issues="$issues\n  - AGENTS.md 未提及 INDEX.md 读取"
            consistency_score=$((consistency_score - 10))
        fi
        
        # 检查是否提到 P0-P4 优先级
        if ! grep -qE "P[0-8]" "$agents_file" 2>/dev/null; then
            issues="$issues\n  - AGENTS.md 未定义加载优先级"
            consistency_score=$((consistency_score - 10))
        fi
    fi
    
    # 检查 3: INDEX.md 是否存在
    if [ ! -f "$memory_core_index" ]; then
        issues="$issues\n  - INDEX.md 不存在"
        consistency_score=$((consistency_score - 20))
    fi
    
    # 检查 4: PRIORITY.md 是否存在
    if [ ! -f "$priority_file" ]; then
        issues="$issues\n  - PRIORITY.md 不存在"
        consistency_score=$((consistency_score - 10))
    fi
    
    # 确保分数不低于 0
    [ "$consistency_score" -lt 0 ] && consistency_score=0
    
    local consistency_level="good"
    if [ "$consistency_score" -lt 50 ]; then
        consistency_level="critical"
    elif [ "$consistency_score" -lt 80 ]; then
        consistency_level="warning"
    fi
    
    cat << EOF
{
  "consistency_score": $consistency_score,
  "consistency_level": "$consistency_level",
  "issues": "$(echo -e "$issues")",
  "agents_exists": $([ -f "$agents_file" ] && echo "true" || echo "false"),
  "index_exists": $([ -f "$memory_core_index" ] && echo "true" || echo "false"),
  "priority_exists": $([ -f "$priority_file" ] && echo "true" || echo "false")
}
EOF
}

# ========================
# 周记忆文件存在性检测
# ========================
check_weekly_exists() {
    local current_year=$(date +%Y)
    local week_num=$(date +%V)
    local weekly_file="$MEMORY_CORE/weekly/$current_year/${current_year}-W${week_num}.md"
    
    local exists=false
    if [ -f "$weekly_file" ]; then
        exists=true
    fi
    
    echo "{\"exists\": $exists, \"file_path\": \"$weekly_file\", \"week\": \"${current_year}-W${week_num}\"}"
}

# ========================
# 主逻辑
# ========================
L3_MARKERS_JSON=$(check_l3_status_markers)
L4_AGING_JSON=$(check_l4_aging)
AGENTS_CONSISTENCY_JSON=$(check_agents_consistency)
WEEKLY_EXISTS_JSON=$(check_weekly_exists)

# 构建输出
cat << EOF
{
  "check_type": "consistency",
  "check_time": "$CURRENT_TIME",
  "current_date": "$CURRENT_DATE",
  "l3_status_markers": $L3_MARKERS_JSON,
  "l4_aging": $L4_AGING_JSON,
  "agents_consistency": $AGENTS_CONSISTENCY_JSON,
  "weekly_exists": $WEEKLY_EXISTS_JSON
}
EOF

# ========================
# 提示信息
# ========================
echo ""
echo "🔍 防断点检测结果："

# L3 状态标记
MARKER_COVERAGE=$(echo "$L3_MARKERS_JSON" | jq -r '.coverage_rate')
echo ""
echo "📌 L3 状态标记覆盖率：${MARKER_COVERAGE}%"
if [ "$MARKER_COVERAGE" -lt 80 ]; then
    echo "   ⚠️  覆盖率低于 80%，建议检查 deep-dialogue 文件的状态标记"
    unmarked=$(echo "$L3_MARKERS_JSON" | jq -r '.unmarked_critical_files')
    if [ -n "$unmarked" ] && [ "$unmarked" != "" ]; then
        echo "   未标记的文件：$unmarked"
    fi
fi

# L4 老化状态
CRITICAL_COUNT=$(echo "$L4_AGING_JSON" | jq -r '.critical_count')
WARNING_COUNT=$(echo "$L4_AGING_JSON" | jq -r '.warning_count')
echo ""
echo "📚 L4 文件老化状态："
if [ "$CRITICAL_COUNT" -gt 0 ]; then
    echo "   ⚠️  有 $CRITICAL_COUNT 个文件超过 30 天未更新（严重）"
fi
if [ "$WARNING_COUNT" -gt 0 ]; then
    echo "   ⚠️  有 $WARNING_COUNT 个文件超过 7 天未更新（警告）"
fi
if [ "$CRITICAL_COUNT" -eq 0 ] && [ "$WARNING_COUNT" -eq 0 ]; then
    echo "   ✅ L4 文件更新正常"
fi

# AGENTS.md 一致性
CONSISTENCY_SCORE=$(echo "$AGENTS_CONSISTENCY_JSON" | jq -r '.consistency_score')
CONSISTENCY_LEVEL=$(echo "$AGENTS_CONSISTENCY_JSON" | jq -r '.consistency_level')
echo ""
echo "📋 AGENTS.md 一致性检查："
echo "   一致性得分：$CONSISTENCY_SCORE/100"
echo "   等级：$CONSISTENCY_LEVEL"
if [ "$CONSISTENCY_LEVEL" != "good" ]; then
    issues=$(echo "$AGENTS_CONSISTENCY_JSON" | jq -r '.issues')
    if [ -n "$issues" ] && [ "$issues" != "" ]; then
        echo "   问题：$issues"
    fi
fi

# 周记忆文件
WEEKLY_EXISTS=$(echo "$WEEKLY_EXISTS_JSON" | jq -r '.exists')
WEEK_PATH=$(echo "$WEEKLY_EXISTS_JSON" | jq -r '.week')
echo ""
echo "📅 周记忆文件："
if [ "$WEEKLY_EXISTS" = "true" ]; then
    echo "   ✅ $WEEK_PATH 已存在"
else
    echo "   ⚠️  $WEEK_PATH 不存在，周终时需创建"
fi
