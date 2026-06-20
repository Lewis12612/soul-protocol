#!/bin/bash
# Heartbeat Check - Light Version v2
# 功能：检查 + 状态追踪 + 任务解析 + 增量计算
# 输出：JSON 数据，LLM 判断

set -e

# ========================
# 配置
# ========================
WORKSPACE="${WORKSPACE:-$HOME/.openclaw/workspace}"
MEMORY_DIR="$WORKSPACE/memory"
SESSION_STATE="$WORKSPACE/SESSION-STATE.md"
STATE_DIR="$MEMORY_DIR/.heartbeat"
LAST_CHECK="$STATE_DIR/last-light.json"
DAEMON_PID_FILE="${STATE_DIR:-$HOME/.openclaw}/logs/dialogue-logger.pid"

CURRENT_DATE=$(date +%Y-%m-%d)
CURRENT_TIME=$(date -Iseconds)
TODAY_TS=$(date +%s)

# 确保状态目录存在
mkdir -p "$STATE_DIR"

# ========================
# L2 检查（含增量）
# ========================
check_l2() {
    local l2_file="$MEMORY_DIR/$CURRENT_DATE.md"
    
    if [ -f "$l2_file" ]; then
        local lines=$(wc -l < "$l2_file")
        local bytes=$(wc -c < "$l2_file")
        local exists=true
        
        # 增量计算
        local new_lines=0
        local last_lines=0
        if [ -f "$LAST_CHECK" ]; then
            last_lines=$(jq '.l2.lines // 0' "$LAST_CHECK" 2>/dev/null || echo "0")
            new_lines=$((lines - last_lines))
            [ "$new_lines" -lt 0 ] && new_lines=0
        else
            new_lines=$lines
        fi
    else
        local exists=false
        local lines=0
        local bytes=0
        local new_lines=0
        local last_lines=0
    fi
    
    echo "{\"exists\": $exists, \"lines\": $lines, \"bytes\": $bytes, \"new_lines\": $new_lines, \"last_lines\": $last_lines}"
}

# ========================
# SESSION-STATE 检查（含任务解析）
# ========================
check_session_state() {
    if [ ! -f "$SESSION_STATE" ]; then
        echo "{\"exists\": false, \"is_cross_day\": false, \"days_old\": 0, \"age_hours\": 0, \"tasks\": []}"
        return
    fi
    
    # 获取文件修改时间
    local mod_ts=$(stat -c %Y "$SESSION_STATE" 2>/dev/null || echo "0")
    local age_seconds=$((TODAY_TS - mod_ts))
    local age_hours=$(awk "BEGIN {printf \"%.2f\", $age_seconds / 3600}")
    
    # 检测会话日期（从 SESSION-STATE 解析）
    local session_date=$(grep -E "^\\*\\*会话开始\\*\\*|^session_start" "$SESSION_STATE" 2>/dev/null | head -1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" || echo "$CURRENT_DATE")
    
    # 判断是否跨日
    local is_cross_day=false
    local days_old=0
    if [ "$session_date" != "$CURRENT_DATE" ]; then
        is_cross_day=true
        local session_ts=$(date -d "$session_date" +%s 2>/dev/null || echo "$TODAY_TS")
        days_old=$(( (TODAY_TS - session_ts) / 86400 ))
    fi
    
    # 解析任务列表
    local tasks="[]"
    if grep -q "## 🔄 活跃任务" "$SESSION_STATE" 2>/dev/null; then
        # 提取任务 ID、状态
        local task_id=""
        tasks=$(grep -E "^### 任务 #|^\\*\\*状态\\*\\*:" "$SESSION_STATE" | while read -r line; do
            if [[ "$line" =~ ^###\ 任务\ #([0-9]+) ]]; then
                task_id="${BASH_REMATCH[1]}"
            elif [[ "$line" =~ \*\*状态\*\*:[[:space:]]*(🔄|⏸️|✅) ]]; then
                status="${BASH_REMATCH[1]}"
                if [ -n "$task_id" ]; then
                    echo "{\"id\": \"$task_id\", \"status\": \"$status\"}"
                    task_id=""
                fi
            fi
        done | jq -s '.')
    fi
    
    echo "{\"exists\": true, \"session_date\": \"$session_date\", \"is_cross_day\": $is_cross_day, \"days_old\": $days_old, \"age_hours\": $age_hours, \"tasks\": $tasks}"
}

# ========================
# 守护进程检查
# ========================
check_daemon() {
    if [ -f "$DAEMON_PID_FILE" ]; then
        local pid=$(cat "$DAEMON_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "{\"running\": true, \"pid\": $pid}"
        else
            echo "{\"running\": false, \"pid\": 0}"
        fi
    else
        echo "{\"running\": false, \"pid\": 0}"
    fi
}

# ========================
# Medium 检查判断（每2小时）
# ========================
check_medium_due() {
    local last_medium="$STATE_DIR/last-medium.json"
    local medium_interval=7200  # 2小时 = 7200秒
    
    if [ ! -f "$last_medium" ]; then
        # 从未执行过 Medium，需要执行
        echo "{\"due\": true, \"reason\": \"never_executed\"}"
        return
    fi
    
    local last_check_time=$(jq -r '.check_time // "1970-01-01T00:00:00"' "$last_medium" 2>/dev/null)
    local last_ts=$(date -d "$last_check_time" +%s 2>/dev/null || echo "0")
    local elapsed=$((TODAY_TS - last_ts))
    
    if [ "$elapsed" -ge "$medium_interval" ]; then
        echo "{\"due\": true, \"elapsed_seconds\": $elapsed, \"last_check\": \"$last_check_time\"}"
    else
        echo "{\"due\": false, \"elapsed_seconds\": $elapsed, \"remaining_seconds\": $((medium_interval - elapsed))}"
    fi
}

# ========================
# 构建强制行动列表
# ========================
build_required_actions() {
    local actions="[]"
    local action_list=""
    
    # 行动1: 更新 SESSION-STATE（每次必做）
    action_list='{"action": "update_session_state", "reason": "heartbeat_triggered", "mandatory": true}'
    
    # 行动2: 如果 L2 不存在，创建
    if [ "$(echo $L2_JSON | jq '.exists')" = "false" ]; then
        action_list="$action_list, {\"action\": \"create_l2\", \"reason\": \"l2_not_exists\", \"mandatory\": true}"
    fi
    
    # 行动3: 如果 Medium 到期，提示
    if [ "$(echo $MEDIUM_DUE_JSON | jq '.due')" = "true" ]; then
        action_list="$action_list, {\"action\": \"execute_medium_check\", \"reason\": \"medium_overdue\", \"mandatory\": true}"
    fi
    
    echo "[$action_list]"
}

# ========================
# 主逻辑
# ========================
L2_JSON=$(check_l2)
SESSION_JSON=$(check_session_state)
DAEMON_JSON=$(check_daemon)
MEDIUM_DUE_JSON=$(check_medium_due)

REQUIRED_ACTIONS=$(build_required_actions)

# 构建输出
cat << EOF
{
  "check_type": "light",
  "check_time": "$CURRENT_TIME",
  "l2": $L2_JSON,
  "session_state": $SESSION_JSON,
  "daemon": $DAEMON_JSON,
  "medium_due": $MEDIUM_DUE_JSON,
  "required_actions": $REQUIRED_ACTIONS
}
EOF

# 保存本次检查结果（用于下次增量对比）
cat > "$LAST_CHECK" << EOF
{
  "check_time": "$CURRENT_TIME",
  "l2": $L2_JSON
}
EOF