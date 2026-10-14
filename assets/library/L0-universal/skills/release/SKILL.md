---
name: release
description: 版本发布。触发方式：/release。来源：Harness component library。
---


# 版本发布

## 产出契约（环节卡为单一契约源）

| 项 | 契约 |
|----|------|
| 产出物 | 版本 Git Tag + CHANGELOG 更新 + 发布说明 |
| 模板依赖 | 无 |
| 归档位置 | 项目根 `CHANGELOG.md` + Git Tag |
| 产出自检 | 版本号遵循 SemVer；CHANGELOG 含本次变更清单；Tag 正确；须通过 release 门禁（健康检查/回滚就绪/无调试代码）后执行 |
| 收尾 | 3 步同步 |

## 触发条件

- 用户输入 `/release` 命令
- 功能开发完毕准备正式发版
- 用户要求发布新版本
- 里程碑/Sprint 结束时的定期发布

## 核心原则

> **版本号遵循 Semantic Versioning (SemVer)：MAJOR.MINOR.PATCH。**
> - MAJOR：不兼容的 API 变更
> - MINOR：向后兼容的功能新增
> - PATCH：向后兼容的 Bug 修复

## 执行步骤

### Step 1: 版本号计算

根据变更内容确定新版本号：

**1.1 获取当前版本**
```bash
# 从 Git Tag 获取
git describe --tags --abbrev=0
# 或从项目版本文件获取（按项目技术栈）
# 【__已预填：版本文件路径，请核对__】
# 例如：
# - Node.js: cat package.json | grep '"version"'
# - Java: grep '<version>' pom.xml
# - Python: cat pyproject.toml | grep version
# - Go: cat version.go
```

**1.2 分析变更类型**
```bash
# 查看自上个 Tag 以来的所有提交
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

**1.3 确定版本号**

| 变更类型 | 版本递增 | 示例 |
|----------|----------|------|
| 存在 Breaking Change | MAJOR + 1 | 1.2.3 → 2.0.0 |
| 新增功能（向后兼容） | MINOR + 1 | 1.2.3 → 1.3.0 |
| 仅 Bug 修复 | PATCH + 1 | 1.2.3 → 1.2.4 |

**判断 Breaking Change：**
- 删除/重命名了公共 API
- 修改了接口参数/返回值结构
- 变更了数据库 Schema（不兼容）
- 提交信息中包含 `BREAKING CHANGE` 或 `!`

### Step 2: 生成 Changelog

自动生成结构化的变更日志：

```bash
# 获取分类提交
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%s" | grep "^feat" > /tmp/features.txt
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%s" | grep "^fix" > /tmp/fixes.txt
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%s" | grep "^perf" > /tmp/perfs.txt
```

**Changelog 模板（CHANGELOG.md）：**
```markdown
# Changelog

## [1.3.0] - 2024-01-15

