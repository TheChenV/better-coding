import path from 'node:path';
import { spawnSync } from 'node:child_process';

// 工作流 06：编译验证（判据来自 techstack-commands.json#_skeletonContract 第 ④ 条：跑该栈 build 验证编译通过）
// 命令本身不在这里发明：VARS.buildCmd 由宿主从 .qoder/techstack-commands.json 对应栈的 build 取来。
const cmd = String(VARS.buildCmd || '').trim();
if (!cmd) {
  console.error('  ! 未提供 buildCmd → 无法验证「最小可编译」。请从 .qoder/techstack-commands.json 取本栈 build 命令后重试。');
  process.exit(2);
}
console.log(`  执行：${cmd}`);
const r = spawnSync(cmd, { cwd: path.resolve(VARS.targetDir), encoding: 'utf8', shell: true, windowsHide: true, timeout: 600000 });
if (r.error) { console.error(`  ✗ 起不来：${r.error.message}`); process.exit(1); }
const tail = s => String(s || '').split(/\r?\n/).filter(Boolean).slice(-12).join('\n');
if (tail(r.stdout)) console.log(tail(r.stdout));
if (r.status !== 0) {
  if (tail(r.stderr)) console.error(tail(r.stderr));
  console.error(`  ✗ 编译验证未通过（退出码 ${r.status}）`);
  process.exit(1);
}
console.log('  ✓ 编译验证通过（退出码 0）');
