#!/bin/bash
# Heartbeat Check - Full Version v4
# 功能：全量检查 + 昨日状态检测 + 日终任务判断
# 频率：日终 23:00
# 注意：此脚本只检测，无副作用（不修改任何文件）
# V4变更：增加昨日状态检测，支持异常关闭遗漏补执行

set -e

# ========================
# 配置
# ========================
WORKSPACE="${WORKSPACE:-$HOME/.openclaw/workspace}"
MEMORY_CORE="$WORKSPACE/memory/memory-core"
MEMORY_DIR="$WORKSPACE/memory"
STATE_DIR="$MEMORY_DIR/.heartbeat"
LAST_CHECK="$STATE_DIR/last-full.json"
EXTRA_DIR="${EXTRA_BASE_PATH:-${HOME}/dialogue-logs}"

CURRENT_DATE=$(date +%Y-%m-%d)
CURRENT_TIME=$(date -Iseconds)
CURRENT_TS=$(date +%s)
YEAR=$(date +%Y)
MONTH=$(date +%m)
WEEK=$(date +%V)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)

# 计算昨日日期
YESTERDAY_DATE=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -d "-1 day" +%Y-%m-%d)
YESTERDAY_YEAR=$(date -d "yesterday" +%Y 2>/dev/null || date -d "-1 day" +%Y)
YESTERDAY_MONTH=$(date -d "yesterday" +%m 2>/dev/null || date -d "-1 day" +%m)

# 计算周末日期（本周日）
WEEKEND_DATE=$(date -d "next Sunday" +%Y-%m-%d 2>/dev/null || date -d "Sunday" +%Y-%m-%d)
WEEKEND_YEAR=$(date -d "next Sunday" +%Y 2>/dev/null || date -d "Sunday" +%Y)
WEEKEND_WEEK=$(date -d "next Sunday" +%V 2>/dev/null || date -d "Sunday" +%V)

# 计算月末日期
LAST_DAY_OF_MONTH=$(date -d "$(date -d 'next month' +%Y-%m-01) -1 day" +%Y-%m-%d 2>/dev/null || date -d "$(date -d 'next month' +%Y-%m-01) -1 day" +%Y-%m-%d)
LAST_DAY_OF_MONTH_YEAR=$(date -d "$(date -d 'next month' +%Y-%m-01) -1 day" +%Y 2>/dev/null || date -d "$(date -d 'next month' +%Y-%m-01) -1 day" +%Y)
LAST_DAY_OF_MONTH_MONTH=$(date -d "$(date -d 'next month' +%Y-%m-01) -1 day" +%m 2>/dev/null || date -d "$(date -d 'next month' +%Y-%m-01) -1 day" +%m)

# 计算年末日期
LAST_DAY_OF_YEAR="$YEAR-12-31"

mkdir -p "$STATE_DIR"

# ========================
# L3 统计
# ========================
check_l3() {
    local deep=$(find "$MEMORY_CORE/deep-dialogue" -name "*.md" -type f 2>/dev/null | wc -l)
    local work=$(find "$MEMORY_CORE/work-dialogue" -name "*.md" -type f 2>/dev/null | wc -l)
    local daily=$(find "$MEMORY_CORE/daily-dialogue" -name "*.md" -type f 2>/dev/null | wc -l)
    local diary=$(find "$MEMORY_CORE/diary" -name "*.md" -type f 2>/dev/null | wc -l)
    
    echo "{\"deep\": $deep, \"work\": $work, \"daily\": $daily, \"diary\": $diary, \"total\": $((deep + work + daily + diary))}"
}

# ========================
# INDEX 一致性
# ========================
check_index() {
    # 排除 diary/ 目录（diary 不参与 INDEX）
    local file_count=$(find "$MEMORY_CORE" -name "*.md" -type f \
        ! -name "INDEX.md" ! -name "README.md" ! -name "PRIORITY.md" \
        ! -path "*/diary/*" 2>/dev/null | wc -l)
    local index_count=$(grep -oE '\[[^]]+\]\([^)]+\.md\)' "$MEMORY_CORE/INDEX.md" 2>/dev/null | grep -v "INDEX.md" | wc -l)
    local consistent=false
    [ "$file_count" -eq "$index_count" ] && consistent=true
    
    echo "{\"file_count\": $file_count, \"index_count\": $index_count, \"consistent\": $consistent}"
}

