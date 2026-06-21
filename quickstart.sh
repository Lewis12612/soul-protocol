#!/bin/bash
# soul-protocol V3.8.8-beta3 Quickstart
# Usage: bash quickstart.sh [--workspace /path/to/workspace] [--non-interactive]

set -e

# ── 参数解析 ──
WORKSPACE=""
NON_INTERACTIVE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace|-w) WORKSPACE="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=true; shift ;;
    *) echo "Usage: $0 [--workspace /path/to/workspace] [--non-interactive]"; exit 1 ;;
  esac
done

# ── 自动检测 workspace ──
if [ -z "$WORKSPACE" ]; then
  if [ -n "$OPENCLAW_WORKSPACE_DIR" ]; then
    WORKSPACE="$OPENCLAW_WORKSPACE_DIR"
  elif [ -d "$HOME/.openclaw/workspace" ]; then
    WORKSPACE="$HOME/.openclaw/workspace"
  else
    echo "❌ Could not detect workspace. Use: $0 --workspace /path/to/workspace"
    exit 1
  fi
fi

PLUGIN_DIR="$WORKSPACE/skills/soul-protocol"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${HOME:-$HOME}"
EXTRA_BASE_DEFAULT="${HOME_DIR}/dialogue-logs"
export WORKSPACE

echo "╔════════════════════════════════════════╗"
echo "║  Soul Protocol V3.8.8-beta3 Quickstart ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Workspace: $WORKSPACE"
echo "Home:      $HOME_DIR"
echo ""

# ── 交互式配置 ──
if [ "$NON_INTERACTIVE" = false ] && [ -t 0 ]; then
  echo "── 实例配置 ──"
  echo ""
  
  read -p "Agent 名称 [agent]: " AGENT_NAME
  AGENT_NAME="${AGENT_NAME:-agent}"
  
  read -p "梦 Agent 名称 [${AGENT_NAME}的梦]: " DREAM_NAME
  DREAM_NAME="${DREAM_NAME:-${AGENT_NAME}的梦}"
  
  read -p "对话日志路径 [$EXTRA_BASE_DEFAULT]: " EXTRA_PATH
  EXTRA_PATH="${EXTRA_PATH:-$EXTRA_BASE_DEFAULT}"
  
  echo ""
  echo "配置确认:"
  echo "  agentName:       $AGENT_NAME"
  echo "  dreamAgentName:  $DREAM_NAME"
  echo "  extraBasePath:   $EXTRA_PATH"
  echo "  homeDir:         $HOME_DIR  (auto)"
  echo "  workspaceDir:    $WORKSPACE  (auto)"
  echo ""
else
  # 非交互模式：从环境变量或默认值
  AGENT_NAME="${SOUL_AGENT_NAME:-agent}"
  DREAM_NAME="${SOUL_DREAM_AGENT_NAME:-${AGENT_NAME}的梦}"
  EXTRA_PATH="${SOUL_EXTRA_BASE_PATH:-$EXTRA_BASE_DEFAULT}"
  echo "── 非交互模式 ──"
  echo "  agentName:       $AGENT_NAME"
  echo "  dreamAgentName:  $DREAM_NAME"
  echo "  extraBasePath:   $EXTRA_PATH"
  echo "  homeDir:         $HOME_DIR  (auto)"
  echo "  workspaceDir:    $WORKSPACE  (auto)"
  echo ""
fi

# ── 1. 复制插件文件 ──
echo "[1/5] Copying plugin files..."
mkdir -p "$PLUGIN_DIR"
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.git' \
      --exclude='*.pid' --exclude='*.log' --exclude='openclaw.plugin.json' \
      "$SCRIPT_DIR/" "$PLUGIN_DIR/" 2>/dev/null || \
cp -r "$SCRIPT_DIR"/* "$PLUGIN_DIR/" 2>/dev/null
echo "  ✅ Plugin copied to $PLUGIN_DIR"

