import fs from 'node:fs';
import path from 'node:path';

// 工作流 05：工程初始化（语料 06-init 的职责：建 .gitignore + 打印后续操作指南）
// 语料 D3 偏离：原版还会用明文凭证自动建 MySQL 库，属课程演示专用，不移植（见 vars.mjs D3）。
const R = p => path.join(VARS.targetDir, p);
const ENTRY = '.scaffold/';

const gi = R('.gitignore');
if (!fs.existsSync(gi)) {
  fs.writeFileSync(gi, ['# 编号工作流的运行中间产物', ENTRY, ''].join('\n'), 'utf8');
  console.log('  ✓ .gitignore（新建，含 ' + ENTRY + '）');
} else {
  const cur = fs.readFileSync(gi, 'utf8');
  if (cur.split(/\r?\n/).some(l => l.trim() === ENTRY || l.trim() === '.scaffold')) {
    console.log('  = .gitignore 已覆盖 .scaffold/，不动用户文件');
  } else {
    // 用户已有文件：追加即擅自改写，交给宿主问用户（语料"禁止修改用户已有 .qoder/"的同一处置思路）
    console.error(`  ! .gitignore 已存在但未忽略 .scaffold/ → 需要用户拍板是否追加这一行：${ENTRY}`);
    console.error('    本工作流不自动改写项目既有文件；确认后重试本步，或用户自行追加后跳过。');
    process.exit(2);
  }
}

console.log('');
console.log('============================================');
console.log(`  脚手架搭建完成：${VARS.targetDir}`);
console.log('============================================');
console.log('后续操作：');
console.log(`  编译验证（工作流 06 就跑它）：${VARS.buildCmd}`);
for (const s of PLAN.nextSteps) console.log(`  ${s}`);
console.log('--------------------------------------------');
console.log('如需继续加业务模块，走工作流 07 的指引切换到实现类技能；本工作流不代跑。');