# ========================
# 日记状态（支持指定日期）
# ========================
check_diary_for_date() {
    local target_date="$1"
    local target_year="$2"
    local target_month="$3"
    
    local diary_file="$MEMORY_CORE/diary/$target_year/$target_month/$target_date.md"
    local exists=false
    local last_update="null"
    
    if [ -f "$diary_file" ]; then
        exists=true
        last_update="\"$(date -Iseconds -r "$diary_file")\""
    fi
    
    echo "{\"exists\": $exists, \"last_update\": $last_update}"
}

check_diary() {
    check_diary_for_date "$CURRENT_DATE" "$YEAR" "$MONTH"
}

# ========================
# L4 状态（V3.6 升级 - 检测整个身份层）
# ========================
check_l4_file() {
    local file_path="$1"
    local exists=false
    local last_update="null"
    local days_old=0
    
    if [ -f "$file_path" ]; then
        exists=true
        local mod_ts=$(stat -c %Y "$file_path" 2>/dev/null || echo "0")
        local now_ts=$(date +%s)
        last_update="\"$(date -Iseconds -d "@$mod_ts")\""
        days_old=$(( (now_ts - mod_ts) / 86400 ))
    fi
    
    echo "{\"exists\": $exists, \"last_update\": $last_update, \"days_old\": $days_old}"
}

check_l4() {
    local soul_file="$WORKSPACE/SOUL.md"
    local identity_file="$WORKSPACE/IDENTITY.md"
    local user_file="$WORKSPACE/USER.md"
    local memory_file="$WORKSPACE/MEMORY.md"
    local agents_file="$WORKSPACE/AGENTS.md"
    
    local soul_json=$(check_l4_file "$soul_file")
    local identity_json=$(check_l4_file "$identity_file")
    local user_json=$(check_l4_file "$user_file")
    local memory_json=$(check_l4_file "$memory_file")
    local agents_json=$(check_l4_file "$agents_file")
    
    # 提取各文件更新时间（保持 JSON 字符串格式）
    local soul_updated=$(echo "$soul_json" | jq -c '.last_update')
    local identity_updated=$(echo "$identity_json" | jq -c '.last_update')
    local user_updated=$(echo "$user_json" | jq -c '.last_update')
    local memory_updated=$(echo "$memory_json" | jq -c '.last_update')
    local agents_updated=$(echo "$agents_json" | jq -c '.last_update')
    
    # 计算最老的文件天数
    local soul_days=$(echo "$soul_json" | jq -r '.days_old')
    local identity_days=$(echo "$identity_json" | jq -r '.days_old')
    local user_days=$(echo "$user_json" | jq -r '.days_old')
    local memory_days=$(echo "$memory_json" | jq -r '.days_old')
    local agents_days=$(echo "$agents_json" | jq -r '.days_old')
    
    local oldest_days=$soul_days
    [ "$identity_days" -gt "$oldest_days" ] && oldest_days=$identity_days
    [ "$user_days" -gt "$oldest_days" ] && oldest_days=$user_days
    [ "$memory_days" -gt "$oldest_days" ] && oldest_days=$memory_days
    [ "$agents_days" -gt "$oldest_days" ] && oldest_days=$agents_days
    
    cat << EOF
{
  "soul_updated": $soul_updated,
  "identity_updated": $identity_updated,
  "user_updated": $user_updated,
  "memory_updated": $memory_updated,
  "agents_updated": $agents_updated,
  "oldest_days": $oldest_days
}
EOF
}

