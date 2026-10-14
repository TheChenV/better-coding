---
name: ts-build
description: TypeScript构建流程. Manual-trigger skill. Source: Harness component library.
---


# TypeScript 构建流程

## 概述

标准化的 TypeScript 构建流程确保代码在发布前经过完整的类型检查、代码质量检查和产物验证。

## 前置条件

- Node.js >= 20.x
- 包管理器：pnpm（推荐）/ npm / yarn
- TypeScript >= 5.4
- 构建工具：Vite（前端）/ tsc（库/后端）

## 执行步骤

### Step 1: 类型检查（必须首先执行）

```bash
# 仅做类型检查，不输出文件
npx tsc --noEmit

# 如果是 monorepo，检查所有包
pnpm -r exec tsc --noEmit
```

**失败处理：** 类型错误必须全部修复后才能继续，禁止跳过。

### Step 2: Lint 检查

```bash
# ESLint 检查（flat config）
npx eslint . --max-warnings=0

# 自动修复可修复的问题
npx eslint . --fix
```

**要求：** `--max-warnings=0` 确保零警告通过。

### Step 3: 格式化检查

```bash
# Prettier 检查格式
npx prettier --check "src/**/*.{ts,tsx,json,css}"

# 自动格式化
npx prettier --write "src/**/*.{ts,tsx,json,css}"
```

### Step 4: 构建产物

```bash
# 前端项目（Vite）
npx vite build

# 库项目（tsc 输出）
npx tsc --project tsconfig.build.json

# 后端项目（esbuild 快速打包）
npx esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js
```

### Step 5: Bundle 分析（前端项目）

```bash
# 使用 rollup-plugin-visualizer 分析包体积
npx vite build --mode analyze

# 或使用 source-map-explorer
npx source-map-explorer dist/assets/*.js
```

**预算检查：**
- 首屏 JS < 200KB (gzipped)
- 单个 chunk < 500KB (raw)
- 无重复依赖

### Step 6: 产物验证

```bash
# 验证构建产物存在且非空（本库不提供 scripts/verify-build.mjs，就地一行判定）
node -e "const f=require('fs');if(!f.existsSync('dist')){console.error('\u2717 dist/ \u4e0d\u5b58\u5728');process.exit(1)}const t=f.readdirSync('dist');if(!t.length){console.error('\u2717 dist/ \u4e3a\u7a7a');process.exit(1)}console.log('\u2713 dist/ '+t.length+' \u9879');"

# 验证类型声明文件（库项目）
npx api-extractor run --local

# 运行 smoke test
node dist/index.js --version
```

## 完整 CI 脚本

```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Type Check
        run: pnpm tsc --noEmit

      - name: Lint
        run: pnpm eslint . --max-warnings=0

      - name: Format Check
        run: pnpm prettier --check "src/**/*"

      - name: Test
        run: pnpm vitest run --coverage

      - name: Build
        run: pnpm vite build

      - name: Bundle Size Check
        run: pnpm bundlesize
```

## tsconfig.build.json（库项目）

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/__tests__/**"]
}
```

## 常见问题处理

| 问题 | 解决方案 |
|------|----------|
| 类型错误过多无法一次修复 | 使用 `tsc --noEmit` 逐个文件修复，禁止关闭 strict |
| 构建产物过大 | 分析 bundle，拆分 chunk，tree-shaking 检查 |
| 循环依赖导致构建失败 | 使用 `madge --circular src/` 定位并重构 |
| 第三方库无类型 | 添加 `@types/*` 或编写 `.d.ts` 声明 |

## 检查清单

- [ ] `tsc --noEmit` 零错误
- [ ] `eslint --max-warnings=0` 通过
- [ ] `prettier --check` 通过
- [ ] 构建产物生成成功
- [ ] Bundle 体积在预算内
- [ ] 产物 smoke test 通过