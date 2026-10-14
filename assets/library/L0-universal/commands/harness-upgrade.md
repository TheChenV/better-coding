---
name: harness-upgrade
description: 升级回源——定位已安装的 better-coding SKILL 库，读取升级协议与迁移映射，按 U.1-U.5 完成升级并校验通过
---

# 升级回源

> **命令定位**：本命令是阶段 A 装配到 `.qoder/commands/` 的项目级命令，是**项目内升级触发器**；升级源为 better-coding SKILL 的 assets。
> **升级前备份**：任何回刷动作开始前，先将 `.qoder/` 备份至 `.qoder/.backup/`；升级异常时可从备份恢复（备份机制沿用升级回源协议既有约定）。

## 执行步骤

1. 定位已安装的 SKILL 库
   - [ ] 检查 `.qoder/skills/better-coding/` 是否存在
   - [ ] 不存在 → 提示用户确认 better-coding SKILL 的安装位置，获得路径后再继续（禁止猜测）

2. 读取升级资料
   - [ ] 读取 `<SKILL 库>/references/upgrade-protocol.md` 获取升级回源协议
   - [ ] 读取 `<SKILL 库>/migration-map.json` 获取迁移动作清单
     - 🔴 **不要整读**：该文件 ~227KB（≈72k token），全量载入会把上下文吃穿。先按"高于项目当前 `skillVersion`"抽子集再读——
       `node -e "const m=require(process.env.SKILL_LIB+'/migration-map.json'),k=s=>s.split('.').map(n=>String(+n).padStart(3,'0')).join(''),P=k(process.env.PROJ_V);const o=m.migrations.filter(x=>k(x._of||'0')>P);console.log(JSON.stringify(o,null,1))"`
       （**每段补零到 3 位再比**：把版本号当字符串或"连接后右补零"比都会把 9.4.0 错判成高于 9.10.0，实测踩过。`_of` 缺省的条目属最早世代，一律不重放；抽出来为空 ⇒ 项目已在当前版，直接跳到 U.5 对账）

3. 按协议执行（U.1-U.5）
   - [ ] U.1 版本比对：`<SKILL 库>/manifest.json` 的 version 与 `.qoder/harness-profile.json` 的 skillVersion
   - [ ] U.2 迁移动作：按 migration-map 中归属版本高于项目 skillVersion 的条目，逐项生成升级动作清单（**列出但不自动执行**）
   - [ ] 用户确认升级动作清单
   - [ ] U.3-U.4 回刷：L0 整体回刷（用户已定制内容存在且与 assets 版本不同则跳过）、docs/harness-templates/（MRD-template 等 **10** 个 spec 模板 + 1 份 `deps-template.yaml` = 落盘 11 件；🔴 v9.12.0 删宪法模板后库维度是 10，旧值 11 是把落盘侧的 deps-template 混计进来了）与 .qoder/briefing-skeletons.md 两态回刷（未改覆盖、改过保留用户版并提示差异）、根目录 AGENTS.md 双向合并（单一事实源，单副本）+ PROJECT-LIVE.md 分区级处置（原「指令集」为 v5.0.0 已废弃概念，其与教程职能均已并入 PROJECT-LIVE.md，按分区级处置条款处理）
   - [ ] U.5 校验：运行 harness-verify，输出 `status: PASS` 才算升级完成；FAIL 则根据明细修复后重试

4. 收尾
   - [ ] 更新 `harness-profile.json`（skillVersion 写入新版本 + history 追加升级记录）

## 适用场景

- better-coding SKILL 发布新版本，项目需要升级回源（自然语言别名："升级 Harness 组件"）
- 升级边界：只刷新 L0 通用部分，用户已定制内容不覆盖