# ========================
# L2 状态（支持指定日期）
# ========================
check_l2_for_date() {
    local target_date="$1"
    local l2_file="$MEMORY_DIR/$target_date.md"
    
    local exists=false
    local has_handover=false
    local has_content=false
    local lines=0
    local last_update="null"
    
    if [ -f "$l2_file" ]; then
        exists=true
        lines=$(wc -l < "$l2_file" 2>/dev/null || echo "0")
        last_update="\"$(date -Iseconds -r "$l2_file")\""
        
        # 检查是否有跨日交接部分
        if grep -q "## 📋 跨日交接" "$l2_file" 2>/dev/null; then
            has_handover=true
        fi
        
        # 检查是否有实际内容（排除空模板）
        # 空模板特征：只有标题和"无会话记录"/"当日无会话"
        if [ "$lines" -gt 30 ] || grep -qvE "^(#|>|_当日无|_无||\*创建|---)" "$l2_file" 2>/dev/null; then
            has_content=true
        fi
    fi
    
    echo "{\"exists\": $exists, \"has_handover\": $has_handover, \"has_content\": $has_content, \"lines\": $lines, \"last_update\": $last_update}"
}

check_l2_handover() {
    check_l2_for_date "$CURRENT_DATE"
}

# ========================
# D层锚点：L2 格式校验（V3.8.8-beta3 D层）
# ========================
check_l2_format() {
    local l2_file="$MEMORY_DIR/$CURRENT_DATE.md"
    local format_valid=true
    local issues_json="[]"

    if [ ! -f "$l2_file" ]; then
        format_valid=false
        issues_json="[\"L2文件不存在\"]"
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
# EXTRA 今日对话检查（V3.7新增，V3.8修复：支持.txt格式）
# ========================
check_extra_for_date() {
    local target_date="$1"
    local extra_dir="$EXTRA_DIR/$YEAR/$MONTH/$target_date"
    
    local exists=false
    local file_count=0
    local has_content=false
    
    if [ -d "$extra_dir" ]; then
        exists=true
        # 支持 .md 和 .txt 格式
        file_count=$(find "$extra_dir" -type f \( -name "*.md" -o -name "*.txt" \) 2>/dev/null | wc -l)
        # 检查是否有实际内容（文件大小 > 1KB）
        if [ "$file_count" -gt 0 ]; then
            local total_size=$(du -sb "$extra_dir" 2>/dev/null | cut -f1)
            if [ "$total_size" -gt 1024 ]; then
                has_content=true
            fi
        fi
    fi
    
    echo "{\"exists\": $exists, \"file_count\": $file_count, \"has_content\": $has_content}"
}

# ========================
# 日终任务状态（支持指定日期）
# ========================
check_end_task_for_date() {
    local target_date="$1"
    local target_year="$2"
    local target_month="$3"
    
    local l2_file="$MEMORY_DIR/$target_date.md"
    local diary_file="$MEMORY_CORE/diary/$target_year/$target_month/$target_date.md"
    
    local l2_exists=false
    local l2_has_handover=false
    local l2_has_content=false
    local diary_exists=false
    local extra_has_content=false
    
    # 检查 L2
    local l2_json=$(check_l2_for_date "$target_date")
    l2_exists=$(echo "$l2_json" | jq -r '.exists')
    l2_has_handover=$(echo "$l2_json" | jq -r '.has_handover')
    l2_has_content=$(echo "$l2_json" | jq -r '.has_content')
    
    # 检查日记
    local diary_json=$(check_diary_for_date "$target_date" "$target_year" "$target_month")
    diary_exists=$(echo "$diary_json" | jq -r '.exists')
    
    # 检查 EXTRA（V3.7新增）
    local extra_json=$(check_extra_for_date "$target_date")
    extra_has_content=$(echo "$extra_json" | jq -r '.has_content')
    
    # 判断状态
    local status="unknown"
    local needs_action=false
    
    # 完成状态：L2有内容 + 有跨日交接 + 有日记
    if [ "$l2_exists" = "true" ] && [ "$l2_has_content" = "true" ] && [ "$l2_has_handover" = "true" ] && [ "$diary_exists" = "true" ]; then
        status="completed"
        needs_action=false
    # 待执行状态：L2有内容，但缺少跨日交接或日记
    elif [ "$l2_exists" = "true" ] && [ "$l2_has_content" = "true" ]; then
        if [ "$l2_has_handover" = "false" ] || [ "$diary_exists" = "false" ]; then
            status="pending"
            needs_action=true
        fi
    # V3.7新增：EXTRA有今日对话但L2不存在 → 待执行
    elif [ "$extra_has_content" = "true" ] && [ "$l2_exists" = "false" ]; then
        status="pending"
        needs_action=true
    # 无会话状态：无L2、无EXTRA内容
    elif [ "$l2_exists" = "false" ] && [ "$extra_has_content" = "false" ]; then
        status="no_session"
        needs_action=false
    fi
    
    echo "{\"status\": \"$status\", \"needs_action\": $needs_action, \"l2_exists\": $l2_exists, \"l2_has_handover\": $l2_has_handover, \"l2_has_content\": $l2_has_content, \"diary_exists\": $diary_exists, \"extra_has_content\": $extra_has_content}"
}

check_end_task_status() {
    check_end_task_for_date "$CURRENT_DATE" "$YEAR" "$MONTH"
}

# ========================
# 昨日状态检测（V4新增）
# ========================
check_yesterday_status() {
    check_end_task_for_date "$YESTERDAY_DATE" "$YESTERDAY_YEAR" "$YESTERDAY_MONTH"
}


# ========================
# 周/月/年末检测（V3.5 新增 - 长期记忆凝练机制）
# ========================
check_week_end() {
    # 检查是否为周末（周日=7）
    local is_weekend=false
    local week_num="$WEEK"
    local week_year="$YEAR"
    
    if [ "$DAY_OF_WEEK" -eq 7 ]; then
        is_weekend=true
    fi
    
    # 检查周记忆文件是否存在
    local weekly_dir="$MEMORY_CORE/weekly/$week_year"
    local weekly_file="$weekly_dir/${week_year}-W${week_num}.md"
    local weekly_exists=false
    
    if [ -f "$weekly_file" ]; then
        weekly_exists=true
    fi
    
    # V3.6 新增：判断是否需要周记忆凝练
    local needs_weekly_consolidation=false
    if [ "$is_weekend" = "true" ] && [ "$weekly_exists" = "false" ]; then
        needs_weekly_consolidation=true
    fi
    
    echo "{\"is_weekend\": $is_weekend, \"day_of_week\": $DAY_OF_WEEK, \"week_num\": \"$week_num\", \"week_year\": \"$week_year\", \"weekly_file_exists\": $weekly_exists, \"weekly_file_path\": \"$weekly_file\", \"needs_weekly_consolidation\": $needs_weekly_consolidation}"
}

# ========================
# L4 凝练检测（V3.6 新增）
# ========================
check_l4_consolidation() {
    local needs_l4_update=false
    local reason="none"
    
    # 读取周终状态
    local week_end_json=$(check_week_end)
    local is_weekend=$(echo "$week_end_json" | jq -r '.is_weekend')
    local weekly_exists=$(echo "$week_end_json" | jq -r '.weekly_file_exists')
    
    # 读取 L4 状态
    local l4_json=$(check_l4)
    local oldest_days=$(echo "$l4_json" | jq -r '.oldest_days')
    
    # 判断是否需要 L4 凝练
    # 条件 1: 周末且周记忆已生成 → 需要 L4 凝练
    if [ "$is_weekend" = "true" ] && [ "$weekly_exists" = "true" ]; then
        needs_l4_update=true
        reason="weekly_new"
    # 条件 2: L4 老化超过 7 天 → 需要 L4 凝练
    elif [ "$oldest_days" -gt 7 ]; then
        needs_l4_update=true
        reason="l4_aged"
    fi
    
    cat << EOF
{
  "needs_l4_update": $needs_l4_update,
  "reason": "$reason"
}
EOF
}

check_month_end() {
    # 检查是否为月末
    local is_month_end=false
    local month_num="$MONTH"
    local month_year="$YEAR"
    
    if [ "$CURRENT_DATE" = "$LAST_DAY_OF_MONTH" ]; then
        is_month_end=true
    fi
    
    # 检查月记忆文件是否存在
    local monthly_dir="$MEMORY_CORE/monthly/$month_year"
    local monthly_file="$monthly_dir/${month_year}-${month_num}.md"
    local monthly_exists=false
    
    if [ -f "$monthly_file" ]; then
        monthly_exists=true
    fi

    # D层锚点：统计本月 weekly 文件完成数量
    local weeks_done=0
    local weeks_total=0
    local days_in_month=$(date -d "$(date -d "next month" +%Y-%m-01) -1 day" +%d 2>/dev/null || date -d "$(date -d "next month" +%Y-%m-01) -1 day" +%d)
    # 计算本月覆盖的 ISO 周数（用 Python 或内联 jq 过于复杂，简化为 4-5 周）
    local weeks_estimated=0
    for d in $(seq 1 $days_in_month); do
        local dt="${month_year}-${month_num}-$(printf '%02d' $d)"
        local wn=$(date -d "$dt" +%V 2>/dev/null || echo "")
        if [ -n "$wn" ]; then
            local wf="$MEMORY_CORE/weekly/$month_year/${month_year}-W${wn}.md"
            if [ -f "$wf" ]; then
                weeks_done=$((weeks_done + 1))
            fi
            weeks_total=$((weeks_total + 1))
        fi
    done
    # 去重：每周只计一次
    local weekly_completion_ok=false
    local all_weeklies_ready=false
    # 简化：检查是否所有周都有文件
    local unique_weeks_ok=0
    local seen_weeks=""
    for d in $(seq 1 $days_in_month); do
        local dt="${month_year}-${month_num}-$(printf '%02d' $d)"
        local wn=$(date -d "$dt" +%V 2>/dev/null || echo "")
        if [ -n "$wn" ] && ! echo "$seen_weeks" | grep -qw "$wn"; then
            seen_weeks="$seen_weeks $wn"
            local wf="$MEMORY_CORE/weekly/$month_year/${month_year}-W${wn}.md"
            if [ -f "$wf" ]; then
                unique_weeks_ok=$((unique_weeks_ok + 1))
            fi
        fi
    done
    local unique_weeks_count=$(echo "$seen_weeks" | wc -w)
    if [ "$unique_weeks_ok" -eq "$unique_weeks_count" ] && [ "$unique_weeks_count" -gt 0 ]; then
        all_weeklies_ready=true
    fi
    
    echo "{\"is_month_end\": $is_month_end, \"current_date\": \"$CURRENT_DATE\", \"last_day_of_month\": \"$LAST_DAY_OF_MONTH\", \"month_num\": \"$month_num\", \"month_year\": \"$month_year\", \"monthly_file_exists\": $monthly_exists, \"monthly_file_path\": \"$monthly_file\", \"weekly_completion\": {\"weeks_done\": $unique_weeks_ok, \"weeks_total\": $unique_weeks_count, \"all_weeklies_ready\": $all_weeklies_ready}}"
}

check_year_end() {
    # 检查是否为年末
    local is_year_end=false
    local year_num="$YEAR"
    
    if [ "$CURRENT_DATE" = "$LAST_DAY_OF_YEAR" ]; then
        is_year_end=true
    fi
    
    # 检查年记忆文件是否存在
    local yearly_dir="$MEMORY_CORE/yearly"
    local yearly_file="$yearly_dir/${year_num}.md"
    local yearly_exists=false
    
    if [ -f "$yearly_file" ]; then
        yearly_exists=true
    fi

    # D层锚点：统计本年 monthly 文件完成数量（1月～当前月）
    local months_done=0
    local months_total=$((10#$MONTH))  # 当前月（1-based）
    local all_monthlies_ready=false
    for m in $(seq 1 $months_total); do
        local mn=$(printf '%02d' $m)
        local mf="$MEMORY_CORE/monthly/$year_num/${year_num}-${mn}.md"
        if [ -f "$mf" ]; then
            months_done=$((months_done + 1))
        fi
    done
    if [ "$months_done" -eq "$months_total" ] && [ "$months_total" -gt 0 ]; then
        all_monthlies_ready=true
    fi
    
    echo "{\"is_year_end\": $is_year_end, \"current_date\": \"$CURRENT_DATE\", \"year_num\": \"$year_num\", \"yearly_file_exists\": $yearly_exists, \"yearly_file_path\": \"$yearly_file\", \"monthly_completion\": {\"months_done\": $months_done, \"months_total\": $months_total, \"all_monthlies_ready\": $all_monthlies_ready}}"
}

# ========================
# 日终任务综合判断（V4新增）
# ========================
determine_action() {
    local today_status=$(echo "$END_TASK_JSON" | jq -r '.status')
    local today_needs_action=$(echo "$END_TASK_JSON" | jq -r '.needs_action')
    local yesterday_status=$(echo "$YESTERDAY_JSON" | jq -r '.status')
    local yesterday_needs_action=$(echo "$YESTERDAY_JSON" | jq -r '.needs_action')
    
    local action="none"
    local target_date="none"
    local reason="unknown"
    
    if [ "$today_needs_action" = "true" ]; then
        # 今日有会话需要日终
        action="execute_today"
        target_date="$CURRENT_DATE"
        reason="today_has_session"
    elif [ "$yesterday_needs_action" = "true" ] && [ "$today_status" = "no_session" ]; then
        # 今日无会话但昨日遗漏
        action="execute_yesterday"
        target_date="$YESTERDAY_DATE"
        reason="yesterday_missed"
    elif [ "$today_status" = "completed" ]; then
        # 今日已完成
        action="none"
        target_date="none"
        reason="today_completed"
    elif [ "$today_status" = "no_session" ] && [ "$yesterday_status" = "completed" ]; then
        # 今日无会话，昨日已完成 → 不执行
        action="none"
        target_date="none"
        reason="no_session_needed"
    else
        # 其他情况
        action="none"
        target_date="none"
        reason="unknown_state"
    fi
    
    echo "{\"action\": \"$action\", \"target_date\": \"$target_date\", \"reason\": \"$reason\"}"
}

# ========================
# 主逻辑
# ========================
L3_JSON=$(check_l3)
INDEX_JSON=$(check_index)
DIARY_JSON=$(check_diary)
L4_JSON=$(check_l4)
L2_HANDOVER_JSON=$(check_l2_handover)
END_TASK_JSON=$(check_end_task_status)
YESTERDAY_JSON=$(check_yesterday_status)
WEEK_END_JSON=$(check_week_end)
L4_CONSOLIDATION_JSON=$(check_l4_consolidation)
MONTH_END_JSON=$(check_month_end)
YEAR_END_JSON=$(check_year_end)
ACTION_JSON=$(determine_action)

# D层锚点：L2 格式校验
L2_FORMAT_JSON=$(check_l2_format)

# 构建 L2 锚点（last_update + hours_stale + 格式）
L2_FILE="$MEMORY_DIR/$CURRENT_DATE.md"
L2_LAST_UPDATE="null"
L2_HOURS_STALE=0
if [ -f "$L2_FILE" ]; then
    L2_TS=$(stat -c %Y "$L2_FILE" 2>/dev/null || echo "0")
    if [ "$L2_TS" -gt 0 ]; then
        L2_LAST_UPDATE="\"$(date -Iseconds -d "@$L2_TS" 2>/dev/null || date -Iseconds)\""
        L2_HOURS_STALE=$(awk -v now="$CURRENT_TS" -v ft="$L2_TS" 'BEGIN { printf "%.1f", (now - ft) / 3600 }')
    fi
fi
L2_HS_CLEAN=$(echo "$L2_HOURS_STALE" | tr -d ' \n\r')
[ -z "$L2_HS_CLEAN" ] && L2_HS_CLEAN=0
L2_LINES=$(echo "$L2_HANDOVER_JSON" | jq -r '.lines // 0')
L2_FV=$(echo "$L2_FORMAT_JSON" | jq -r '.format_valid')
L2_FI=$(echo "$L2_FORMAT_JSON" | jq -c '.format_issues')

# D层：Weekly 锚点（V3.8.8-beta3）
WEEKLY_FILE_EXISTS=$(echo "$WEEK_END_JSON" | jq -r '.weekly_file_exists')
LAST_EOD_TIME_STR="null"
LAST_EOD_FILE="$STATE_DIR/last-eod.json"
if [ -f "$LAST_EOD_FILE" ]; then
  LAST_EOD_TS=$(jq -r '.last_eod_time // 0' "$LAST_EOD_FILE" 2>/dev/null || echo "0")
  if [ "$LAST_EOD_TS" -gt 0 ] 2>/dev/null; then
    LAST_EOD_TIME_STR="\"$(date -Iseconds -d "@$LAST_EOD_TS" 2>/dev/null || date -Iseconds)\""
  fi
fi
# days_until_monday: 周日=1, 周六=2, ..., 周一=7（但我们算距下一个周一的距离）
DAYS_UNTIL_MONDAY=$(( (8 - DAY_OF_WEEK) % 7 ))
[ "$DAYS_UNTIL_MONDAY" -eq 0 ] && DAYS_UNTIL_MONDAY=7
WEEKLY_ANCHORS_JSON=$(cat << WEOF
{
  "current_week": "W${WEEK}",
  "weekend": $([ "$DAY_OF_WEEK" -eq 7 ] && echo "true" || echo "false"),
  "last_full_eod": ${LAST_EOD_TIME_STR},
  "weekly_file_exists": $WEEKLY_FILE_EXISTS,
  "days_until_monday": $DAYS_UNTIL_MONDAY
}
WEOF
)

# 构建输出
cat << EOF
{
  "check_type": "full",
  "check_time": "$CURRENT_TIME",
  "current_date": "$CURRENT_DATE",
  "yesterday_date": "$YESTERDAY_DATE",
  "l3": $L3_JSON,
  "index": $INDEX_JSON,
  "diary": $DIARY_JSON,
  "l4_status": $L4_JSON,
  "l2_handover": $L2_HANDOVER_JSON,
  "end_task_status": $END_TASK_JSON,
  "yesterday_status": $YESTERDAY_JSON,
  "weekly_due": $WEEK_END_JSON,
  "l4_consolidation_due": $L4_CONSOLIDATION_JSON,
  "month_end": $MONTH_END_JSON,
  "year_end": $YEAR_END_JSON,
  "action": $ACTION_JSON,
  "weekly_anchors": $WEEKLY_ANCHORS_JSON,
  "protocol_anchors": {
    "l2": {
      "last_update": $L2_LAST_UPDATE,
      "hours_stale": $L2_HS_CLEAN,
      "lines": $L2_LINES,
      "format_valid": $L2_FV,
      "format_issues": $L2_FI
    }
  }
}
EOF

# 保存状态
cat > "$LAST_CHECK" << EOF
{
  "check_time": "$CURRENT_TIME",
  "current_date": "$CURRENT_DATE",
  "yesterday_date": "$YESTERDAY_DATE",
  "diary": $DIARY_JSON,
  "l4_status": $L4_JSON,
  "l2_handover": $L2_HANDOVER_JSON,
  "end_task_status": $END_TASK_JSON,
  "yesterday_status": $YESTERDAY_JSON,
  "weekly_due": $WEEK_END_JSON,
  "l4_consolidation_due": $L4_CONSOLIDATION_JSON,
  "month_end": $MONTH_END_JSON,
  "year_end": $YEAR_END_JSON,
  "action": $ACTION_JSON
}
EOF

# ========================
# 提示信息（基于综合判断）
# ========================
ACTION=$(echo "$ACTION_JSON" | jq -r '.action')
TARGET_DATE=$(echo "$ACTION_JSON" | jq -r '.target_date')
REASON=$(echo "$ACTION_JSON" | jq -r '.reason')

INDEX_CONSISTENT=$(echo "$INDEX_JSON" | jq -r '.consistent')

# 日终任务行动提示
case "$ACTION" in
    "execute_today")
        echo ""
        echo "⏳ 今日有会话需要日终，执行日期: $TARGET_DATE"
        echo "   请按 HEARTBEAT.md 日终流程执行"
        ;;
    "execute_yesterday")
        echo ""
        echo "🔄 检测到昨日日终遗漏，补执行日期: $TARGET_DATE"
        echo "   请按 HEARTBEAT.md 日终流程补执行昨日的遗漏部分"
        ;;
    "none")
        case "$REASON" in
            "today_completed")
                echo ""
                echo "✅ 今日日终任务已执行，无需操作"
                ;;
            "no_session_needed")
                echo ""
                echo "📭 今日无会话且昨日日终已完成，无需执行日终任务"
                ;;
            "unknown_state")
                echo ""
                echo "⚠️ 状态未知，请手动检查"
                ;;
        esac
        ;;
