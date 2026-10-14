#!/usr/bin/env node
// assets/templates/scripts/harness.mjs — better-coding 唯一跨平台脚本入口（§3.3）
//
// 为什么单语言：本次重构实测的 5 个缺陷**只存在于 .ps1/.sh 双实现**——
//   B1 pipefail SIGPIPE 只在 Unix、B2 .sh 缺 encoding 而 .ps1 有、E5 macOS 7/10 是 exit 0 桩、
//   M3① settings 写死 powershell.exe 导致跨平台 0 执行、E20 同一条检查两侧单位不同而结论相反。
//   （立项依据不用"官方建议单语言"那句——它原话对比的是 Bash+jq。）
//
// 子命令：
//   node harness.mjs rules-stamp                      ← InstructionsLoaded 事件
//   node harness.mjs heartbeat                        ← SessionStart 事件
//   node harness.mjs hook <子命令>                     ← 11 个 hook（对照表见
//                                                       .qoder/hooks/hook-registry.md，唯一事实源）
//
// 铁律：① 除明确标注"exit 2 阻断"的判向外，任何自身异常一律 exit 0（hook 故障绝不阻断用户交互）
//       ② 写日志必须自带换行（tee -a 不补 \n 会让 JSONL 粘连成单行、按行解析全废）
//       ③ 退出码用 process.exitCode 而不是 process.exit()——后者会截断尚未 flush 的管道输出
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { guardCard, askCardGuardBlocks } from './hook-ask-card.mjs';

/* 🔴 P1-5 口径披露（刻意如此，不是漏改）：心跳与规则戳**只用 process.cwd()**，与 rootFromEnv()/
 * rootFromEvent() 的优先序不同。理由是这两类记录描述的是"宿主在哪个目录里跑完了这一步"，
 * 属运行现场而非项目归属，换成项目根反而丢掉信息。
 * 副作用要讲明白：若宿主设置了 QODER_PROJECT_ROOT 且 cwd ≠ 项目根，戳会写到 cwd 下，
 * 项目根里找不到 → harness-verify 的 rules_loaded_stamp / verify_stamp 可能误红。
 * 现网未观察到该形态（实测 cwd 恒等于项目根），故**不改行为**，只在此留档；真出现误红时，
 * 先看戳落在哪个目录，再决定是否需要引入 QODER_PROJECT_ROOT 优先。 */
const logsDir = path.join(process.cwd(), '.qoder', 'logs');
const readStdin = async () => {
  const chunks = [];
  for await (const ch of process.stdin) chunks.push(ch);
  return Buffer.concat(chunks).toString('utf8');
};
const appendLine = (dir, file, obj) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, file), JSON.stringify(obj) + '\n');
};
/** 审计日志是**纯文本行**不是 JSON：走 appendLine 会被 JSON.stringify 套上一对引号，行格式即失配 */
const appendRawLine = (dir, file, text) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, file), text + '\n');
};

/* ---------- 与旧 .ps1 对齐的通用件（等价性由 tools/hook-equiv.mjs 逐字把关） ---------- */

/** 两类项目根解析优先序，逐字对应两套旧实现，不可合并。
 *  为什么不合并（P1-5 的另一半）：环境变量优先序本来就不同——
 *  rootFromEnv 只认 QODER_PROJECT_ROOT（格式化 hook 沿用旧 .ps1 的单变量口径），
 *  rootFromEvent 还要先吃事件体里的 evt.cwd 与 QODER_PROJECT_DIR（门禁 hook 沿用另一份 .ps1）。
 *  合成一个函数等于替两套旧实现中任一边改写行为，而这两处改写都会把"从哪个目录找 .git"
 *  这件事挪到新的优先级上，属行为变更，不在缺陷修复范围内。 */
const rootFromEnv = () => process.env.QODER_PROJECT_ROOT || process.cwd();
const rootFromEvent = evt => String(evt.cwd || process.env.QODER_PROJECT_DIR || process.env.QODER_PROJECT_ROOT || process.cwd());

const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
/* v9.5.0 S2：仓库判定必须**逐级上溯**。旧实现 `statSync(root/.git)` 只看项目根一层，于是
 * 仓库建在父目录时（monorepo 与 git worktree 都是常态）三道 git 门禁集体输出"本项目零拦截力"，
 * 而它们其实有守卫对象——这是把"我看不到"说成"不存在"。`.git` 是目录或文件都算（worktree 的是文件）。
 * ⚠️ 与 phase-a-init 里的同名函数保持同义（脚本层各自独立、不互相 import）；漂移由判据 git_ready 抓到。 */
const findGitRoot = start => {
  for (let cur = String(start); ;) {
    let st = null;
    try { st = fs.statSync(path.join(cur, '.git')); } catch { }
    if (st && (st.isDirectory() || st.isFile())) return cur;
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
};
/* 承重两行（与 phase-a-init 的 GIT_PIN_LINES **逐字相同**，由判据 git_ready 咬住）。
 * git 会合并祖先目录的 .gitattributes，所以钉在仓库根那份对本项目子树同样生效。 */
const GIT_PIN_LINES = ['* -text', 'docs/PROJECT-LIVE.html -diff binary linguist-generated'];
const pinCovers = dir => {
  if (!dir) return false;
  let t = null;
  try { t = fs.readFileSync(path.join(dir, '.gitattributes'), 'utf8'); } catch { return false; }
  const lines = t.split(/\r?\n/).map(l => l.trim());
  return GIT_PIN_LINES.every(w => lines.includes(w));
};
/** 三道 git 门禁共用的现场事实：仓库在不在、在哪、用户选的哪档、主干叫什么、钉在不在。 */
const gitFace = root => {
  const repoRoot = findGitRoot(root);
  let mode = 'pending', trunk = null;
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(root, '.qoder', 'harness-profile.json'), 'utf8').replace(/^﻿/, ''));
    if (pj && pj.git && typeof pj.git.mode === 'string') mode = pj.git.mode;
    if (pj && pj.git && typeof pj.git.trunk === 'string') trunk = pj.git.trunk;
  } catch { }
  if (!trunk && repoRoot) {
    const r = cp.spawnSync('git', ['-C', repoRoot, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    trunk = r.status === 0 ? String(r.stdout || '').trim() || null : null;
  }
  return { repo: !!repoRoot, repoRoot, mode, trunk, pinned: pinCovers(root) || (repoRoot && pinCovers(repoRoot)) };
};
/** v9.5.0 S5：按 mode 分档的放行话术。"用户主动选 none"与"框架还没问到"是两件事，
 *  说成同一句"零拦截力"会让用户以为自己在裸奔，而事实是他刚做的选择。 */
const gitSkipLine = (tag, g) => {
  if (g.mode === 'none') return `[${tag}] 按你的选择（profile.git.mode=none）本框架不纳管版本库 → 本门禁不适用。改主意说"换一下 git 方式"（走 /harness-assemble）`;
  if (!g.repo && (g.mode === 'local' || g.mode === 'remote')) return `[${tag}] 你已选定 git 方式（mode=${g.mode}）但项目根与各级父目录都还没有 .git → 本门禁暂无守卫对象，跳过（不阻断，当前零拦截力）。建仓走 /branch-workflow Step 0（先写 .gitattributes 再 git init，顺序不可反）`;
  if (!g.repo) return `[${tag}] 未找到 git 仓库（项目根与各级父目录都无 .git）且 git 方式未定（mode=${g.mode}）→ 本门禁无守卫对象，跳过（不阻断，本门禁在本项目零拦截力）。环节 5 开工前会问你一次 git 方式，或现在说"换一下 git 方式"`;
  return `[${tag}] 仓库在 ${g.repoRoot}${g.trunk ? '（当前分支 ' + g.trunk + '）' : ''} —— 项目根之上层的仓库同样算在场（v9.5.0 S2 修：旧实现只看项目根，monorepo 下曾误报"零拦截力"）`;
};
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const out = s => process.stdout.write(s + '\n');
const err = s => process.stderr.write(s);
const pad = n => String(n).padStart(2, '0');
const localStamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const localDate = d => localStamp(d).slice(0, 10);
/** 对应 `& exe 2>&1 | Out-String`：子进程两路输出合并成一个字符串（交错顺序按流而非按时间） */
const tail = (s, n) => (s.length > n ? s.slice(-n) : s);
const quoted = s => `"${s}"`;

/** PATH 查找（对应 Get-Command … -ErrorAction SilentlyContinue） */
function which(name) {
  const win = process.platform === 'win32';
  const exts = win ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const e of exts) {
      const p = path.join(dir, name + (win ? e : ''));
      try {
        if (fs.statSync(p).isFile()) {
          if (!win) fs.accessSync(p, fs.constants.X_OK);
          return p;
        }
      } catch { /* 继续找下一个 */ }
    }
  }
  return null;
}

