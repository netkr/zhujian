#!/usr/bin/env bash
set -euo pipefail

adb_bin="${ADB_BIN:-/Users/<user>/Library/Android/sdk/platform-tools/adb}"
serial="${1:-emulator-5554}"
package="com.luxn.offlineledger"

dump_ui() {
  "$adb_bin" -s "$serial" shell uiautomator dump /sdcard/zhujian-window.xml >/dev/null
  "$adb_bin" -s "$serial" shell cat /sdcard/zhujian-window.xml | sed 's/></>\n</g'
}

center_from_bounds() {
  sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/' |
    awk '{ print int(($1 + $3) / 2), int(($2 + $4) / 2) }'
}

width_from_bounds() {
  sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/' |
    awk '{ print $3 - $1 }'
}

"$adb_bin" -s "$serial" shell am force-stop "$package"
"$adb_bin" -s "$serial" shell am start -W -n "$package/.MainActivity" >/dev/null
sleep 1

nav_node="$(dump_ui | rg 'content-desc="记一笔".*clickable="true"' | head -1)"
if [[ -z "$nav_node" ]]; then
  echo "FAIL: 找不到记一笔底栏入口"
  exit 1
fi
read -r nav_x nav_y <<<"$(printf '%s\n' "$nav_node" | center_from_bounds)"
"$adb_bin" -s "$serial" shell input tap "$nav_x" "$nav_y"
sleep 1

key_node="$(dump_ui | rg 'content-desc="1".*clickable="true"' | head -1)"
if [[ -z "$key_node" ]]; then
  echo "FAIL: 找不到数字键 1"
  exit 1
fi
key_width="$(printf '%s\n' "$key_node" | width_from_bounds)"

if (( key_width < 160 )); then
  echo "FAIL: 数字键宽度仅 ${key_width}px，按钮布局样式已丢失"
  exit 1
fi

echo "PASS: 数字键宽度 ${key_width}px，记一笔按钮布局正常"