esac
# 长期记忆凝练提醒（V3.5 新增）
WEEKEND=$(echo "$WEEK_END_JSON" | jq -r '.is_weekend')
WEEKLY_EXISTS=$(echo "$WEEK_END_JSON" | jq -r '.weekly_file_exists')
WEEK_NUM=$(echo "$WEEK_END_JSON" | jq -r '.week_num')
WEEK_YEAR=$(echo "$WEEK_END_JSON" | jq -r '.week_year')
NEEDS_WEEKLY=$(echo "$WEEK_END_JSON" | jq -r '.needs_weekly_consolidation')

MONTH_END=$(echo "$MONTH_END_JSON" | jq -r '.is_month_end')
MONTHLY_EXISTS=$(echo "$MONTH_END_JSON" | jq -r '.monthly_file_exists')
MONTH_NUM=$(echo "$MONTH_END_JSON" | jq -r '.month_num')
MONTH_YEAR=$(echo "$MONTH_END_JSON" | jq -r '.month_year')

YEAR_END=$(echo "$YEAR_END_JSON" | jq -r '.is_year_end')
YEARLY_EXISTS=$(echo "$YEAR_END_JSON" | jq -r '.yearly_exists')

# V3.6 L4 凝练状态
NEEDS_L4_UPDATE=$(echo "$L4_CONSOLIDATION_JSON" | jq -r '.needs_l4_update')
L4_REASON=$(echo "$L4_CONSOLIDATION_JSON" | jq -r '.reason')
L4_OLDEST_DAYS=$(echo "$L4_JSON" | jq -r '.oldest_days')

