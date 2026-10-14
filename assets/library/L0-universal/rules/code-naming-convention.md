---
description: 通用命名规范 - 名称自解释、可搜索、一致，命名决策树：domain term优先，technical term其次（编辑代码文件时自动生效）
trigger: glob
glob: **/*.py, **/*.js, **/*.jsx, **/*.ts, **/*.tsx, **/*.java, **/*.go, **/*.vue, **/*.kt, **/*.rs
---

# 通用命名规范

> 来源：Matt Pocock CONTEXT.md 命名理念 + Harness 课程第 2 课 — 命名是代码可读性的第一要素。

## 命名决策树

1. **优先用领域术语** — `orderTotal` 而非 `sum`，`isEligible` 而非 `checkResult`
2. **其次用技术术语** — `userRepository` 而非 `dataThing`
3. **禁止缩写**（除非是业界通用：id, url, api, http） — `customerName` 而非 `custNm`
4. **禁止泛化名称** — 禁止 `data`, `info`, `result`, `temp`, `handle`, `process`

## 各语言约定

> 🔴 **语言官方惯例优先于本表**；本表与 L1 栈规则同时命中同一文件时**以 L1 为准**。
> （v9.12.0 校正：Go 常量原写 `UPPER_SNAKE`，与 `go-naming` 的「驼峰」直接互斥，且 Effective Go 用的是 MixedCaps——错的是本表这一格。）

| 语言 | 变量/函数 | 类/接口 | 常量 | 文件 |
|------|----------|---------|------|------|
| Python | snake_case | PascalCase | UPPER_SNAKE | snake_case.py |
| TypeScript | camelCase | PascalCase | UPPER_SNAKE | kebab-case.ts |
| Java | camelCase | PascalCase | UPPER_SNAKE | PascalCase.java |
| Go | camelCase（导出 PascalCase） | PascalCase | MixedCaps（Go 惯例，非 SCREAMING_SNAKE，见 `/go-naming`） | snake_case.go |

## 布尔值命名

- 用 `is/has/can/should` 前缀：`isActive`, `hasPermission`, `canRetry`
- 禁止模糊命名：`flag`, `status`（用具体含义替代）

## 函数命名

- 动词开头：`getUser`, `calculateTotal`, `validateInput`
- 一个函数一个动作 — 禁止 `getUserAndCalculateTotal`

## 禁止

- ❌ 单字母变量（循环变量 i/j/k 除外）
- ❌ 拼音命名（除非是纯中文项目且团队共识）
- ❌ 魔法数字 — 用命名常量替代
