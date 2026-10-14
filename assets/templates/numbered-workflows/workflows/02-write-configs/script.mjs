import fs from 'node:fs';
import path from 'node:path';

// 工作流 02：写必要配置（语料 02-backend-configs 的职责：父 pom / 子 pom / application.yml）
// 与语料的差别：文件清单与正文来自 plans/<stack>.json，不在脚本里硬编码栈知识（见 README 的 D2）。
const R = p => path.join(VARS.targetDir, p);
const norm = s => (s.endsWith('\n') ? s : s + '\n');

let written = 0;
const conflicts = [];
for (const f of PLAN.configs) {
  const abs = R(f.path);
  const want = norm(f.body);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (fs.existsSync(abs)) {
    const cur = fs.readFileSync(abs, 'utf8');
    if (cur === want) { console.log(`  = ${f.path}（与本次生成同代，跳过重写）`); continue; }
    conflicts.push(f.path);
    console.log(`  ! ${f.path} 已存在且内容与本次计划不同 → 不覆盖（这是项目侧既有文件，可能是用户改过的）`);
    continue;
  }
  fs.writeFileSync(abs, want, 'utf8');
  console.log(`  ✓ ${f.path}`);
  written++;
}

console.log('');
console.log(`配置写入完成：新建 ${written} 个，冲突 ${conflicts.length} 个`);
if (conflicts.length) {
  console.error('警告：存在配置冲突，请人工确认保留哪一份后再重试（本工作流不擅自覆盖已有配置）');
  process.exit(1);
}
