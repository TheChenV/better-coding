---
description: 依赖管理规范 - 锁定版本、定期审计、评估维护状态、禁止未审核依赖、供应链安全检查（新增/升级/降级依赖或编辑 package.json/pyproject.toml/pom.xml/build.gradle/go.mod 等依赖声明时触发）
trigger: glob
glob: **/package.json, **/package-lock.json, **/pnpm-lock.yaml, **/yarn.lock, **/pom.xml, **/build.gradle, **/go.mod, **/requirements.txt, **/pyproject.toml, **/Cargo.toml
---

# 依赖管理规范

> 来源：Addy Osmani security-and-hardening + Harness 课程第 2 课 — 依赖是供应链安全的入口。

## 强制规则

1. **必须使用 lock 文件** — package-lock.json / Pipfile.lock / go.sum / pom.xml
2. **定期运行安全审计** — `npm audit` / `pip-audit` / `govulncheck` / `mvn dependency-check:check`
3. **引入新依赖前评估** — 维护状态、社区活跃度、已知漏洞、包大小
4. **禁止引入已废弃的依赖** — 检查 last publish date 和 maintainer 活跃度
5. **高危漏洞 48 小时内修复或替换** — Critical/High CVE 不可延期

## 依赖审计节奏

| 频率 | 行动 |
|------|------|
| 每次引入新依赖 | 评估安全性、维护状态、包大小 |
| 每次 CI 构建 | 运行安全审计 |
| 每月 | 检查依赖更新、清理未使用依赖 |
| 每季度 | 全面依赖审查、升级过时依赖 |

## 引入新依赖的检查清单

- [ ] 最近 6 个月内有维护更新
- [ ] 无已知高危漏洞
- [ ] 包大小合理（前端关注 bundle size）
- [ ] License 兼容项目 License
- [ ] 有替代方案对比（至少看 2 个）
