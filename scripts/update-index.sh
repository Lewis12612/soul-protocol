#!/bin/bash
# INDEX 自动更新脚本
# 功能：扫描 L3 文件，生成/更新 INDEX.md
# 触发：日终任务最后一步（归档完毕后）
# 注意：此脚本有副作用，会修改 INDEX.md

set -e

# ========================
# 配置
# ========================
WORKSPACE="${WORKSPACE:-$HOME/.openclaw/workspace}"
MEMORY_CORE="$WORKSPACE/memory/memory-core"
INDEX_FILE="$MEMORY_CORE/INDEX.md"

echo "📝 开始更新 INDEX.md..."

# ========================
# 扫描 L3 文件
# ========================
deep_files=$(find "$MEMORY_CORE/deep-dialogue" -name "*.md" -type f 2>/dev/null | sort)
work_files=$(find "$MEMORY_CORE/work-dialogue" -name "*.md" -type f 2>/dev/null | sort)
daily_files=$(find "$MEMORY_CORE/daily-dialogue" -name "*.md" -type f 2>/dev/null | sort)
weekly_files=$(find "$MEMORY_CORE/weekly" -name "*.md" -type f 2>/dev/null | sort)

# 统计
# 统计（使用 wc -l 避免 grep 退出码问题）
deep_count=$(echo "$deep_files" | wc -l | tr -d ' ')
work_count=$(echo "$work_files" | wc -l | tr -d ' ')
daily_count=$(echo "$daily_files" | wc -l | tr -d ' ')
weekly_count=$(echo "$weekly_files" | wc -l | tr -d ' ')
total=$((deep_count + work_count + daily_count + weekly_count))

# ========================
# 生成 INDEX
# ========================
tmp_index=$(mktemp)

# 头部
cat > "$tmp_index" << 'HEADER'
# 知识库索引

> 快速查找话题对应的文件位置

---

## 📂 按分类索引

### deep-dialogue/
| 日期 | 话题 | 文件 |
|------|------|------|
HEADER

# deep-dialogue 条目
for f in $deep_files; do
    [ -z "$f" ] && continue
    basename=$(basename "$f" .md)
    rel_path=$(realpath --relative-to="$MEMORY_CORE" "$f")
    date_part=$(echo "$basename" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "$basename")
    echo "| $date_part | [查看]($rel_path) |" >> "$tmp_index"
done

# work-dialogue 部分
cat >> "$tmp_index" << 'WORKHEADER'

### work-dialogue/
| 日期 | 话题 | 文件 |
|------|------|------|
WORKHEADER

for f in $work_files; do
    [ -z "$f" ] && continue
    basename=$(basename "$f" .md)
    rel_path=$(realpath --relative-to="$MEMORY_CORE" "$f")
    date_part=$(echo "$basename" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "$basename")
    echo "| $date_part | [查看]($rel_path) |" >> "$tmp_index"
done

# daily-dialogue 部分
cat >> "$tmp_index" << 'DAILYHEADER'

### daily-dialogue/
| 日期 | 话题 | 文件 |
|------|------|------|
DAILYHEADER

for f in $daily_files; do
    [ -z "$f" ] && continue
    basename=$(basename "$f" .md)
    rel_path=$(realpath --relative-to="$MEMORY_CORE" "$f")
    echo "| $basename | [查看]($rel_path) |" >> "$tmp_index"
done

# weekly 部分
cat >> "$tmp_index" << 'WEEKLYHEADER'

### weekly/
| 周次 | 文件 |
|------|------|
WEEKLYHEADER

for f in $weekly_files; do
    [ -z "$f" ] && continue
    basename=$(basename "$f" .md)
    rel_path=$(realpath --relative-to="$MEMORY_CORE" "$f")
    # 提取周次 (如 2026-W14)
    week_part=$(echo "$basename" | grep -oE '[0-9]{4}-W[0-9]{2}' || echo "$basename")
    echo "| $week_part | [查看]($rel_path) |" >> "$tmp_index"
done

# 尾部
cat >> "$tmp_index" << 'FOOTER'

---

> **注意**: diary/ 是独立的自由日记系统，不参与 INDEX 检索。

---

FOOTER

# ========================
# 备份并替换
# ========================
if [ -f "$INDEX_FILE" ]; then
    cp "$INDEX_FILE" "$INDEX_FILE.bak"
    echo "📦 已备份旧 INDEX → INDEX.md.bak"
fi

mv "$tmp_index" "$INDEX_FILE"

echo "✅ INDEX.md 更新完成"
echo "   deep-dialogue: $deep_count"
echo "   work-dialogue: $work_count"
echo "   daily-dialogue: $daily_count"
echo "   weekly: $weekly_count"
echo "   总计: $total 条目"