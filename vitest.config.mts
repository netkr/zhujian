import { defineConfig } from 'vitest/config';

// 领域层的日期解析会产出本地时区 ISO 字符串，夹具因此与运行时区绑定。
// 固定为应用目标语言环境（zh-CN）对应的时区，保证夹具在任意机器上可复现。
process.env.TZ = 'Asia/Shanghai';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