/** 跑子进程并返回 {status, text}；text 是 stdout+stderr 合并（旧 2>&1 语义） */
const run = (cmd, opts = {}) => {
  const r = cp.spawnSync(cmd, {
    cwd: opts.cwd, encoding: 'utf8', shell: true,
    stdio: opts.inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status === null ? 1 : r.status, text: (r.stdout || '') + (r.stderr || '') };
};
const gitRun = (root, args) => {
  const r = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { status: r.status === null ? 1 : r.status, text: (r.stdout || '').trimEnd() };
};
/** node_modules/.bin 下的可执行（Windows 是 .cmd）。旧 .ps1 写死 .cmd → 只在 Windows 生效，
 *  这里按平台取后缀，正是 E5「macOS 侧拿到桩」那一类缺陷的正解。 */
const binIn = (root, name) => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? name + '.cmd' : name);

/* ==================== hook: block-dangerous ==================== */
const DANGEROUS = [
  'rm\\s+-rf', 'rm\\s+-fr', 'DROP\\s+TABLE', 'DROP\\s+DATABASE', 'TRUNCATE\\s+TABLE',
  'DELETE\\s+FROM\\s+\\w+\\s*;\\s*$', 'format\\s+[a-zA-Z]:', 'mkfs\\.', 'dd\\s+if=',
  ':\\(\\)\\s*\\{\\s*:\\|:\\s*&\\s*\\}\\s*;', 'git\\s+push\\s+.*--force', 'git\\s+reset\\s+--hard',
  'chmod\\s+777', 'curl\\s+.*\\|\\s*sh', 'curl\\s+.*\\|\\s*bash', 'wget\\s+.*\\|\\s*sh',
  'wget\\s+.*\\|\\s*bash', ':\\(\\)\\{', '>\\/dev\\/sda', 'mkfs\\.ext', 'shutdown', 'reboot',
  'init\\s+0', 'init\\s+6',
];
function hookBlockDangerous(evt) {
  let command = String(evt.tool_input?.command || '');
  if (!command && process.env.QODER_TOOL_INPUT) command = String(process.env.QODER_TOOL_INPUT);
  if (!command) return 0;
  for (const pattern of DANGEROUS) {
    // -match 是不区分大小写的 .NET 正则，所以这里必须带 i
    if (new RegExp(pattern, 'i').test(command)) {
      err(`[block-dangerous] 拦截危险命令（匹配模式 '${pattern}'）: ${command.slice(0, 200)}\n如需执行，请手动在终端中运行并向用户显式确认。`);
      return 2;
    }
  }
  return 0;
}

/* ==================== hook: pre-commit-lint ==================== */
function hookPreCommitLint(evt) {
  const command = String(evt.tool_input?.command || '');
  if (command && !/git\s+commit/i.test(command)) return 0;
  const root = rootFromEnv();
  const g = gitFace(root);
  if (g.mode === 'none' || !g.repo) { out(gitSkipLine('pre-commit-lint', g)); return 0; }
  /* v9.5.0 S3 的另一半：装机不再无条件写 .gitattributes，所以"仓库已在场却没钉行尾"必须在这里
   * 出声——这是唯一还来得及的时点。core.autocrlf=true 一旦在某次 checkout 把 .qoder/scripts/*.mjs
   * 的 LF 改成 CRLF，后补这份文件**还原不了已改写的字节**，所以本门禁取 exit 2 而非只提示。 */
  if (!g.pinned) {
    err(`[pre-commit-lint] 仓库在场（${g.repoRoot}）但 .gitattributes 的承重两行缺席 → 提交已阻断。\n`
      + `本机 core.autocrlf=true 会在 checkout 时把 .qoder/scripts/*.mjs 的 LF 静默改成 CRLF，改写过就还原不了。\n`
      + `修复：在项目根 .gitattributes 追加下面两行后重试本次提交：\n  ${GIT_PIN_LINES.join('\n  ')}\n`
      + `（或执行 /branch-workflow 的 Step 0，它按序先写钉再建仓）\n`);
    return 2;
  }
  let linted = false, res = { status: 0, text: '' };
  if (isFile(path.join(root, 'package.json')) && isFile(binIn(root, 'eslint'))) {
    out('[pre-commit-lint] 检测到 Node.js 项目，运行 ESLint...');
    res = run(`${quoted(binIn(root, 'eslint'))} . --fix`, { cwd: root });
    linted = true;
  }
  if (!linted && (isFile(path.join(root, 'pyproject.toml')) || isFile(path.join(root, 'requirements.txt'))) && which('ruff')) {
    out('[pre-commit-lint] 检测到 Python 项目，运行 Ruff...');
    res = run('ruff check . --fix', { cwd: root });
    linted = true;
  }
  if (!linted && isFile(path.join(root, 'go.mod')) && which('golangci-lint')) {
    out('[pre-commit-lint] 检测到 Go 项目，运行 golangci-lint...');
    res = run('golangci-lint run', { cwd: root });
    linted = true;
  }
  if (!linted && isFile(path.join(root, 'pom.xml')) && which('mvn')) {
    out('[pre-commit-lint] 检测到 Java 项目，运行 checkstyle（如已配置 maven-checkstyle-plugin）...');
    res = run('mvn checkstyle:check -q', { cwd: root });
    linted = true;
  }
  if (!linted) { out('[pre-commit-lint] 未检测到已知技术栈的 linter，跳过（不阻断）'); return 0; }
  if (res.status !== 0) {
    err(`[pre-commit-lint] Lint 未通过（exit=${res.status}），提交已阻断。请修复以下问题后重试：\n${tail(res.text, 2000)}`);
    return 2;
  }
  return 0;
}