echo ""
echo "🕰️  长期记忆凝练状态："

# 周记忆提醒
if [ "$WEEKEND" = "true" ]; then
    if [ "$WEEKLY_EXISTS" = "true" ]; then
        echo "   📅 周记忆 (${WEEK_YEAR}-W${WEEK_NUM}) 已存在"
    else
        echo "   📅 本周末，建议执行周记忆凝练：${WEEK_YEAR}-W${WEEK_NUM}"
        echo "      位置：memory-core/weekly/${WEEK_YEAR}/${WEEK_YEAR}-W${WEEK_NUM}.md"
    fi
else
    echo "   📅 周记忆：非周末（周${DAY_OF_WEEK}）"
fi

# 月记忆提醒
if [ "$MONTH_END" = "true" ]; then
    if [ "$MONTHLY_EXISTS" = "true" ]; then
        echo "   📅 月记忆 (${MONTH_YEAR}-${MONTH_NUM}) 已存在"
    else
        echo "   📅 本月末，建议执行月记忆凝练：${MONTH_YEAR}-${MONTH_NUM}"
        echo "      位置：memory-core/monthly/${MONTH_YEAR}/${MONTH_YEAR}-${MONTH_NUM}.md"
    fi
else
    echo "   📅 月记忆：非月末"
fi