### Added (新增)
- feat(auth): 支持 OAuth2.0 第三方登录 (#78)
- feat(order): 新增订单导出功能 (#82)

### Fixed (修复)
- fix(payment): 修复金额计算精度丢失问题 (#85)
- fix(ui): 修复移动端布局错位 (#83)

### Changed (变更)
- refactor(api): 统一错误响应格式

### Breaking Changes (破坏性变更)
- api: `/users` 接口返回结构变更，`name` 拆分为 `firstName` + `lastName`

### Security (安全)
- 升级 lodash 至 4.17.21 修复原型链污染漏洞
```

### Step 3: 更新版本号

在所有需要的位置更新版本号：

```bash
# 按项目技术栈执行（以下命令需根据项目实际配置）
# 【__已预填：版本更新命令，请核对__】
# 例如：
# - Node.js: npm version 1.3.0 --no-git-tag-version
# - Java: 手动更新 pom.xml 中的 <version> 标签
# - Python: 更新 pyproject.toml 中的 version 字段
# - Go: 更新 version.go 中的常量

# 或手动更新以下文件：
# - package.json → "version": "1.3.0"
# - pom.xml → <version>1.3.0</version>
# - version.go / version.py / Version.java
# - Chart.yaml (Helm)
# - build.gradle
```

**确认所有版本引用一致：**
```bash
grep -r "1.2.3" --include="*.json" --include="*.yaml" --include="*.xml" .
# 确保旧版本号已全部替换
```

### Step 4: 编译打包

执行最终的构建验证：

```bash
# 完整构建（含测试）——按项目技术栈执行
# 【__已预填：构建命令，请核对__】
# 例如：
# - Node.js: npm ci && npm run build && npm test
# - Java: mvn clean package
# - Go: go build ./... && go test ./...
# - Python: python -m build && pytest

# 生成发布产物（按项目类型）
# 例如：
# - Node.js: npm pack
# - Docker: docker build -t ${IMAGE_NAME}:1.3.0 .
# - Java: mvn clean package
```

**验证产物：**
- 产物可正常安装/运行
- 版本号在产物中正确体现
- 无开发依赖泄漏到生产包

### Step 5: 打 Git Tag

创建带注释的 Git Tag：

```bash
# 提交版本变更
git add -A
git commit -m "chore(release): v1.3.0"

# 创建 annotated tag
git tag -a v1.3.0 -m "Release v1.3.0

Features:
- OAuth2.0 第三方登录
- 订单导出功能

Fixes:
- 金额计算精度问题
- 移动端布局错位"

# 推送（v9.5.0：<远端>/<主干> 取 .qoder/harness-profile.json#git 的实探值，不写死 origin/main；
#      mode=local 时不外推——发布标签只留本地，要推远端先按 /harness-assemble 改档）
git push <远端> <主干> --tags
```

### Step 6: 发布日志

创建正式的 Release 记录：

**Git Platform Release（GitHub/GitLab）：**
```markdown
## v1.3.0 (2024-01-15)

### 🎉 新功能
- 支持 OAuth2.0 第三方登录（微信、GitHub）
- 新增订单导出为 Excel 功能

### 🐛 Bug 修复
- 修复金额计算精度丢失（使用 decimal.js）
- 修复移动端 Safari 布局错位

### ⚠️ Breaking Changes
- `/api/users` 响应中 `name` 字段拆分为 `firstName` + `lastName`
  - 迁移指南: [查看文档](docs/migration-v1.3.md)

### 📦 升级指南
1. 更新依赖（按项目技术栈）: 【__已预填：依赖更新命令，请核对__】
   # 例如：
   # - Node.js: npm install @our-lib/core@1.3.0
   # - Java: 更新 pom.xml 中的依赖版本
   # - Python: pip install our-lib==1.3.0
2. 如有使用 `/api/users`，请更新字段映射
3. 重启服务

**Full Changelog**: https://github.com/org/repo/compare/v1.2.3...v1.3.0
```

**通知相关方：**
- 更新内部公告/群消息
- 如有 Breaking Change，邮件通知下游服务负责人
- 更新 API 文档站点

## 输出物

- 更新后的 CHANGELOG.md
- 版本号更新（所有相关文件）
- Git Tag（annotated）
- Release Notes
- 构建产物（镜像/包）

## 适用条件

- 所有有版本管理需求的软件项目
- 库/SDK 发布（必须严格遵循 SemVer）
- 应用服务的定期发布
- 有下游依赖者的公共组件

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| 版本号判断有争议 | 保守原则：有疑问时升 MAJOR 而非 MINOR |
| Changelog 遗漏重要变更 | 补充后重新生成，amend 提交 |
| Tag 打错 | 删除重打：`git tag -d v1.3.0 && git push origin :refs/tags/v1.3.0` |
| 发布后发现严重Bug | 立即发布 PATCH 版本（v1.3.1），不走完整流程 |
| Breaking Change 未提前通知 | 立即通知下游，必要时撤回发布（Yank） |