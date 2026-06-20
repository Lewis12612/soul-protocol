#!/bin/bash
# 清理检查脚本 V3.65
# 功能：检测需要归档的记忆文件
# 输出：JSON 数据，agent 判断是否需要执行清理

set -e

WORKSPACE="${WORKSPACE:-$HOME/.openclaw/workspace}"
MEMORY_CORE="$WORKSPACE/memory/memory-core"
CURRENT_DATE=$(date +%Y-%m-%d)

# 时间衰减阈值（天）
DEEP_THRESHOLD=90
WORK_THRESHOLD=60
DAILY_THRESHOLD=30
WEEKLY_THRESHOLD=90
MONTHLY_THRESHOLD=365

# ========================
# 时间衰减检查
# ========================
deep_to_archive=$(find "$MEMORY_CORE/deep-dialogue" -name "*.md" -type f -mtime +$DEEP_THRESHOLD 2>/dev/null | wc -l || echo 0)
work_to_archive=$(find "$MEMORY_CORE/work-dialogue" -name "*.md" -type f -mtime +$WORK_THRESHOLD 2>/dev/null | wc -l || echo 0)
daily_to_archive=$(find "$MEMORY_CORE/daily-dialogue" -name "*.md" -type f -mtime +$DAILY_THRESHOLD 2>/dev/null | wc -l || echo 0)
weekly_to_archive=$(find "$MEMORY_CORE/weekly" -name "*.md" -type f -mtime +$WEEKLY_THRESHOLD 2>/dev/null | wc -l || echo 0)
monthly_to_archive=$(find "$MEMORY_CORE/monthly" -name "*.md" -type f -mtime +$MONTHLY_THRESHOLD 2>/dev/null | wc -l || echo 0)

# ========================
# 容量检查
# ========================
deep_count=$(find "$MEMORY_CORE/deep-dialogue" -name "*.md" -type f 2>/dev/null | wc -l || echo 0)
work_count=$(find "$MEMORY_CORE/work-dialogue" -name "*.md" -type f 2>/dev/null | wc -l || echo 0)
daily_count=$(find "$MEMORY_CORE/daily-dialogue" -name "*.md" -type f 2>/dev/null | wc -l || echo 0)
weekly_count=$(find "$MEMORY_CORE/weekly" -name "*.md" -type f 2>/dev/null | wc -l || echo 0)
monthly_count=$(find "$MEMORY_CORE/monthly" -name "*.md" -type f 2>/dev/null | wc -l || echo 0)

total_count=$((deep_count + work_count + daily_count + weekly_count + monthly_count))
total_to_archive=$((deep_to_archive + work_to_archive + daily_to_archive + weekly_to_archive + monthly_to_archive))

# 容量超限检查
capacity_exceeded=false
[ $total_count -gt 100 ] && capacity_exceeded=true

# ========================
# 输出
# ========================
cat << EOF
{
  "check_type": "cleanup",
  "check_time": "$(date -Iseconds)",
  "thresholds": {
    "deep_days": $DEEP_THRESHOLD,
    "work_days": $WORK_THRESHOLD,
    "daily_days": $DAILY_THRESHOLD,
    "weekly_days": $WEEKLY_THRESHOLD,
    "monthly_days": $MONTHLY_THRESHOLD
  },
  "to_archive": {
    "deep": $deep_to_archive,
    "work": $work_to_archive,
    "daily": $daily_to_archive,
    "weekly": $weekly_to_archive,
    "monthly": $monthly_to_archive,
    "total": $total_to_archive
  },
  "capacity": {
    "deep": $deep_count,
    "work": $work_count,
    "daily": $daily_count,
    "weekly": $weekly_count,
    "monthly": $monthly_count,
    "total": $total_count,
    "exceeded": $capacity_exceeded
  },
  "needs_cleanup": $([[ $total_to_archive -gt 0 || $capacity_exceeded == true ]] && echo true || echo false)
}
EOF