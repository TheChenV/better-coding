# 已填示例（worked examples）

空模板告诉你"要填哪些格"，这里放的是"填完之后长什么样"。
每份示例对应 `../L0-universal/spec-templates/` 里的一个模板，
内容取自真实项目的交付物，已做匿名化与泛化改写。

## 怎么用

1. 先读示例，再打开同名模板：先看骨架有没有漏节，再看片段里的
   颗粒度（数字、编号、反例）填到什么程度算够。
2. **示例不是契约**。必填项与判据以模板和对应 skill 的产出契约
   为准；示例只给"合格线附近长什么样"的参照，不复制粘贴。
3. 片段里的编号（`US-*` / `BR-*` / `MP-*` 错误码 / `ADR-*`）是示例
   项目 MP-01 自己的命名，换成你的项目代号即可，别照抄前缀。
4. 你的项目与示例项目不同型时（如纯后端、无 UI 环节），按模板的
   跳过条款处理，不要为了像示例而硬凑一节。

## 体量红线

**每个示例文件 ≤ 6144 字节（6K）**。只放三样东西：

- 一份"为什么这份长这样"的短引子（≤3 行）
- 章节骨架
- 1–3 段关键片段（真实颗粒度，不是全文）

源项目的完整文档单份 50–83K，整份塞进库只会淹没模板。闸门
`tools/checks/32-worked-examples.mjs` （构建期工装，不随本库交付）逐文件判字节数，超线即报
点名；要加内容就删别处的内容，不要调高天花板。

## 索引

- `MRD-example.md` ← MRD-template.md
  ｜ 环节 1 `/create-proposal` 步骤 1
- `PRD-example.md` ← PRD-template.md
  ｜ 环节 1 `/create-proposal` 步骤 2
- `ARCH-example.md` ← ARCH-template.md
  ｜ 环节 2 `/create-architecture`
- `SPEC-BE-example.md` ← SPEC-BE-template.md
  ｜ 环节 3 `/create-module-spec`
- `SPEC-FE-example.md` ← SPEC-FE-template.md
  ｜ 环节 3 `/create-module-spec`
- `SPEC-API-example.md` ← SPEC-API-contract.yaml.template
  ｜ 环节 3 `/create-module-spec`
- `SPEC-DDL-example.md` ← SPEC-DDL-template.sql
  ｜ 环节 3 `/create-module-spec`
- `SPEC-TEST-example.md` ← SPEC-TEST-template.md
  ｜ 环节 3 `/create-module-spec`
- `tasks-example.md` ← task-template.md
  ｜ 环节 3 `/create-module-spec`
- `SPEC-UI-example.md` ← SPEC-UI-template.md
  ｜ 环节 4 `/ui-design`
- `test-report-example.md` ← 无模板（SPEC-TEST 的执行结果）
  ｜ 环节 7 `/run-tests`
- `change-delta-example.md` ← 无模板（变更文件夹两件套）
  ｜ 环节 9 `/spec-delta`
- `handoff-example.md` ← `assets/templates/docs/项目交接.md`
  ｜ 横切 `/context-handoff`

环节 6 联调与环节 8 上线记录属过程性产物，形态随项目而定，暂无
示例；它们的判据写在对应 skill 的产出契约里。
