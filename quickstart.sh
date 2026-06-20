#!/bin/bash
# soul-protocol Quickstart — One-command deployment
# Usage: bash quickstart.sh [--workspace /path/to/workspace]

set -e

# Parse args
WORKSPACE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace|-w) WORKSPACE="$2"; shift 2 ;;
    *) echo "Usage: $0 [--workspace /path/to/workspace]"; exit 1 ;;
  esac
done

# Auto-detect workspace
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
export WORKSPACE

echo "=== Soul Protocol V3.8.8-beta2 Quickstart ==="
echo "Workspace: $WORKSPACE"
echo ""

# 1. Copy plugin files (exclude dev artifacts)
echo "[1/6] Copying plugin files..."
mkdir -p "$PLUGIN_DIR"
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.git' \
      --exclude='*.pid' --exclude='*.log' --exclude='openclaw.plugin.json' \
      "$SCRIPT_DIR/" "$PLUGIN_DIR/" 2>/dev/null || \
cp -r "$SCRIPT_DIR"/* "$PLUGIN_DIR/" 2>/dev/null
echo "  ✅ Plugin copied to $PLUGIN_DIR"

# 2. Compile TypeScript
echo "[2/6] Compiling TypeScript..."
cd "$PLUGIN_DIR"
if command -v npx &>/dev/null; then
  npx tsc 2>&1 && echo "  ✅ Compilation successful" || echo "  ⚠️  TypeScript compilation skipped (install typescript first: npm install typescript)"
else
  echo "  ⚠️  npx not found. Install Node.js ≥ 22 first."
fi

# 3. Configure plugin
echo "[3/6] Configuring plugin..."
if [ ! -f "$PLUGIN_DIR/openclaw.plugin.json" ]; then
  cp "$PLUGIN_DIR/openclaw.plugin.json.example" "$PLUGIN_DIR/openclaw.plugin.json"
  echo "  📝 Created openclaw.plugin.json from template"
  echo "  ⚠️  Edit $PLUGIN_DIR/openclaw.plugin.json to set:"
  echo "     - agentName: your agent name"
  echo "     - dreamAgentName: your dream agent name"
  echo "     - extraBasePath: path to dialogue logs"
else
  echo "  ✅ openclaw.plugin.json exists"
fi

# 4. Show OpenClaw registration instructions
echo "[4/6] OpenClaw registration..."
echo "  Add to your openclaw.json:"
echo ""
echo '  "plugins": {'
echo '    "load": {'
echo '      "paths": ["'"$PLUGIN_DIR"'"]'
echo '    },'
echo '    "allow": ["soul-protocol"]'
echo '  }'
echo ""

# 5. Initialize heartbeat state
echo "[5/6] Initializing heartbeat state..."
mkdir -p "$WORKSPACE/memory/.heartbeat"
if [ ! -f "$WORKSPACE/memory/.heartbeat/last-eod.json" ]; then
  echo '{"last_eod_time": 0, "updated_at": ""}' > "$WORKSPACE/memory/.heartbeat/last-eod.json"
  echo "  ✅ Initialized last-eod.json"
else
  echo "  ✅ last-eod.json exists"
fi

# 6. Verify installation
echo "[6/6] Verifying installation..."
ERRORS=0
[ -f "$PLUGIN_DIR/dist/index.js" ] || { echo "  ❌ dist/index.js missing (TypeScript compilation may have failed)"; ERRORS=$((ERRORS+1)); }
[ -f "$PLUGIN_DIR/openclaw.plugin.json" ] || { echo "  ❌ openclaw.plugin.json missing"; ERRORS=$((ERRORS+1)); }
[ -f "$PLUGIN_DIR/config/sleepiness.json" ] || { echo "  ❌ config/sleepiness.json missing"; ERRORS=$((ERRORS+1)); }
[ -f "$PLUGIN_DIR/scripts/check-full.sh" ] || { echo "  ❌ scripts/check-full.sh missing"; ERRORS=$((ERRORS+1)); }
[ -d "$WORKSPACE/memory/.heartbeat" ] || { echo "  ❌ memory/.heartbeat/ not created"; ERRORS=$((ERRORS+1)); }
if [ "$ERRORS" -eq 0 ]; then
  echo "  ✅ All files verified ($(find "$PLUGIN_DIR/dist" -name '*.js' 2>/dev/null | wc -l) compiled JS files)"
else
  echo "  ⚠️  $ERRORS verification error(s) found"
fi

echo ""
echo "=== Quickstart Complete ==="
echo ""
echo "Next:"
echo "  1. Edit $PLUGIN_DIR/openclaw.plugin.json → set agentName, extraBasePath"
echo "  2. Add plugin to openclaw.json (see step 4 above)"
echo "  3. Restart Gateway"
echo ""
[ "$ERRORS" -eq 0 ] && echo "✅ Ready to go!" || echo "⚠️  Fix $ERRORS issue(s) above, then restart Gateway"
