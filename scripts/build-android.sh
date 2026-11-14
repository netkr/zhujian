#!/usr/bin/env bash
set -euo pipefail

# 为什么需要这个脚本：
#   本机 PATH 里可能没有 java，android/gradlew 这个启动脚本本身需要 JAVA_HOME
#   （或 PATH 中的 java），否则会在启动阶段直接失败。
#   以前每次构建都要手动 export JAVA_HOME，容易漏掉。这里固定一次。
#
# JDK 定位顺序：
#   1) 已设置的 JAVA_HOME 环境变量；
#   2) 本机未提交配置 scripts/.local.env（已 gitignore，不会提交），内容形如：
#        export JAVA_HOME='/path/to/jdk'
#   两者都找不到可用 JDK 时直接报错退出，不会静默降级。
#
# 用法：
#   ./scripts/build-android.sh                 # 默认 ./gradlew assembleRelease
#   ./scripts/build-android.sh assembleDebug   # 传入任务则覆盖默认任务
#   ./scripts/build-android.sh clean assembleDebug

# 用脚本自身路径推导项目根目录，避免写死绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${JAVA_HOME:-}" ] && [ -f "$SCRIPT_DIR/.local.env" ]; then
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.local.env"
fi

if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "ERROR: 未找到可用的 JDK。" >&2
  echo "       请设置 JAVA_HOME，或创建 scripts/.local.env（已 gitignore）并写入：" >&2
  echo "       export JAVA_HOME='/path/to/jdk'" >&2
  exit 1
fi

cd "$PROJECT_ROOT/android"

# 无参数时默认 assembleRelease；有参数则原样透传给 gradle
if [ "$#" -eq 0 ]; then
  set -- assembleRelease
fi

exec ./gradlew "$@"
