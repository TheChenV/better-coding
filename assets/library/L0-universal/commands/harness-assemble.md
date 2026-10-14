---
name: harness-assemble
description: 阶段 B 演进式装配——定位已安装的 better-coding SKILL 库，读取装配协议按需装配 L1 技术栈与 L2 项目定制组件
---

# 阶段 B 演进式装配

> **命令定位**：本命令是阶段 A 装配到 `.qoder/commands/` 的项目级命令，是**项目内装配触发器**；装配源为 better-coding SKILL 的 assets（模板与参考组件保留在 SKILL 内，不随阶段 A 落盘），本命令文件本身不含任何模板。

## 执行步骤

1. 定位已安装的 SKILL 库
   - [ ] 检查 `.qoder/skills/better-coding/` 是否存在
   - [ ] 不存在 → 提示用户确认 better-coding SKILL 的安装位置，获得路径后再继续（禁止猜测）

2. 读取装配协议
   - [ ] 读取 `<SKILL 库>/references/phase-b-protocol.md` 获取完整装配流程

3. 按协议执行
   - [ ] B.1 信号扫描（技术栈声明 / 脚手架文件 / docs 文档信号）
   - [ ] B.2 生成装配建议清单（建议而非提问，能推导的预填并标注来源，禁止编造）
   - [ ] **B.2b git 方式（v9.5.0 新增，本清单的一项）**：读 `.qoder/harness-profile.json#git.mode`——若为 `pending`，与装配清单一并发卡问一次（三档：`none` 暂不纳管 / `local` 只本地提交不推 / `remote` 本地 + 远端协作）；用户答了才回写 `mode` 并记一行 `history`。**禁止设默认值、禁止代猜**：`mode` 是用户决策位，取值域与四条"不代做"边界的唯一单源是 `<SKILL 库>/manifest.json#gitGovernance`，本命令不复述。已建仓但 `mode=pending` 时同样问一次（判据 `git_ready` 会持续 WARNING 直到有答案）。
   - [ ] 用户确认 / 调整 / 跳过
   - [ ] B.3 执行装配（只补缺失、只更新变化；用户已定制内容不覆盖）
   - [ ] B.5-B.6 指令集同步 + 覆盖率检查
   - [ ] B.7 输出装配报告（含 git 方式的当前档位与变更去向）。排版与口径**指针引用** `references/phase-a-checklist.md#A.5-⑤`（本文件不复述规则）：树状清单进 `text` 代码块、第一条输出即结论、不写导语、不放机器口径、不给门禁道数

4. 完成标准
   - [ ] 指令集覆盖率 100%（新装配组件全部登记）
   - [ ] 运行 harness-verify 输出 `status: PASS`

## 适用场景

- 声明技术栈后，装配 L1 技术栈组件（自然语言别名："装配组件" / "运行装配"）
- PRD/ARCH/SPEC 等文档信号出现后，装配 L2 项目定制组件
- 重复装配只补缺失、只更新变化（增量装配）