/* ==================== hook: pre-push-test ==================== */
function hookPrePushTest(evt) {
  const command = String(evt.tool_input?.command || '');
  if (command && !/git\s+push/i.test(command)) return 0;
  const root = rootFromEnv();
  const g = gitFace(root);
  if (g.mode === 'none' || !g.repo) { out(gitSkipLine('pre-push-test', g)); return 0; }
  out(gitSkipLine('pre-push-test', g));
  if (g.mode === 'local') out('[pre-push-test] 注意：profile.git.mode=local（只本地、不外推）却发生推送 → 要么你改了主意（说"换一下 git 方式"走 /harness-assemble，或 /branch-workflow Step 9 配远端），要么这次是例外。**测试门禁照跑，不借模式之名跳过**');
  out('[pre-push-test] === 推送前测试门禁 ===');
  let tested = false, res = { status: 0, text: '' };
  if (isFile(path.join(root, 'package.json'))) {
    out('[pre-push-test] 检测到 Node.js 项目，运行 npm test...');
    res = run('npm test', { cwd: root });
    tested = true;
  }
  if (!tested && isFile(path.join(root, 'pyproject.toml')) && which('pytest')) {
    out('[pre-push-test] 检测到 Python 项目，运行 pytest...');
    res = run('pytest --tb=short -q', { cwd: root });
    tested = true;
  }
  if (!tested && isFile(path.join(root, 'go.mod'))) {
    out('[pre-push-test] 检测到 Go 项目，运行 go test...');
    res = run('go test ./...', { cwd: root });
    tested = true;
  }
  if (!tested && isFile(path.join(root, 'pom.xml')) && which('mvn')) {
    out('[pre-push-test] 检测到 Java 项目，运行 mvn test...');
    res = run('mvn test -q', { cwd: root });
    tested = true;
  }
  if (!tested) {
    out('[pre-push-test] 未检测到已知技术栈的测试套件，跳过（不阻断）');
    out('[pre-push-test] 请确认已手动运行测试后再推送');
    return 0;
  }
  if (res.status !== 0) {
    err(`[pre-push-test] 测试未通过（exit=${res.status}），推送已阻断。失败摘要：\n${tail(res.text, 2000)}`);
    return 2;
  }
  return 0;
}

/* ==================== hook: pre-merge-review ==================== */
function hookPreMergeReview(evt) {
  const command = String(evt.tool_input?.command || '');
  if (command && !/git\s+merge/i.test(command)) return 0;
  const root = rootFromEnv();
  const g = gitFace(root);
  if (g.mode === 'none' || !g.repo) { out(gitSkipLine('pre-merge-review', g)); return 0; }
  out('[pre-merge-review] === 合并前审查检查清单 ===');
  out('');
  const status = gitRun(root, ['status', '--porcelain']);
  if (status.text) {
    out('[pre-merge-review] 警告: 有未提交的变更:');
    // 旧实现 `Write-Host $status` 会把数组按空格拼成一行，多文件时不可读 → 逐行呈现
    for (const line of status.text.split('\n')) out(line);
    out('');
  }
  out(`[pre-merge-review] 当前分支: ${gitRun(root, ['branch', '--show-current']).text}`);
  /* 🔴 P2-2：主干名 gitFace 早探到了（profile.git.trunk → symbolic-ref），这里却硬写 main/master。
   * trunk 叫 develop 时两发 diff 都返回空 → "变更统计"整块静默消失，看起来像"没有变更"。
   * 顺序改为：项目声明/探测到的 trunk → main → master（去重）。 */
  const bases = [g.trunk, 'main', 'master'].filter((v, i, a) => v && a.indexOf(v) === i);
  let diff = '';
  for (const b of bases) { diff = gitRun(root, ['diff', '--stat', `${b}...HEAD`]).text; if (diff) break; }
  if (diff) { out('[pre-merge-review] 变更统计:'); out(diff); out(''); }
  out('[pre-merge-review] 合并前请确认:');
  for (const item of ['所有测试通过', '代码审查已完成（/spec-aligned-review 规格轴审查）', '无 Critical/Major 问题', '文档已同步更新', 'CHANGELOG 已更新']) {
    out(`  [ ] ${item}`);
  }
  out('');
  return 0;
}

/* ==================== hook: post-edit-format ==================== */

/** 🔴 P1-3 注入面收口。`run()` 走 `shell:true`，而 filePath 来自宿主事件＝外部输入：
 *  一个含 `"` 的文件名就能闭合引号、在项目根里执行任意命令。两道闸：
 *   ① 越界即跳过——只允许格式化项目根以内的文件；
 *   ② 含 shell 元字符即跳过并**显式说明原因**——宁可这次不格式化，也不拿用户机器当靶。
 *  代价说清楚：带撇号/美元符的合法文件名（`it's.tsx`）会被跳过。这是有意的保守取舍，
 *  且跳过路径有回显（并写进 hook-registry 的对外口径），不是静默失效。
 *  🔴 字符集按 review 补全：`%`（cmd.exe 在双引号内**仍展开** `%VAR%`）、`^`（cmd 转义符）、
 *  `!`（delayed expansion）、`\`（POSIX 下 `\"` 正好闭合引号）——少一个就是一条真能过的洞。 */
/* 🔴 平台相关，不是洁癖：反斜杠在 Windows 上就是**路径分隔符**，把它列进元字符集会让
 * `D:\proj\src\ok.tsx` 这种最普通的路径被判成"含元字符"⇒ 每台 Windows 机器的格式化**全部静默失效**
 * （v9.12.0 review 实跑抓到我自己踩进这个坑：三分支复测时连 src/ok.tsx 都被跳过）。
 * POSIX 下 `\` 才是字面转义符（`\"` 能闭合引号），所以只在非 win32 上列入。
 * `%`（cmd 在双引号内仍展开 %VAR%）、`^`（cmd 转义符）、`!`（delayed expansion）Windows 独有，
 * POSIX 下列了只会多跳几个罕见文件名，成本可接受，不再拆两份表。 */