# 年记忆提醒
if [ "$YEAR_END" = "true" ]; then
    if [ "$YEARLY_EXISTS" = "true" ]; then
        echo "   📅 年记忆 (${YEAR}) 已存在"
    else
        echo "   📅 年末，建议执行年记忆凝练：${YEAR}"
        echo "      位置：memory-core/yearly/${YEAR}.md"
    fi
else
    echo "   📅 年记忆：非年末"
fi

# V3.6 L4 凝练状态提醒
echo ""
echo "🧠 L4 身份层凝练状态（V3.6）："
if [ "$NEEDS_L4_UPDATE" = "true" ]; then
    echo "   ⚠️  需要 L4 凝练更新"
    echo "      原因：$L4_REASON"
    if [ "$L4_REASON" = "weekly_new" ]; then
        echo "      操作：读取周记忆摘要，按分发矩阵更新 L4 各文件"
    elif [ "$L4_REASON" = "l4_aged" ]; then
        echo "      操作：L4 已${L4_OLDEST_DAYS}天未更新，检查是否需要凝练"
    fi
    echo "      目标文件：SOUL.md, IDENTITY.md, USER.md, MEMORY.md, AGENTS.md"
else
    echo "   ✅ L4 状态正常，无需凝练"
    echo "      L4 最老文件：${L4_OLDEST_DAYS}天前更新"
fi