# ── 2. 从模板生成 openclaw.plugin.json ──
echo "[2/5] Generating plugin config..."
TEMPLATE="$SCRIPT_DIR/openclaw.plugin.json.example"
if [ -f "$TEMPLATE" ]; then
  sed -e "s|{{AGENT_NAME}}|$AGENT_NAME|g" \
      -e "s|{{DREAM_AGENT_NAME}}|$DREAM_NAME|g" \
      -e "s|{{EXTRA_BASE_PATH}}|$EXTRA_PATH|g" \
      -e "s|{{HOME_DIR}}|$HOME_DIR|g" \
      -e "s|{{WORKSPACE_DIR}}|$WORKSPACE|g" \
      "$TEMPLATE" > "$PLUGIN_DIR/openclaw.plugin.json"
  echo "  ✅ Generated openclaw.plugin.json with your config"
else
  echo "  ⚠️  Template not found at $TEMPLATE"
  echo "     Creating minimal config..."
  cat > "$PLUGIN_DIR/openclaw.plugin.json" << PLUGINEOF
{
  "id": "soul-protocol",
  "name": "Soul Protocol",
  "version": "3.8.8-beta3",
  "agentConfig": {
    "agentName": "$AGENT_NAME",
    "dreamAgentName": "$DREAM_NAME",
    "extraBasePath": "$EXTRA_PATH",
    "homeDir": "$HOME_DIR",
    "workspaceDir": "$WORKSPACE"
  }
}
PLUGINEOF
  echo "  ✅ Created minimal openclaw.plugin.json"
fi

# ── 3. OpenClaw 注册引导 ──
echo "[3/5] OpenClaw registration..."
echo "  Add to your openclaw.json:"
echo ""
echo '  "plugins": {'
echo '    "load": {'
echo '      "paths": ["'"$PLUGIN_DIR"'"]'
echo '    },'
echo '    "allow": ["soul-protocol"]'
echo '  }'
echo ""

# ── 4. 初始化心跳状态 ──
echo "[4/5] Initializing heartbeat state..."
mkdir -p "$WORKSPACE/memory/.heartbeat"
if [ ! -f "$WORKSPACE/memory/.heartbeat/last-eod.json" ]; then
  echo '{"last_eod_time": 0, "updated_at": ""}' > "$WORKSPACE/memory/.heartbeat/last-eod.json"
  echo "  ✅ Initialized last-eod.json"
else
  echo "  ✅ last-eod.json exists"
fi

# ── 5. 验证安装 ──
echo "[5/5] Verifying installation..."
ERRORS=0
[ -f "$PLUGIN_DIR/openclaw.plugin.json" ] || { echo "  ❌ openclaw.plugin.json missing"; ERRORS=$((ERRORS+1)); }
[ -f "$PLUGIN_DIR/config/sleepiness.json" ] || { echo "  ❌ config/sleepiness.json missing"; ERRORS=$((ERRORS+1)); }
[ -f "$PLUGIN_DIR/scripts/check-full.sh" ] || { echo "  ❌ scripts/check-full.sh missing"; ERRORS=$((ERRORS+1)); }
[ -d "$WORKSPACE/memory/.heartbeat" ] || { echo "  ❌ memory/.heartbeat/ not created"; ERRORS=$((ERRORS+1)); }
# Note: V3.8.8-beta3 does not pre-compile dist/. Compilation is handled at deploy time.
if [ "$ERRORS" -eq 0 ]; then
  echo "  ✅ All files verified"
else
  echo "  ⚠️  $ERRORS verification error(s) found"
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║        Quickstart Complete             ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Review $PLUGIN_DIR/openclaw.plugin.json"
echo "  2. Compile TypeScript:  cd $PLUGIN_DIR && npx tsc"
echo "  3. Add plugin to openclaw.json (see step 3 above)"
echo "  4. Restart Gateway:     openclaw gateway restart"
echo "  5. Verify:              openclaw doctor"
echo ""
[ "$ERRORS" -eq 0 ] && echo "✅ Ready to go!" || echo "⚠️  Fix $ERRORS issue(s) above, then restart Gateway"