const SHELL_METACHAR = process.platform === 'win32'
  ? /[\"'`$&|;<>()%\n\r\t^!]/
  : /[\"'`$&|;<>()%\n\r\t\\^!]/;
const insideRoot = (p, root) => {
  const abs = path.resolve(p), r = path.resolve(root);
  /* 🔴 基址与大小写都要对齐：调用方传进来的已经是**绝对路径**（见 hookPostEditFormat，
   * 基址刻意用与执行同一个 root），这里不再二次 resolve 成别的基。
   * win32 路径大小写不敏感，`d:\p` vs `D:\P` 若按字面比会误判越界 ⇒ 静默不格式化。 */
  const ci = process.platform === 'win32';
  const [a, b] = ci ? [abs.toLowerCase(), r.toLowerCase()] : [abs, r];
  return a === b || a.startsWith(b + path.sep);
};

/** 不经 shell 的执行通道：数组传参，元字符不再是语法。
 *  ⚠️ 只用于**真文件**（node / .cjs / .exe）。Windows 下 `node_modules/.bin/prettier` 是 .cmd 垫片，
 *  对垫片用 `shell:false` 会直接 EINVAL（实测 Node v24 / win32）——所以 prettier 走
 *  `process.execPath` + `prettier/bin/prettier.cjs` 这个 JS 入口，绕开垫片而不是硬扛它。 */
const runArgs = (file, args, opts = {}) => {
  const r = cp.spawnSync(file, args, {
    cwd: opts.cwd, encoding: 'utf8', shell: false, windowsHide: true, timeout: opts.timeout ?? 60000,
    stdio: opts.inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status === null ? 1 : r.status, error: r.error, timedOut: r.signal != null, text: (r.stdout || '') + (r.stderr || '') };
};

function hookPostEditFormat(evt) {
  const filePathRaw = String(evt.tool_input?.file_path || process.env.QODER_FILE_PATH || '');
  if (!filePathRaw) return 0;
  const root = rootFromEnv();
  /* 🔴 基址只解析一次，且**必须与执行同一个基**（子进程一律 `cwd: root`）。
   * 旧写法守卫里 resolve 用 process.cwd()、执行用 root：宿主一旦送相对 file_path，
   * "判定在根内的那个文件"与"真正被格式化的那个文件"就不是同一个 ⇒ 守卫给 A 放行、给 B 动手。 */
  const filePath = path.resolve(root, filePathRaw);
  if (!fs.existsSync(filePath)) return 0;
  const ext = path.extname(filePath).toLowerCase();
  // 项目根自己带元字符时，任何拼接都会进 shell——这条路整条关掉，不假装安全。
  if (SHELL_METACHAR.test(root)) {
    out(`[post-edit-format] 跳过：项目根路径本身含 shell 元字符（${root}），本次不对任何文件起格式化进程`);
    return 0;
  }
  if (!insideRoot(filePath, root)) {
    out(`[post-edit-format] 跳过：${filePath} 不在项目根 ${root} 内——本 hook 不对根外文件起进程`);
    return 0;
  }
  if (SHELL_METACHAR.test(filePath)) {
    out(`[post-edit-format] 跳过：${filePath} 含 shell 元字符（引号/反引号/$/&/|/;/括号/%/反斜杠等）。本 hook 以 shell 方式起格式化进程，对这类路径**宁可不做也不执行**；去掉文件名里的这些字符即恢复格式化（P1-3 的代价，本行就是回显，不是静默失效）`);
    return 0;
  }
  /* 🔴 attempted ≠ succeeded。旧写法五个汇点全部丢弃退出码就 formatted=true，于是同时：
   * ① 格式化失败被静默吞掉；② 后续兜底腿被跳过；③ 那句"未找到格式化工具"也永远不说。
   * 三件事叠成"看起来格式化过了"。现分开记账，失败就明说"尝试过但没成功"。 */
  let attempted = false, succeeded = false;
  const report = (name, r) => {
    attempted = true;
    if (r.status === 0) { succeeded = true; return; }
    err(`[post-edit-format] ${name} 未成功（退出码 ${r.status}${r.timedOut ? '，超时被杀' : ''}${r.error ? '：' + r.error.message : ''}）\n`);
  };
  if (['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html'].includes(ext)) {
    const jsEntry = ['node_modules/prettier/bin/prettier.cjs', 'node_modules/prettier/bin/prettier.js']
      .map(rel => path.join(root, ...rel.split('/'))).find(isFile);
    if (jsEntry) report('prettier（JS 入口，不经 shell）', runArgs(process.execPath, [jsEntry, '--write', filePath], { cwd: root, inherit: true }));
    const prettier = binIn(root, 'prettier');
    if (!succeeded && isFile(prettier)) report('prettier（.bin 垫片）', run(`${quoted(prettier)} --write ${quoted(filePath)}`, { cwd: root, inherit: true }));
    const npx = binIn(root, 'npx');
    if (!succeeded && isFile(npx)) report('npx prettier', run(`${quoted(npx)} prettier --write ${quoted(filePath)}`, { cwd: root, inherit: true }));
  } else if (ext === '.py') {
    if (which('black')) report('black', run(`black ${quoted(filePath)}`, { cwd: root, inherit: true }));
    else if (which('ruff')) report('ruff format', run(`ruff format ${quoted(filePath)}`, { cwd: root, inherit: true }));
  } else if (ext === '.go') {
    if (which('gofmt')) report('gofmt -w', run(`gofmt -w ${quoted(filePath)}`, { cwd: root, inherit: true }));
  }
  if (succeeded) return 0;
  if (attempted) { err(`[post-edit-format] ⚠️ ${filePath} 的格式化**尝试过但没成功**（成因见上面各行）——文件已落盘、仍是未格式化状态。本行刻意不说"未找到工具"，也不说"已格式化"\n`); return 0; }
  out(`[post-edit-format] 未找到 ${ext} 的格式化工具，跳过格式化`);
  return 0;
}

/* ==================== hook: audit-log ==================== */
function hookAuditLog(evt) {
  let hookEvent = String(evt.hook_event_name || 'unknown');
  let toolName = String(evt.tool_name || 'unknown');
  let filePath = String(evt.tool_input?.file_path || 'N/A');
  if (process.env.QODER_HOOK_EVENT) hookEvent = String(process.env.QODER_HOOK_EVENT);
  if (process.env.QODER_TOOL_NAME) toolName = String(process.env.QODER_TOOL_NAME);
  if (process.env.QODER_FILE_PATH) filePath = String(process.env.QODER_FILE_PATH);
  const dir = path.join(rootFromEnv(), '.qoder', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  // N1：PS 5.1 的 Add-Content -Encoding UTF8 建文件带 BOM 且行尾 CRLF → Node 侧 appendFileSync 无 BOM + LF
  appendRawLine(dir, `audit-${localDate(now)}.log`, `${localStamp(now)} | ${hookEvent} | ${toolName} | ${filePath}`);
  const cutoff = now.getTime() - 30 * 86400000;
  for (const f of fs.readdirSync(dir)) {
    if (!/^audit-.*\.log$/.test(f)) continue;
    const p = path.join(dir, f);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch { /* 保留策略尽力而为，不影响主流程 */ }
  }
  return 0;
}

/* ==================== hook: session-start-context（E12 + §7.6 第 1 行） ==================== */
function hookSessionStartContext(evt) {
  const root = rootFromEvent(evt);
  const guide = [];
  const agentsMd = path.join(root, 'AGENTS.md');
  if (isFile(agentsMd)) {
    const head = fs.readFileSync(agentsMd, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(0, 5);
    guide.push(`AGENTS.md 前 5 行：\n${head.map(l => '  ' + l).join('\n')}`);
  } else {
    guide.push('AGENTS.md 未找到：建议运行「初始化 Harness」');
  }
  const stack = [];
  const push = (file, name) => { if (isFile(path.join(root, file)) && !stack.includes(name)) stack.push(name); };
  push('package.json', 'Node.js'); push('pyproject.toml', 'Python'); push('requirements.txt', 'Python');
  push('go.mod', 'Go'); push('pom.xml', 'Java (Maven)'); push('build.gradle', 'Java (Gradle)'); push('Cargo.toml', 'Rust');
  guide.push(`技术栈: ${stack.length ? stack.join(', ') : '未检测到已知技术栈'}`);
  const qoderDir = path.join(root, '.qoder');
  if (isDir(qoderDir)) {
    // 别名层：两种扩展名都接、按 basename 去重（改名后只筛 .mdc 会恒报 0）
    const bases = new Set();
    try {
      for (const e of fs.readdirSync(path.join(qoderDir, 'rules'), { withFileTypes: true })) {
        if (!e.isFile()) continue;
        const ext = path.extname(e.name).toLowerCase();
        if (ext === '.md' || ext === '.mdc') bases.add(path.basename(e.name, ext));
      }
    } catch { /* rules 目录可能不存在 */ }
    let skills = 0;
    try {
      for (const e of fs.readdirSync(path.join(qoderDir, 'skills'), { withFileTypes: true })) {
        if (e.isDirectory() && e.name !== 'better-coding' && isFile(path.join(qoderDir, 'skills', e.name, 'SKILL.md'))) skills++;
      }
    } catch { /* skills 目录可能不存在 */ }
    let agents = 0;
    try {
      agents = fs.readdirSync(path.join(qoderDir, 'agents')).filter(f => /\.md$/i.test(f) && isFile(path.join(qoderDir, 'agents', f))).length;
    } catch { /* agents 目录可能不存在 */ }
    guide.push(`Harness: ${bases.size} rules, ${skills} skills, ${agents} agents`);
  } else {
    guide.push('Harness: .qoder/ 未初始化：建议运行「初始化 Harness」');
  }
  if (isDir(path.join(root, 'docs'))) {
    const countMd = dir => {
      let n = 0;
      const walk = d => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(d, e.name));
          else if (/\.md$/i.test(e.name)) n++;
        }
      };
      walk(dir);
      return n;
    };
    guide.push(`文档: docs/ 下有 ${countMd(path.join(root, 'docs'))} 个 Markdown 文件`);
  }
  if (isFile(path.join(root, 'docs', 'PROJECT-LIVE.md'))) {
    guide.push('收尾前必读 docs/PROJECT-LIVE.md 的提示词总表与项目交接文档，并按 live-refresh 三步同步（架构全貌看 PROJECT-LIVE.html）');
  }
  if (isFile(path.join(root, 'docs', 'CONTEXT.md'))) guide.push('检测到 docs/CONTEXT.md（v6 前项目），建议一并阅读');
  const text = `=== better-coding 会话引导 ===\n${guide.join('\n')}\nRepoWiki: 若项目已生成 RepoWiki，建议先查阅以获取架构上下文`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
  }) + '\n');
  return 0;
}

