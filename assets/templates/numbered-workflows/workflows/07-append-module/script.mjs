// 工作流 07：追加业务模块（可选）——语料 07-crud-option 的语义：本步不执行副作用，只给切换指引。
// 语料原文是"scaffold-agent 本身不调用 crud-agent，仅告知用户如何切换"，这里 1:1 保留这条纪律。
console.log('  本工作流不改任何文件（语料同款：只告知切换，不代跑下游）。');
console.log('');
console.log('要继续加业务模块，请按下面顺序做：');
console.log('  1. 先确认工作流 01-06 全过（编译验证 06 是通过的判据）');
console.log('  2. 模块信息四要素齐了再开工：名称 / 职责一句话 / 所属层级 / 依赖模块（缺就先问，不许猜）');
console.log('  3. 切到实现类技能：/implement-feature（有 SPEC 时）或 /quick-spec（小改动先出单页 spec）');
console.log('  4. 需要新模块设计文档时走 /create-module-spec，别在脚手架阶段直接堆代码');
console.log('');
console.log(`目标工程：${VARS.targetDir}`);
console.log(`本栈计划：plans/${VARS.stack}.json`);
console.log('');
console.log('  ✓ 指引已展示（无副作用，无需验证）');
