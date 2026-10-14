---
name: check-project
description: 项目体检——检查 .qoder 配置完整性与指导中心状态
---

# 项目体检

## 执行步骤

1. 检查 .qoder 目录结构完整性
   - [ ] rules/ 目录存在且包含小写 .md 规则文件（新版运行时只加载 .md；.mdc 为改名过渡态）
   - [ ] skills/ 目录存在且包含 SKILL.md 子目录
   - [ ] agents/ 目录存在且包含 .md 文件
   - [ ] commands/ 目录存在（可选）
   - [ ] hooks/ 目录存在（可选）
   - [ ] settings.json 存在（如启用 hooks）

2. 检查 AGENTS.md 存在且内容完整
   - [ ] 项目简介
   - [ ] 技术栈
   - [ ] 项目结构
   - [ ] 分层规范
   - [ ] 命名规范
   - [ ] 可用能力索引

3. 检查组件落盘计数与指导中心状态（v6.0.0：注册表分区已移除，覆盖核对改由组件计数 + harness-verify 承担）
   - 列出 .qoder/rules/、.qoder/skills/、.qoder/agents/、.qoder/commands/、.qoder/hooks/ 全部组件并统计（对照 manifest 期望计数）
   - 检查 docs/PROJECT-LIVE.md 存在且 3 分区标记成对完整（workflow/snapshot/footer）+ 独立交接面 docs/项目交接.md（workflow 区含提示词手册）、`docs/PROJECT-LIVE.html` 含 SYNC_DATA 标记与 Mermaid+ELK 引擎（无拼接占位残留、无 DASH_DATA 旧契约回潮）；.qoder/briefing-skeletons.md 存在
   - 运行 `.qoder/scripts/harness-verify.*` 取 status 作为体检结论

4. 检查 harness-profile.json 合法性（如存在）
   - JSON 格式合法
   - 必填字段存在

5. 输出体检报告
   - 组件统计（rules/skills/agents/commands/hooks 数量）
   - 指导中心状态（PROJECT-LIVE.md 分区完整性 + harness-verify status）
   - 发现的问题与建议

## 适用场景

- 项目初始化后首次体检
- 装配后验证完整性
- 定期健康检查