/* ==================== hook: sync-detector（§7.6 第 2 行：PostToolUse + tool_input.file_path） ==================== */
const DOC_SUBDIRS = ['prd', 'arch', 'spec'];
const DOC_EXT = ['.md', '.yaml', '.yml', '.sql'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'target', 'vendor', 'bin', 'obj', '.qoder']);
const CODE_EXT = /\.(cs|ts|tsx|js|jsx|py|go|java|rb|php)$/;

function recentCodeFile(dir, depth, cutoff) {
  if (depth > 4) return false;
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  for (const e of items) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (recentCodeFile(p, depth + 1, cutoff)) return true;
    } else {
      if (!CODE_EXT.test(e.name)) continue;
      try { if (fs.statSync(p).mtimeMs > cutoff) return true; } catch { /* 忽略 */ }
    }
  }
  return false;
}

function hookSyncDetector(evt) {
  const root = rootFromEvent(evt);
  const profilePath = path.join(root, '.qoder', 'harness-profile.json');
  if (!isFile(profilePath)) return 0;
  let knownDocs = [];
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    if (Array.isArray(profile.knownDocs)) knownDocs = profile.knownDocs;
  } catch { return 0; }
  const docsDir = path.join(root, 'docs');
  const relOf = abs => path.relative(root, abs).split(path.sep).join('/');
  const isDocPath = rel => DOC_SUBDIRS.some(s => rel.startsWith(`docs/${s}/`)) && DOC_EXT.includes(path.extname(rel).toLowerCase());

  // 确定性判定：只看刚被写入的那一个文件，不再全树扫描、也不靠时间戳猜
  const written = String(evt.tool_input?.file_path || '');
  const newDocs = [];
  if (written) {
    const rel = path.isAbsolute(written) ? relOf(written) : written.split('\\').join('/');
    if (isDocPath(rel) && !knownDocs.includes(rel) && isFile(path.join(root, rel))) newDocs.push(rel);
  }
  if (newDocs.length) {
    out(`[sync-detector] 检测到未登记的新文档（${newDocs.length} 个）：`);
    for (const d of newDocs) out(`  - ${d}`);
    out('[sync-detector] 本次任务收尾前必须执行 harness-continuous-sync 步骤 1-3（唯一规范：.qoder/commands/live-refresh.md）。');
  }

  const specDocs = [];
  const scanDocs = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scanDocs(p);
      else if (DOC_EXT.includes(path.extname(e.name).toLowerCase()) && specDocs.length < 50) specDocs.push(p);
    }
  };
  for (const sub of DOC_SUBDIRS) if (isDir(path.join(docsDir, sub))) scanDocs(path.join(docsDir, sub));
  if (!specDocs.length) return 0;

  let drift = false, gitDecided = false;
  /* 🔴 P2-1：判定仓库用 gitFace（内含 findGitRoot 逐级上溯），不再 `existsSync(root/.git)` 只看一层——
   * 仓库建在父目录时（monorepo / worktree）旧写法把 gitDecided 永远留成 false，
   * 于是这条本可以精确判定的门禁退化成下面的 7 天 mtime 猜测。
   * ⚠️ 只把 `-C` 保持在项目根：git status 是仓库级作用域，改成 -C repoRoot 会把兄弟包的
   * 变更一起卷进 porcelain，那是行为变更不是修缺陷。超时按 gitFace 的 8000ms 对齐，
   * 免得大仓把宿主 hook 顶穿。 */
  const gDoc = gitFace(root);
  if (gDoc.repo) {
    const r = cp.spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    if (r.status === 0) {
      gitDecided = true;
      const porcelain = (r.stdout || '').trim();
      if (porcelain && !/docs\/(prd|arch|spec)\//.test(porcelain)) drift = true;
    }
  }
  if (!gitDecided && !drift) {
    const now = Date.now();
    const freshDoc = specDocs.some(p => { try { return fs.statSync(p).mtimeMs > now - 7 * 86400000; } catch { return false; } });
    if (!freshDoc && recentCodeFile(root, 1, now - 7 * 86400000)) drift = true;
  }
  if (drift) out('[sync-detector] 检测到代码变更未同步规格，建议运行 /spec-delta（代码→规格收敛：识别实现与规格偏差并给出修订建议）。');
  return 0;
}

/* ==================== hook: stop-verify（§7.3 去自证 + E5 桩变实现） ==================== */
/** 定点回写 profile.sync：只动 syncCount 与 lastVerify 两处，其余字节与缩进风格原样保留。
 *  写前在内存完成回读校验（非法 JSON / 键不唯一 / 目标值不符即放弃），所以 profile 不会被写坏。 */
