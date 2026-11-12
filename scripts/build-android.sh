#!/usr/bin/env bash
set -euo pipefail

# 为什么需要这个脚本：
#   本机 PATH 里没有 java，android/gradle.properties 里的 org.gradle.java.home
#   只对 Gradle 守护进程生效；android/gradlew 这个启动脚本本身仍需要
#   JAVA_HOME（或 PATH 中的 java），否则会在启动阶段直接失败。
#   以前每次构建都要手动 export JAVA_HOME，容易漏掉。这里固定一次。
#
# 注意：下面的 JDK 路径依赖外置盘（/Volumes/<drive>）已挂载。
#   盘未挂载或 JDK 被移动时，脚本会在校验阶段报错退出，不会静默降级。
#
# 用法：
#   ./scripts/build-android.sh                 # 默认 ./gradlew assembleRelease
#   ./scripts/build-android.sh assembleDebug   # 传入任务则覆盖默认任务
#   ./scripts/build-android.sh clean assembleDebug

export JAVA_HOME='/Volumes/<drive>/AndroidDev/Android Studio.app/Contents/jbr/Contents/Home'

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "ERROR: 找不到可执行的 JDK: $JAVA_HOME/bin/java" >&2
  echo "       请确认外置盘已挂载且 JDK 路径正确（可用 ls \"\$JAVA_HOME/bin/java\" 检查）。" >&2
  exit 1
fi

# 用脚本自身路径推导项目根目录，避免写死绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT/android"

# 无参数时默认 assembleRelease；有参数则原样透传给 gradle
if [ "$#" -eq 0 ]; then
  set -- assembleRelease
fi

exec ./gradlew "$@"