function patchProfileSync(text, dateStr) {
  let probe;
  try { probe = JSON.parse(text); } catch { return { ok: false, reason: 'profile 不是合法 JSON，放弃定点回写' }; }
  if (!probe || typeof probe !== 'object') return { ok: false, reason: 'profile 解析为空，放弃定点回写' };
  if (!probe.sync) return { ok: false, reason: 'profile 无 sync 节点，放弃定点回写' };
  const mCount = /("syncCount"\s*:\s*)(\d+)/.exec(text);
  if (!mCount) return { ok: false, reason: '未找到 "syncCount" 键，放弃定点回写' };
  const newCount = Number(mCount[2]) + 1;
  let next = text.slice(0, mCount.index + mCount[1].length) + String(newCount) + text.slice(mCount.index + mCount[0].length);
  const verifyJson = `{"status": "PASS", "at": "${dateStr}", "source": "stop-verify-hook"}`;
  const mObj = /"lastVerify"\s*:\s*\{/.exec(next);
  const mScalar = /"lastVerify"\s*:\s*(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null)/.exec(next);
  if (mObj) {
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = mObj.index + mObj[0].length - 1; j < next.length; j++) {
      const ch = next[j];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) return { ok: false, reason: 'lastVerify 对象花括号不配平，放弃定点回写' };
    next = next.slice(0, mObj.index) + '"lastVerify": ' + verifyJson + next.slice(end + 1);
  } else if (mScalar) {
    next = next.slice(0, mScalar.index) + '"lastVerify": ' + verifyJson + next.slice(mScalar.index + mScalar[0].length);
  } else {
    const anchor = /"syncCount"\s*:\s*\d+/.exec(next);
    next = next.slice(0, anchor.index) + '"lastVerify": ' + verifyJson + ', ' + next.slice(anchor.index);
  }
  const countOf = needle => next.split(needle).length - 1;
  if (countOf('"lastVerify"') !== 1) return { ok: false, reason: 'lastVerify 键不唯一，放弃写入' };
  if (countOf('"syncCount"') !== 1) return { ok: false, reason: 'syncCount 键不唯一，放弃写入' };
  let check;
  try { check = JSON.parse(next); } catch { return { ok: false, reason: '回写后 JSON 非法，放弃写入' }; }
  if (Number(check.sync.syncCount) !== newCount) return { ok: false, reason: `回读 syncCount 不等于期望值 ${newCount}，放弃写入` };
  if (!check.sync.lastVerify || check.sync.lastVerify.status !== 'PASS') return { ok: false, reason: '回读 lastVerify.status 非 PASS，放弃写入' };
  return { ok: true, text: next, newCount };
}

/* ==================== hook: auto-finalize（v9.8.0 S5，PostToolUse） ==================== */
/* 立项依据：v9.7.0 异地实测中，AI 把 1·1 提示词「我说定稿锁定之前不要进下一步」泛化成
 * "3 步同步也要等你说定稿"，于是交付物已落盘而 profile / 手册 / 面板三本账全部滞后，
 * 且这份滞后对既有判据完全隐形（40 条全在比"账本 vs 账本"）。本 hook 把"磁盘上有哪些
 * 交付物"从 AI 的自觉里拿走，改成机器如实登记，顺带宣告定稿不等待用户口令。
 * ⚠️ 刻意只写 maturity.mrd/prd 与 history 三处，其余一律不碰，每条都有具体的坏处：
 *   - maturity.arch：有前向消费者 panel_topo_lag（校验器读它要求面板三段真图），脚本一置
 *     true 就自造一条 FAIL —— 与下方 live_profile_drift 那条例外同族的坑；
 *   - knownDocs：是 sync-detector 判「新文档未登记」的依据，脚本登记等于自己把提醒按掉；
 *   - sync.lastSyncAt 与 PROJECT-LIVE footer：那是「3 步同步真跑过一遍」的凭证，脚本写它
 *     等于冒充跑过，sync_freshness 也就永远判不出真相；
 *   - 手册步骤状态 emoji 与 AGENTS.md 语义段：属该步「怎样算做完」清单的语义判断，脚本不猜语义。
 * 所以同步的语义部分仍归 AI；本 hook 只保证"账上的磁盘事实不靠自觉"。 */
function patchProfileFinalize(text, key, baseName) {
  let probe;
  try { probe = JSON.parse(text); } catch { return { ok: false, reason: 'profile 不是合法 JSON，放弃定点回写' }; }
  if (!probe || !probe.maturity || typeof probe.maturity !== 'object') return { ok: false, reason: 'profile 无 maturity 段，放弃定点回写' };
  if (probe.maturity[key] === true) return { ok: false, reason: 'maturity.' + key + ' 已是 true（幂等跳过，不重复记 history）' };
  const oldLen = Array.isArray(probe.history) ? probe.history.length : -1;
  const mo = /"maturity"\s*:\s*\{[^}]*\}/.exec(text);
  if (!mo) return { ok: false, reason: '未找到 maturity 对象的文本形状，放弃定点回写' };
  const mk = new RegExp('("' + key + '"\\s*:\\s*)false').exec(mo[0]);
  if (!mk) return { ok: false, reason: 'maturity 段里找不到 "' + key + ': false" 的文本形状（profile 形状可能被改过）' };
  let next = text.slice(0, mo.index) + mo[0].slice(0, mk.index) + mk[1] + 'true'
    + mo[0].slice(mk.index + mk[0].length) + text.slice(mo.index + mo[0].length);
  const ho = /"history"\s*:\s*\[/.exec(next);
  if (!ho) return { ok: false, reason: '未找到 history 数组，放弃定点回写' };
  const rowStr = JSON.stringify({
    date: localDate(new Date()), action: 'auto-finalize',
    detail: 'docs 交付物 ' + baseName + ' 落盘 → maturity.' + key + '=true（脚本按磁盘事实登记，非用户口令）',
  });
  /* 追加到数组**末尾**（history 是时间正序的流水账，phase-a-init 与 stop-verify 都按此约定写；
   * 首版插在头部 ⇒ 新行跑到 init 之前，读起来像"开机前就发生"）。定位闭合 ] 要跳过字符串内的括号。 */
  let depth = 0, inStr = false, esc2 = false, closeAt = -1;
  for (let i = ho.index + ho[0].length - 1; i < next.length; i++) {
    const ch = next[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === '\\') { esc2 = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { closeAt = i; break; } }
  }
  if (closeAt < 0) return { ok: false, reason: 'history 数组方括号不配平，放弃定点回写' };
  const head = next.slice(0, closeAt), tail = next.slice(closeAt);
  const isEmpty = /^\[\s*\]$/.test(next.slice(ho.index, closeAt + 1));
  /* v9.9.0 S9-D8：首版把逗号加在"行尾空白之后"，于是新行变成「}⏎  , {…}」——逗号跑到下一行
   * 行首（真环境里 profile 已被写成这个形状）。现在逗号贴住上一个元素，新行独立成行、
   * 缩进沿用数组最后一行的缩进。 */
  const ws = /[ \t\r\n]*$/.exec(head)[0];
  const core = head.slice(0, head.length - ws.length);
  const indM = /\n([ \t]+)\S[^\n]*$/.exec(head + 'x');
  const indent = indM ? indM[1] : '    ';
  next = core + (isEmpty ? '' : (/,\s*$/.test(core) ? '' : ',')) + '\n' + indent + rowStr + ws + tail;
  let check;
  try { check = JSON.parse(next); } catch { return { ok: false, reason: '回写后 JSON 非法，放弃写入' }; }
  if (!check.maturity || check.maturity[key] !== true) return { ok: false, reason: '回读 maturity.' + key + ' 非 true，放弃写入' };
  if (!Array.isArray(check.history) || check.history.length !== oldLen + 1) return { ok: false, reason: '回读 history 条数不等于原条数 +1，放弃写入' };
  if (next === text) return { ok: false, reason: '回写前后文本一致，放弃写入' };
  return { ok: true, text: next };
}

function hookAutoFinalize(evt) {
  const fp = String((evt && evt.tool_input && evt.tool_input.file_path) || '');
  if (!fp) return 0;
  const m = /(?:^|\/)docs\/prd\/(MRD|PRD)[^/\\]*\.mdx?$/i.exec(fp.replace(/\\/g, '/'));
  if (!m) return 0;
  const key = m[1].toUpperCase() === 'MRD' ? 'mrd' : 'prd';
  const root = rootFromEvent(evt);
  const profilePath = path.join(root, '.qoder', 'harness-profile.json');
  if (!isFile(profilePath)) return 0;
  let orig;
  try { orig = fs.readFileSync(profilePath, 'utf8'); } catch (e) { out('[auto-finalize] profile 读不到，本次不代做登记：' + (e && e.message)); return 0; }
  if (orig.charCodeAt(0) === 0xFEFF) { out('[auto-finalize] profile 带 BOM，跳过定点回写（不静默改文件属性）'); return 0; }
  const patched = patchProfileFinalize(orig, key, path.basename(fp));
  if (!patched.ok) { out('[auto-finalize] 未回写 profile：' + patched.reason + '（profile 保持原样）'); return 0; }
  try { fs.writeFileSync(profilePath, patched.text, 'utf8'); } catch (e) { out('[auto-finalize] 写入失败，profile 保持原样：' + (e && e.message)); return 0; }
  out('[auto-finalize] ' + path.basename(fp) + ' 落盘 → maturity.' + key + '=true 已按磁盘事实登记（脚本代做，非用户口令）。定稿自动成立：3 步同步立即执行，不等用户确认 —— footer 日期、{路径} 回填、面板拓扑、同步报告、harness-verify 这五件仍是 AI 的活。');
  return 0;
}


function hookStopVerify() {
  const root = rootFromEnv();
  const dir = path.join(root, '.qoder', 'scripts');
  const mjs = path.join(dir, 'harness-verify.mjs');
  // 只认 .mjs 一条腿（Task 3.3）：旧 .sh 的根目录是位置参数，`bash …sh --fast` 会把
  // "--fast" 当成项目根 → 全判据 file-not-found → SKIP → exit 0，还会回写一条
  // status=PASS 的 verify.stamp。宁缺毋假：校验器不在场就明说，不跑一条会造假证据的兜底腿。
  if (!isFile(mjs)) { out('[stop-verify] 未找到 .qoder/scripts/harness-verify.mjs，本次 Stop 未做门禁校验（重新运行阶段 A 装配即可恢复）'); return 0; }
  const cmd = `${quoted(process.execPath)} ${quoted(mjs)} --fast`;
  const resolved = 'harness-verify.mjs';
  const stampDir = path.join(root, '.qoder', 'logs');
  /* v9.5.0 S9：留痕**先落 started 行**，跑完再补收尾行。
   * 为什么必须换顺序：判据 verify_stamp 要看的凭证正是**本次 Stop 产生的**——旧顺序下"装机的首个
   * Stop"永远看不到自己的 stamp，于是 v9.4.0 S3 把"有心跳无 stamp"升为 FAIL 之后，每台新装机的
   * 第一轮都必判红，还给一条自相矛盾的处置建议（"确认 node 在系统 PATH → 重启 Qoder"），而 hook
   * 能弹窗恰恰证明 node 可达。这不是放松判据：真故障形状（有心跳、从来没有任何 stamp）照旧 FAIL。
   * 附带收益：started 行永不配收尾行 = 校验器中途崩溃或被超时杀掉——旧实现里这种形状完全看不见
   * （它与"hook 从没注册过"共用同一种"无 stamp"外观）。与下方 live_profile_drift 的 v9.2.1 例外
   * 同族：判据要求一份由本次检查自己产出的证据 = 首次必红。 */
  appendLine(stampDir, 'verify.stamp', {
    at: localStamp(new Date()), source: 'stop-verify-hook', script: resolved, fast: true, phase: 'started', exit: null,
  });
  const res = run(cmd, { cwd: root });
  appendLine(stampDir, 'verify.stamp', {
    at: localStamp(new Date()), source: 'stop-verify-hook', script: resolved, fast: true, exit: res.status,
  });
  if (res.status !== 0) {
    /* 唯一例外：live_profile_drift 红在"本 hook 刚回写完 profile、文档按设计滞后一拍"上
     * （细则见 live-refresh.md「hook 回写后的文档跟进」）。判据不降级——verify 仍 FAIL、
     * verify.stamp 仍记 exit=1、任何其它 FAIL 照旧 exit 2 唤醒；只是不再为这一处自造滞后打断会话。 */
    const fails = [...String(res.text || '').matchAll(/^\s*-\s+(\S+)\s+FAIL\b/gm)].map(m => m[1]);
    if (fails.length === 1 && fails[0] === 'live_profile_drift') {
      out('[stop-verify] 本轮唯一 FAIL = live_profile_drift：footer 机械位落后于本 hook 刚写入的 profile.sync.lastVerify（hook 只写 profile、从不写文档）。'
        + '校验器仍判 FAIL、verify.stamp 仍记 exit=1，只是不再为此唤醒会话；下一次 3 步同步按 live-refresh.md 把 docs/PROJECT-LIVE.md footer 的「最近校验」刷回 profile 权威值即闭合。');
      return 0;
    }
    /* v9.8.0 S6：sync_freshness（交付物比同步新）单独走「同一指纹只拽一次」。
     * 为什么必须限次：补不上同步的原因可能是缺信息，每次收工都唤醒 = 会话永远结束不了。
     * 判据本身一字不降（verify 仍 FAIL、verify.stamp 仍记 exit=1、手跑照样看到红），只降"打断"。
     * 与上方 live_profile_drift 那条并成「唤醒例外清单」（hook-registry.md），同族例外不能有两份"唯一"。 */
    if (fails.includes('sync_freshness')) {
      const bad = String(res.text || '').split(/\r?\n/).find(l => /^\s*-\s+sync_freshness\s+FAIL\b/.test(l)) || '';
      const ffp = (/fp=(\S+)/.exec(bad) || [])[1] || 'unknown';
      if (process.env.HARNESS_SYNC_REWAKE === '0') {
        out('[stop-verify] sync_freshness 仍判 FAIL（fp=' + ffp + '）；HARNESS_SYNC_REWAKE=0 → 本轮不唤醒会话。请自行执行 /live-refresh 把三本账刷回磁盘事实。');
        return 0;
      }
      let seenFp = false;
      try { seenFp = fs.readFileSync(path.join(stampDir, 'rewake.stamp'), 'utf8').includes('"fp":"' + ffp + '"'); } catch { seenFp = false; }
      if (!seenFp) { try { appendLine(stampDir, 'rewake.stamp', { at: localStamp(new Date()), source: 'stop-verify-hook', fp: ffp, reason: 'sync_freshness' }); } catch { } }
      /* 只有在「把 sync_freshness 剔除后已无其它 FAIL」时才免唤醒；仍有别的红就照旧 exit 2 ——
       * 限次针对的是这一条自己的死循环，不是把别的门禁一起放松（首版用 every(...) 判条件，
       * 装机基线本就有数条既存红 ⇒ 例外永不生效，V5 实跑抓到）。 */
      if (seenFp && fails.every(f => f === 'sync_freshness')) {
        out('[stop-verify] 同一漂移指纹（fp=' + ffp + '）此前已唤醒过一次，本轮不再为它打断。sync_freshness 仍判 FAIL：下一次 3 步同步把 sync.lastSyncAt 与 footer 刷到该文件之后即闭合。');
        return 0;
      }
    }
    /* v9.3.0 S7 实测抓到的归因缺陷：tail(res.text, 2000) 保尾截头，而 FAIL 行往往在前
     * （maturity_vs_disk 是第 9 行）→ 模型收到「请修复以下问题」后面整段是 PASS 噪声，
     * 真正的红被切掉，门禁不可归因（注入一条 FAIL 实测复现：stderr 里搜不到判据名）。
     * 改为按行筛：状态行 + 所有 FAIL/WARNING 行；筛空才退回 tail 兜底，不静默丢信息。 */
    const badLines = String(res.text || "").split(/\r?\n/)
      .filter(l => /^\s*-\s+\S+\s+(FAIL|WARNING)\b/.test(l) || /^\[harness-verify\] status:/.test(l));
    err(`[stop-verify] harness-verify 校验未通过，请修复以下问题：\n${badLines.length ? badLines.join("\n") : tail(res.text, 2000)}\n${badLines.length ? "  ── 以上为筛出的红/黄行；完整判据明细见 node .qoder/scripts/harness-verify.mjs" : ""}`);
    /* v9.5.0 S8：此处旧文硬写"完整 36 行"。判据数一变这句话就开始说谎（本版 36→37），而它只是
     * 一句指向详情的路标 —— 删数字，不改成"从输出里数行数动态拼回"（那是把一个装饰性数字
     * 换成一处跨脚本耦合：校验器要先打印总数、hook 再解析，两边都得改）。 */
    return 2;
  }
  const profilePath = path.join(root, '.qoder', 'harness-profile.json');
  if (isFile(profilePath)) {
    try {
      const orig = fs.readFileSync(profilePath, 'utf8').replace(/^\uFEFF/, '');
      const patched = patchProfileSync(orig, localDate(new Date()));
      if (!patched.ok) {
        out(`[stop-verify] profile 定点回写未执行：${patched.reason}（profile 保持原样）`);
      } else {
        fs.writeFileSync(profilePath, patched.text, 'utf8');
        out(`[stop-verify] profile 定点回写完成：syncCount=${patched.newCount}，lastVerify=PASS@${localDate(new Date())}（其余字节与缩进风格未改动）`);
      }
    } catch (e) {
      out(`[stop-verify] profile 定点回写未执行：${e && e.message}（profile 保持原样）`);
    }
  }
  return 0;
}

/* ==================== hook: ask-card-guard（判定逻辑在 hook-ask-card.mjs） ==================== */
function hookAskCardGuard(evt) {
  const text = guardCard(evt);
  if (!text) return 0;
  if (askCardGuardBlocks()) { err(text); return 2; }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text },
  }) + '\n');
  return 0;
}

const HOOKS = {
  'ask-card-guard': hookAskCardGuard,
  'block-dangerous': hookBlockDangerous,
  'pre-commit-lint': hookPreCommitLint,
  'pre-push-test': hookPrePushTest,
  'pre-merge-review': hookPreMergeReview,
  'post-edit-format': hookPostEditFormat,
  'audit-log': hookAuditLog,
  'session-start-context': hookSessionStartContext,
  'sync-detector': hookSyncDetector,
  'auto-finalize': hookAutoFinalize,
  'stop-verify': hookStopVerify,
};

/* ==================== 分发 ==================== */
const sub = process.argv[2] || 'noop';
try {
  const raw = await readStdin();
  const evt = raw.trim() ? JSON.parse(raw) : {};

  if (sub === 'selftest') {
    /* v9.4.0 S2：由 phase-a-init 在**换名之前** spawn staging 里这份脚本，证明第 3 层——解释器能起进程、
     * 本文件与兄弟模块解析得动、分发链跑到底。刻意**不写任何文件**：写产物会污染换名前的 staging，
     * 而换名前的失败才谈得上"目标项目一个字节没动"。
     * ⚠️ 它**不**证明第 4 层「宿主能否 spawn 到解释器」——那一层只有 SessionStart/Stop 心跳能证，
     *    判据在 harness-verify 的 rules_loaded_stamp / verify_stamp（v9.4.0 S3 已加期限，不再永久 SKIP）。
     * 不注册进 HOOKS：否则会混进 hook_stubs 从 HOOKS 现算的「显式放行分支」清单，改变那条判据的口径。 */
    process.stdout.write(JSON.stringify({ selftest: 'ok', node: process.version, event: evt.hook_event_name || null }) + '\n');
    process.exitCode = 0;
  } else if (sub === 'rules-stamp') {
    if (evt.hook_event_name === 'InstructionsLoaded' && evt.file_path) {
      // 键名逐字取自运行时 fireInstructionsLoadedEvent 构造点：
      //   file_path / memory_type / load_reason (+ globs / trigger_file_path / parent_file_path)
      // ⚠️ 不是 source / loadReason —— 按错键名读会得到"有记录但字段全空"的假证据。
      appendLine(logsDir, 'rules.stamp', {
        at: new Date().toISOString(),
        file_path: evt.file_path,
        memory_type: evt.memory_type ?? 'Project',
        load_reason: evt.load_reason ?? 'unknown',
        globs: evt.globs,
        trigger_file_path: evt.trigger_file_path,
        parent_file_path: evt.parent_file_path,
      });
    }
  } else if (sub === 'heartbeat') {
    // 心跳是 rules.stamp 的**前置断言**：InstructionsLoaded 未注册时整体不发，
    // 没有心跳就无法区分"规则没加载"与"hook 没跑"。只写元数据，不写 transcript 内容。
    appendLine(logsDir, 'heartbeat.jsonl', {
      at: new Date().toISOString(),
      session_id: evt.session_id,
      cwd: evt.cwd,
      hook_event_name: evt.hook_event_name,
      model: evt.model,
      permission_mode: evt.permission_mode,
    });
  } else if (sub === 'hook') {
    const name = process.argv[3];
    const fn = HOOKS[name];
    // 未注册的子命令一律放行（装配表写错名字不能变成"用户被卡住"），但**必须出声**：
    // 静默 exit 0 会让"settings.json 指到一个不存在的 hook"看起来像 hook 跑成功了。
    if (!fn) {
      process.stderr.write(`[harness] 未注册的 hook 子命令 "${name ?? '(缺参数)'}"，已放行不阻断。可用：${Object.keys(HOOKS).join(', ')}\n`);
      process.exitCode = 0;
    } else {
      process.exitCode = fn(evt);
    }
  }
} catch {
  /* 永不阻断 */
}
if (process.exitCode === undefined) process.exitCode = 0;
