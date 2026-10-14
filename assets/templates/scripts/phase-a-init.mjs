#!/usr/bin/env node
// assets/templates/scripts/phase-a-init.mjs — better-coding 阶段 A 唯一执行器（§3.2 冻结契约 S0–S5）
// 取代 phase-a-init.ps1 / .sh（B1/B2/B3/E5/M1/M2/M3①/M6/N5 的共同来源是"双份实现语义永不对等"）。
// 用法：node phase-a-init.mjs --project-root <项目根> [--project-name <名>] [--skip-panel]
//                                             [--overwrite-customized] [--repush-scripts-only]
// 退出码：0 = PHASE-A-COPY-OK；1 = PHASE-A-COPY-FAIL:<原因>；2 = PHASE-A-PANEL-FAIL
// 铁律：AI 不参与判断，脚本不猜项目内容；不可推导字段一律保持模板初态。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* ============================ 通用工具 ============================ */
const log = (...a) => console.log(...a);
/** die 会直接 process.exit，不走 try/catch → 必须自带清理，否则失败的运行会留下 staging 并占住锁直到 TTL 过期 */
const cleanups = [];
const die = (reason, detail) => {
  for (const c of cleanups) { try { c(); } catch { } }
  log(`PHASE-A-COPY-FAIL:${reason}`);
  if (detail) console.error(String(detail).split('\n').map(s => '  ' + s).join('\n'));
  process.exit(1);
};
const readText = p => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const fileSha = p => sha256(fs.readFileSync(p));
const isWin = process.platform === 'win32';
const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function probe(cmd, cmdArgs, timeout = 20000) {
  try {
    const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', timeout, windowsHide: true });
    return { code: r.status, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim(), missing: !!r.error && r.error.code === 'ENOENT' };
  } catch (e) { return { code: -1, out: '', err: String(e.message || e), missing: false }; }
}
function* walkFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(p); else if (e.isFile()) yield p;
  }
}
/** 目录内的文件清单（posix 相对路径，递归）。源侧用真实目录，目标侧用虚拟视图 */
const listAbs = absRoot => fs.existsSync(absRoot) ? [...walkFiles(absRoot)].map(p => path.relative(absRoot, p).split(path.sep).join('/')) : [];
/** Windows 上"子进程刚退出即删除"会间歇性 EPERM（句柄尚未释放）。staging 清理位于关键路径，
    一次误报就等价于 PHASE-A-COPY-FAIL，回滚路径上则会把可恢复变成留半态 → 一律带重试。 */
const rmrf = (p, opts = {}) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 300, ...opts });
/** 同一目录内、按 basename 归并：改名期间 .md/.mdc 共存只算一条规则 */
const mdBasenames = list => new Set(list.filter(p => !p.includes('/') && /\.(md|mdc)$/.test(p)).map(p => p.replace(/\.(md|mdc)$/, '')));
const topExt = (list, ext) => new Set(list.filter(p => !p.includes('/') && p.endsWith(ext)).map(p => p.slice(0, -ext.length)));
const topNames = list => new Set(list.filter(p => !p.includes('/')));
const skillDirNames = list => new Set(list.filter(p => p.endsWith('/SKILL.md') && p.split('/').length === 2 && p.split('/')[0] !== 'better-coding').map(p => p.split('/')[0]));
const inject = (text, map) => Object.entries(map).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(String(v)), text);
const leftoverTokens = text => [...new Set((text.match(/\{\{[A-Z_]{3,}\}\}/g) || []))];
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['skip-panel', 'overwrite-customized', 'repush-scripts-only'].includes(key)) { out[key] = true; continue; }
    out[key] = argv[++i];
  }
  return out;
}

/* ============================ S0：根发现（唯一算法，两场景通用） ============================ */
// 脚本自身位置 realpath 后回推三级 = SKILL_ROOT。不用 process.cwd()、不用 argv[1]：
// 两者都可能被调用目录或符号链接欺骗（旧 .sh 用不带 -P 的 pwd 即栽在这上面）。
const SKILL_ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
const REQUIRED_ASSETS = ['SKILL.md', 'manifest.json', 'assets/library/L0-universal', 'assets/templates'];

for (const r of REQUIRED_ASSETS) {
  if (!fs.existsSync(path.join(SKILL_ROOT, r))) {
    // B6：执行器缺失时禁止降级为手工复制——留降级教程只会让 AI 现编复制逻辑而不是停下来问用户
    log('PHASE-A-NO-EXECUTOR');
    console.error(`四件套缺失：${r}（SKILL_ROOT=${SKILL_ROOT}）→ 请确认安装位置，禁止现场手写复制逻辑`);
    process.exit(1);
  }
}

const args = parseArgs(process.argv.slice(2));
const src = path.join(SKILL_ROOT, 'assets');
const L0 = path.join(src, 'library', 'L0-universal');
const tpl = path.join(src, 'templates');
/* 🔴 P2-3：manifest.json 是版本号的唯一来源。裸 JSON.parse 一旦碰上截断/半改的 manifest，
 * 用户看到的是 Node 堆栈而不是 PHASE-A-COPY-FAIL:*——A.5 的 18 种人话出口就是为堵这个而设的。
 * 本原因已同步登记进 references/phase-a-checklist.md 的 die() 枚举与 A.5 人话表（三处同批改）。 */
let manifestDoc;
try { manifestDoc = JSON.parse(readText(path.join(SKILL_ROOT, 'manifest.json'))); }
catch (e) { die('manifest-invalid-json', `${path.join(SKILL_ROOT, 'manifest.json')} 读不到或不是合法 JSON：${e.message}`); }
const skillVersion = manifestDoc.version;

/** PROJECT_ROOT：显式传入优先；只有项目级安装形态可推导，其余一律"无法确定目标项目"，不猜（B5） */
let PROJECT_ROOT = args['project-root'] ? path.resolve(String(args['project-root'])) : deriveProjectRoot();
if (!PROJECT_ROOT) die('missing-project-root', 'PROJECT_ROOT 必须显式传入（取消 CWD 默认值，修 M1）。当前 SKILL_ROOT 不是 <项目>/.qoder/skills/better-coding 形态，无法安全推导目标项目。');
if (!fs.existsSync(PROJECT_ROOT)) die('missing-project-root', `PROJECT_ROOT 不存在：${PROJECT_ROOT}`);
PROJECT_ROOT = fs.realpathSync(PROJECT_ROOT);

// M1 自污染守卫：病灶实测 = 不带 --project-root 时 CWD 落在库内，99 个文件写进 skill 自己目录（对账 scripts 165!=66）。
// 判据方向必须是「目标在库内」；spec 片段写的是反方向（库在目标内），而那正是项目级安装的合法形态，照抄会把场景 1 全部打死。
if (PROJECT_ROOT === SKILL_ROOT || PROJECT_ROOT.startsWith(SKILL_ROOT + path.sep)) {
  die('self-contamination-guard', `拒绝把库复制进自己（M1）：PROJECT_ROOT=${PROJECT_ROOT} 位于 SKILL_ROOT=${SKILL_ROOT} 之内`);
}

const dst = path.join(PROJECT_ROOT, '.qoder');
const docsDir = path.join(PROJECT_ROOT, 'docs');
const staging = path.join(dst, '.init-staging');
const stagingBackup = path.join(staging, '_backup');
const today = localDate(new Date());
/* v9.8.0 S4b：装机时刻的本地时间戳（无时区后缀 → Date.parse 按本地时区解析，与 fs mtime 同域）。
 * 为什么不能只给日期：新判据 sync_freshness 比的是「交付物落盘时间 vs sync.lastSyncAt」，
 * 而"装完机当天就跑完 1·1"恰恰是最主要的实测场景——纯日期会让同日的漏记同步完全隐形。
 * 只喂 profile.sync.lastSyncAt 这一处；人读的 footer 与 AGENTS.md 仍用纯日期 {{SYNC_DATE}}。 */
const nowStamp = `${today}T${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}:${String(new Date().getSeconds()).padStart(2, '0')}`;
/* v9.9.0 S1/S3：承重文件名清单的唯一事实源是 manifest#loadBearingFiles（校验器的 filename_case
 * 判据读同一份）。这里只做"取数 + 纠名"两件事：名单取不到就中止，不静默退回本地硬编码——
 * 退回去就等于两份名单各说各话（本库反复栽过的第二事实源）。 */
let LOAD_BEARING = null;
const caseFixed = [], caseSkipped = [];
function readLoadBearing() {
  let v = null;
  try { v = JSON.parse(readText(path.join(SKILL_ROOT, 'manifest.json'))).loadBearingFiles; } catch { }
  if (!Array.isArray(v) || !v.length) die('manifest-field-missing', 'manifest#loadBearingFiles 缺失或为空——阶段 A 的必备件对账与文件名大小写判据都以它为准，缺它不猜');
  return v.map(String);
}
/* 只改文件名、一个字节都不动：改名前后逐字节比对，不一致就回滚临时名并放弃。
 * 精确名与大小写变体同时存在时不自动处置（区分大小写的卷宗上会有两份内容），只报告。 */
function fixLoadBearingCase(list) {
  for (const rel of list) {
    const segs = rel.split('/').filter(Boolean);
    const want = segs[segs.length - 1];
    const parent = segs.length > 1 ? path.join(PROJECT_ROOT, ...segs.slice(0, -1)) : PROJECT_ROOT;
    let real = null;
    try { real = fs.readdirSync(parent); } catch { continue; }
    const wrong = real.find(x => x !== want && x.toLowerCase() === want.toLowerCase());
    if (!wrong) continue;
    if (real.includes(want)) { caseSkipped.push(rel + '（与大小写变体 ' + wrong + ' 同时存在，不自动处置——请人工确认留哪一份）'); continue; }
    const src = path.join(parent, wrong), tmp = src + '.case.tmp', dst2 = path.join(parent, want);
    let beforeBuf = null;
    try {
      beforeBuf = fs.readFileSync(src);
      fs.renameSync(src, tmp);
      fs.renameSync(tmp, dst2);
      const afterBuf = fs.readFileSync(dst2);
      if (beforeBuf.compare(afterBuf) !== 0) throw new Error('改名后字节不一致');
      caseFixed.push(wrong + ' → ' + want);
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.renameSync(tmp, src); } catch { }
      caseSkipped.push(rel + '（改名未完成：' + (e && e.message) + '，内容未动）');
    }
  }
}
const project = args['project-name'] || path.basename(PROJECT_ROOT);
const rel = p => path.relative(PROJECT_ROOT, p).split(path.sep).join('/');
/* v9.4.0 S7 防回潮哨兵的基线快照 —— 必须取在**任何写入之前**（连 .qoder 都还没建的时候）。
 * 为什么不"只看磁盘终态"：用户在环节 7 之后自然会拥有 docs/test/，那时重跑阶段 A 若按终态判定就会
 * 报假故障（用了框架反而不许再初始化）。哨兵要抓的是"本次运行创建了它"，所以必须有个"之前"。 */
const PRE_EXISTING = {};
for (const p of ['docs/test', 'references/ui', '.qoder/repowiki']) PRE_EXISTING[p] = fs.existsSync(path.join(PROJECT_ROOT, p));

function deriveProjectRoot() {
  if (!SKILL_ROOT.endsWith(path.join('.qoder', 'skills', 'better-coding'))) return null;
  const guess = path.resolve(SKILL_ROOT, '..', '..', '..');
  return fs.existsSync(guess) ? fs.realpathSync(guess) : null;
}

/* ============================ 预检 ============================ */
const preflight = [];
const report = (name, ok, note) => { preflight.push({ name, ok }); log(`  [preflight] ${name}=${ok ? 'OK' : 'WARN'}${note ? ' ' + note : ''}`); };

/* v9.4.0 S2：运行时门槛。两条互补探活，**全部发生在任何写入之前**。
 * ① 版本下限只问"跑本脚本的解释器够不够新"。它**不再计入预检通过位**——旧版这里印的是
 *    `report('node', true, process.version)`，而脚本正跑在 Node 上，这条恒真、射程 0，
 *    却占一个 OK 位让读者以为"运行时已核过"。
 * ② selftest 按 hook 的真实形态 spawn 一次 `harness.mjs selftest`，证明解释器能起进程、
 *    本脚本与各兄弟模块解析得动、分发链跑到底。刻意跑**库内源文件**而不是 staging 副本：
 *    两者字节等同（staged 内容已由 SHA256 记账约束），而源文件在写 staging 之前就可用，
 *    失败时目标项目连 `.qoder/` 都还没被写过。
 * ⚠️ 两条都**不**证明第 4 层「宿主 spawn hook 时能否解析到解释器」——那一层只有 SessionStart/Stop
 *    心跳能证（判据：harness-verify 的 rules_loaded_stamp / verify_stamp，v9.4.0 S3 给 SKIP 加了期限）。 */
const RUNTIME = { minMajor: 18, selftest: null };
try { RUNTIME.minMajor = Number(JSON.parse(readText(path.join(SKILL_ROOT, 'manifest.json'))).runtime?.nodeMinMajor) || 18; } catch { }
{
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < RUNTIME.minMajor) {
    die('runtime-too-old', `Node ${process.versions.node}（主版本 ${major}）低于要求的 manifest#runtime.nodeMinMajor=${RUNTIME.minMajor}。升级 Node 后重跑；**禁止为使本机通过而调低该阈值**。`);
  }
  const st = probe(process.execPath, [path.join(tpl, 'scripts', 'harness.mjs'), 'selftest'], 8000);
  RUNTIME.selftest = st.code === null ? -1 : st.code;
  if (st.missing) die('runtime-missing', `spawn ${process.execPath} 返回 ENOENT：解释器已不可用（${st.err || '无 stderr'}）`);
  if (RUNTIME.selftest !== 0) {
    die('runtime-missing', `selftest 退出码 ${RUNTIME.selftest}（应为 0）：${(st.err || st.out || '无输出').split('\n')[0]} —— hook 以同一形态起进程将同样失败；宁可不装，也不要装成"36 项全绿但零拦截力"。`);
  }
  log(`  [preflight] node(self)=${process.version} ≥ ${RUNTIME.minMajor} 已过门槛（此行仅自证，不计入预检通过位）`);
  log(`  [selftest] ok —— spawn harness.mjs 退出码 0｜stdout=${st.out.slice(0, 120)}`);
}
try { fs.mkdirSync(dst, { recursive: true }); fs.accessSync(dst, fs.constants.W_OK); report('writable', true); }
catch (e) { die('not-writable', `${dst} 不可写：${e.message}`); }
report('path-length', !isWin || PROJECT_ROOT.length <= 200,
  `${PROJECT_ROOT.length} 字符${isWin && PROJECT_ROOT.length > 200 ? '，接近 MAX_PATH，建议短路径重装' : ''}`);
{
  let freeMB = null;
  try { const s = fs.statfsSync(PROJECT_ROOT); freeMB = Math.round(s.bsize * s.bavail / 1048576); } catch { }
  report('disk', freeMB === null || freeMB >= 20, freeMB === null ? '无法探测' : `${freeMB}MB 可用`);
}
/* v9.5.0 S1/S2：git 事实探测 —— **只读、不决策、不写盘**。
 * 今天这里只有一句"非 git 仓库，跳过"，把三件不同的事混在了一起，本版拆开：
 * ① 仓库在不在场：必须**逐级上溯**找 .git（目录或文件——git worktree 的 .git 是文件）。
 *    旧实现只看项目根一层，于是"仓库建在父目录"（monorepo 常态）时三道 git 门禁集体误报
 *    "本项目零拦截力"，而它们其实有守卫对象（spec 取证 2）。
 * ② mode 是**用户的决策位**，脚本没有资格替它取值（I2 探测 ≠ 决策）：只从已存在的 profile
 *    里读，读不到就保持 pending，交给环节 5 开工前 / 阶段 B 装配清单问一次。
 * ③ 每个结论都进 profile.git（唯一权威源），供判据 git_ready、三道门禁与 branch-workflow
 *    Step 0 共同读取。docs-git-tracked 只是其中一个可读结论，名字与语义照旧。
 * ⚠️ harness.mjs 里有一份同义的 findGitRoot（脚本层各自独立、不互相 import），
 *    两者若漂移，判据 git_ready 会当场抓到（profile.repo 与门禁实际判定不一致即报红）。 */
const GIT_PIN_LINES = ['* -text', 'docs/PROJECT-LIVE.html -diff binary linguist-generated'];
const findGitRoot = start => {
  for (let cur = start; ;) {
    let st = null;
    try { st = fs.statSync(path.join(cur, '.git')); } catch { }
    if (st && (st.isDirectory() || st.isFile())) return cur;
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
};
/* pin 的判定口径：**本项目文件树是否被一行 `* -text` 覆盖**。git 会合并祖先目录的
 * .gitattributes，所以仓库根在项目根之上时，装在仓库根那份同样生效——只看项目根会误判。 */
const pinCovers = dir => {
  if (!dir) return false;
  let cur = null;
  try { cur = readText(path.join(dir, '.gitattributes')); } catch { return false; }
  const lines = cur.split(/\r?\n/).map(l => l.trim());
  return GIT_PIN_LINES.every(w => lines.includes(w));
};
const GIT = { mode: 'pending', repo: false, repoRoot: null, gitVersion: null, trunk: null, remote: null, identityConfigured: false, gitattributesPinned: false, probedAt: new Date().toISOString() };
{
  const ver = probe('git', ['--version']);
  /* ⚠️ 实测教训（本版第一次装机就跑出来了）：`git --version` 的真实输出是
   *    "git version 2.52.0.windows.1" —— 版本号前**没有**紧挨着的 `v`（那个 v 是 "version"
   *    的词首，后面跟空格），所以早先写的 /v(\d+\.\d+\.\d+)/ 永不命中，gitVersion 每次装机
   *    都静默落 null，而 profile 看起来"格式合法"、判据也不看这个字段 → 无人发现。
   *    直接抓三段数字；再取不到就退回整行原文（宁可脏数据可见，也不要假 null）。 */
  if (!ver.missing) GIT.gitVersion = (/(\d+\.\d+\.\d+)/.exec(ver.out) || [])[1] || (ver.out ? ver.out.slice(0, 40) : null);
  const root = findGitRoot(PROJECT_ROOT);
  if (root) {
    GIT.repo = true; GIT.repoRoot = root.replace(/\\/g, '/');
    const head = probe('git', ['-C', root, 'symbolic-ref', '--short', 'HEAD']);
    GIT.trunk = head.code === 0 && head.out ? head.out : null;
    const rem = probe('git', ['-C', root, 'remote']);
    GIT.remote = rem.code === 0 ? (rem.out.split(/\r?\n/).filter(Boolean)[0] || null) : null;
  }
  const name = probe('git', ['-C', PROJECT_ROOT, 'config', '--get', 'user.name']);
  const mail = probe('git', ['-C', PROJECT_ROOT, 'config', '--get', 'user.email']);
  GIT.identityConfigured = !!(name.out && mail.out);
  GIT.gitattributesPinned = pinCovers(PROJECT_ROOT) || (GIT.repo && pinCovers(GIT.repoRoot));
  {
    let profMode = null;
    try { profMode = JSON.parse(readText(path.join(dst, 'harness-profile.json'))).git?.mode || null; } catch { }
    if (profMode) GIT.mode = profMode;
  }
  GIT.probedAt = new Date().toISOString();
  const tree = probe('git', ['-C', PROJECT_ROOT, 'rev-parse', '--is-inside-work-tree']);
  if (tree.code !== 0 || tree.out !== 'true') report('docs-git-tracked', true, '非 git 仓库，跳过');
  else if (!fs.existsSync(docsDir)) report('docs-git-tracked', true, 'docs/ 尚未创建');
  else {
    const n = probe('git', ['-C', PROJECT_ROOT, 'ls-files', 'docs']).out.split('\n').filter(Boolean).length;
    report('docs-git-tracked', n > 0, `${n} 个文件已被跟踪`);
  }
  log(`  [git-probe] repo=${GIT.repo}${GIT.repo ? '@' + GIT.repoRoot : ''}｜trunk=${GIT.trunk || '—'}｜remote=${GIT.remote || '—'}｜身份=${GIT.identityConfigured ? '已配' : '未配'}｜行尾钉=${GIT.gitattributesPinned ? '在场' : '缺席'}｜mode=${GIT.mode}（mode 归用户决策，脚本只探测不代选）`);
}

/* ============================ S2：原子锁（10 分钟 TTL 自愈，修 M6） ============================ */
const lockDir = path.join(PROJECT_ROOT, '.qoder-init.lock');
const LOCK_TTL_MS = 10 * 60 * 1000;
function acquireLock(allowSteal) {
  try { fs.mkdirSync(lockDir); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let age = Infinity;
    try { age = Date.now() - fs.statSync(lockDir).mtimeMs; } catch { }
    if (!allowSteal || age <= LOCK_TTL_MS) die('locked', `${lockDir} 已存在且 ${Math.round(age / 1000)}s 前创建（TTL ${LOCK_TTL_MS / 1000}s）→ 若确认无并发初始化，删除该目录后重试`);
    rmrf(lockDir);
    return acquireLock(false);
  }
  try { fs.writeFileSync(path.join(lockDir, 'owner'), JSON.stringify({ pid: process.pid, at: new Date().toISOString(), skillRoot: SKILL_ROOT })); } catch { }
}
const releaseLock = () => { try { rmrf(lockDir); } catch { } };
acquireLock(true);
cleanups.push(releaseLock);
cleanups.push(() => rmrf(staging));

/* ============================ 复制计划（S4：先进 staging，对账通过才换名） ============================ */
const counters = { copied: 0, identical: 0, customizedSkipped: [], panelBackups: [], profilePreserved: false, stubs: 0, stubFiles: [], repushedFrom: [], repushBackups: [] };
const planned = new Map();   // 相对 PROJECT_ROOT 的 posix 路径 → { srcFile? , text?, sha }

function planFile(srcFile, dstFile) {
  const key = rel(dstFile);
  const sha = fileSha(srcFile);
  const target = path.join(PROJECT_ROOT, key);
  if (fs.existsSync(target)) {
    if (fileSha(target) === sha) { counters.identical++; return; }
    if (!args['overwrite-customized']) { counters.customizedSkipped.push(target); return; }
  }
  planned.set(key, { srcFile, sha });
}
function planTree(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) die('missing-asset', `SKILL 库资产缺失: ${srcDir}`);
  for (const f of walkFiles(srcDir)) planFile(f, path.join(dstDir, path.relative(srcDir, f)));
}
/**
 * 框架代码（脚本层）专用：与 planFile 的差别只有一个——不与"用户定制"混为一谈。
 * 项目内脚本与库不一致，绝大多数情况是**库升级前的旧构建**（脚本不是定制面，全库没有任何指引让用户改它），
 * 按 SHA256 保护会让 --repush-scripts-only 变成空操作，而它是 8.5.0/9.0.0 升级序列的第一步（不做则项目仍跑旧扩展名过滤）。
 * 因此这里只打 displaced 标记，真正的备份留到换名**成功之后**做：对账失败 → staging 丢弃 → 项目一个字节没动。
 */
function planFrameworkFile(srcFile, dstFile) {
  const key = rel(dstFile);
  const sha = fileSha(srcFile);
  const target = path.join(PROJECT_ROOT, key);
  if (fs.existsSync(target)) {
    if (fileSha(target) === sha) { counters.identical++; return; }
    counters.repushedFrom.push(key);
  }
  planned.set(key, { srcFile, sha, displaced: true });
}
/** 带 token 的文档：比对基准必须是**注入后的期望内容**，否则复跑会把脚本自己的注入误判为"用户定制"（实测假阳性：AGENTS.md 与 PROJECT-LIVE.md） */
function planTokenized(srcFile, dstFile, map) {
  if (!fs.existsSync(srcFile)) die('missing-template', `模板缺失: ${srcFile}`);
  const templateText = readText(srcFile);
  const expected = inject(templateText, map);
  const residual = leftoverTokens(expected);
  if (residual.length) die('token-residual', `token 未注入完全: ${rel(dstFile)} 残留 ${residual.join(',')}`);
  const target = path.join(PROJECT_ROOT, rel(dstFile));
  if (fs.existsSync(target)) {
    const cur = readText(target);
    if (cur === expected) { counters.identical++; return; }
    if (cur !== templateText && !args['overwrite-customized']) { counters.customizedSkipped.push(target); return; }
  }
  planned.set(rel(dstFile), { text: expected, sha: sha256(Buffer.from(expected, 'utf8')) });
}
/** 换名前的对账口径：目标目录的"虚拟视图" = 磁盘现存 ∪ 本次计划写入（计划覆盖现存） */
function virtualList(dirRel) {
  const abs = path.join(PROJECT_ROOT, dirRel);
  const out = new Map();
  if (fs.existsSync(abs)) for (const p of listAbs(abs)) out.set(p, 1);
  for (const key of planned.keys()) if (key.startsWith(dirRel + '/')) out.set(key.slice(dirRel.length + 1), 1);
  return [...out.keys()];
}

/* ============================ 有序步骤（顺序不可变） ============================ */
try {
  const settingsTemplate = path.join(tpl, 'hooks', isWin ? 'settings.json.template' : 'settings.linux.json.template');
  if (!fs.existsSync(settingsTemplate)) die('missing-template', `settings 模板缺失: ${settingsTemplate}`);

  /* v9.4.0 S7（用户裁定）：**不再预建** `docs/test/` 与 `references/ui/`。
   * 动因：这两处连同 .qoder/repowiki/wiki_plan.yaml 一样，从没进过 A.2 落盘清单、reconcile 的 8 维、
   * 也没进 36 项判据 —— 属"落盘面与账本三处脱账"。裁定方向是**删行为**而不是补记账（见 spec §7 第 7 条）。
   * 归属者：docs/test/ → /run-tests 与 /web-e2e-test（环节 7 首写时自建）；
   *          references/ui/ → /ui-design 与 /create-proposal 的交互原型（环节 1·3 / 4 首写时自建）。 */
  for (const d of ['.qoder/rules', '.qoder/skills', '.qoder/agents', '.qoder/commands', '.qoder/hooks',
    '.qoder/scripts', '.qoder/logs/tmp', 'docs/prd', 'docs/arch', 'docs/spec', 'docs/harness-templates'])
    fs.mkdirSync(path.join(PROJECT_ROOT, d), { recursive: true });

  const syncSrc = ['.md', '.mdc'].map(e => path.join(tpl, 'rules', 'harness-continuous-sync' + e)).find(p => fs.existsSync(p));

  if (args['repush-scripts-only']) {
    // Task 4.4：存量项目改名前先拿到别名层——只重推脚本与 settings，不动六类组件
    // 脚本层走 planFrameworkFile：这里"与库不同"的默认解释是旧构建而非用户定制
    for (const f of walkFiles(path.join(tpl, 'scripts'))) planFrameworkFile(f, path.join(dst, 'scripts', path.basename(f)));
    /* Task 6.1：检测器与脚本层同性质（SKILL 托管代码，不是用户定制面），repush 必须能把它补进存量项目；
     * deps 模板**不**在此列——它是 docs/ 下用户可改的文档，走正常两态保护。 */
    { const driftSrc = path.join(tpl, 'contract-governance', 'contract-drift.mjs');
      if (fs.existsSync(driftSrc)) planFrameworkFile(driftSrc, path.join(dst, 'scripts', 'contract-drift.mjs')); }
  } else {
    for (const must of ['rules', 'skills', 'agents', 'commands', 'hooks', 'spec-templates'])
      if (!fs.existsSync(path.join(L0, must))) die('missing-asset', `SKILL 库资产缺失: ${path.join(L0, must)}（请核对安装位置）`);
    planTree(path.join(L0, 'rules'), path.join(dst, 'rules'));
    planTree(path.join(L0, 'skills'), path.join(dst, 'skills'));
    planTree(path.join(L0, 'agents'), path.join(dst, 'agents'));
    planTree(path.join(L0, 'commands'), path.join(dst, 'commands'));
    for (const f of walkFiles(path.join(L0, 'hooks'))) if (f.endsWith('.md')) planFile(f, path.join(dst, 'hooks', path.basename(f)));
    planTree(path.join(L0, 'spec-templates'), path.join(docsDir, 'harness-templates'));

    if (!syncSrc) die('missing-template', 'rules-self-maintained:源缺失(harness-continuous-sync.md|.mdc)');
    planFile(syncSrc, path.join(dst, 'rules', path.basename(syncSrc)));
    planFile(path.join(tpl, 'techstack-commands.json'), path.join(dst, 'techstack-commands.json'));
    /* v9.4.0 S7（用户裁定）：**不再落 `.qoder/repowiki/wiki_plan.yaml`**。
     * 三点理由：① 它从未进 A.2 清单、reconcile 8 维、36 项判据（三处脱账）；② 原实现直接 copyFileSync 到目标，
     * 绕开了 staging + 原子换名，是 S4 契约的一个例外；③ 它承载的是"要不要定制 wiki 结构"这个用户决定，
     * 不是初始化必答项。模板 `assets/templates/repowiki-wiki-plan.yaml` **保留在库内**（骨架版，含 version
     * 与 documents 结构；字段与硬上限的唯一权威源是 platform-profile §十，本注释刻意不复制数字——复制了必然
     * 脱账）。用户要定制时由 AI 从库内直读后创建。🔴 该模板刻意**不含 scope 块**：平台尚未实现该能力。 */
    planFile(path.join(tpl, 'briefing-skeletons.md'), path.join(dst, 'briefing-skeletons.md'));
    /* v9.3.0 S4：脚本层走框架通道，不再走 planFile 的"定制保护"。
     * 旧行为实测后果：老用户升级库后重跑阶段 A，项目里的 harness-verify.mjs 与库不同 →
     * 被判 customized_skipped 跳过 → 项目继续跑**旧校验器**，新判据根本落不进去。
     * 脚本不是定制面（全库没有任何指引让用户改 .qoder/scripts/），按 planFrameworkFile 既有语义处理：
     * 与库不同即视为"库升级前的旧构建"并回刷，被换下的内容由后面的备份循环存进 logs/backup/。 */
    for (const f of walkFiles(path.join(tpl, 'scripts'))) planFrameworkFile(f, path.join(dst, 'scripts', path.basename(f)));
    /* Task 6.1 契约漂移门禁（环节 3 登记 / 环节 6 前置校验的机械出口：breaking_drift → 退出码 1 阻断）。
     * 两件源文件放 `assets/templates/contract-governance/` 而非 templates/scripts：`componentCounts.scripts`
     * 的定义域就是那个目录的文件数，计进去会让"计数 = 磁盘真值"失效；本维度另立两键（tools/checks/31 对磁盘、
     * harness-verify V22 判项目侧在场）。落盘位置不变：检测器仍进 `.qoder/scripts/`，模板仍进 `docs/harness-templates/`。 */
    {
      const driftSrc = path.join(tpl, 'contract-governance', 'contract-drift.mjs');
      const depsTplSrc = path.join(tpl, 'contract-governance', 'deps-template.yaml');
      for (const p of [driftSrc, depsTplSrc])
        if (!fs.existsSync(p)) die('missing-template', `契约漂移门禁资产缺失: ${p}（缺它则环节 3 登记与环节 6 校验无脚本可跑，禁止静默降级为散文判据）`);
      /* v9.3.0 S4：检测器落 .qoder/scripts/，与脚本层同性质 → 走框架通道；
       * deps 模板落 docs/harness-templates/，是用户可改的文档 → 保持 planFile 的定制保护。 */
      planFrameworkFile(driftSrc, path.join(dst, 'scripts', 'contract-drift.mjs'));
      planFile(depsTplSrc, path.join(docsDir, 'harness-templates', 'deps-template.yaml'));
    }

    /* v9.7.0 S1/D3：新增第 4 个 token NODE_MIN（取 manifest#runtime.nodeMinMajor，经 RUNTIME 读入），
     * 兑现 AGENTS.md 模板自己那句"阈值不在本文写死"。PROJECT-LIVE 不含此 token，inject 只替换文中存在的键，多给无害。 */
    /* v9.9.0 S3：纠名必须早于任何写入与 SHA 比对——Windows 上"用大写路径往已存在的小写文件里
     * 写字节"不会把名字改回来（本机实测），所以只能显式改名。名单在这里惰性读取：此刻还没有
     * 任何项目文件落盘，读不到就是 die(manifest-field-missing)，中止同样保持零落盘。 */
    fixLoadBearingCase(LOAD_BEARING = LOAD_BEARING || readLoadBearing());
    const verifyMap = { SYNC_DATE: today, INIT_DATE: today, INIT_STAMP: nowStamp, VERIFY_STATUS: '待执行', VERIFY_DATE: '待执行', VERIFY_DETAIL: '待执行', NODE_MIN: String(RUNTIME.minMajor) };
    planTokenized(path.join(tpl, 'AGENTS.md.template'), path.join(PROJECT_ROOT, 'AGENTS.md'), verifyMap);
    planTokenized(path.join(tpl, 'docs', 'PROJECT-LIVE.md'), path.join(docsDir, 'PROJECT-LIVE.md'), verifyMap);
    planFile(path.join(tpl, 'docs', '项目交接.md'), path.join(docsDir, '项目交接.md'));

    const profileRel = '.qoder/harness-profile.json';
    const profPath = path.join(PROJECT_ROOT, profileRel);
    if (fs.existsSync(profPath)) {
      counters.profilePreserved = true;
      /* 🔴 "保留项目状态"不等于"不补框架字段"。实测 sim2-crm 的 profile 里没有 skillRoot
         （该字段是后加的、只在**新建**分支写入），于是校验器在自拷贝 manifest 陈旧时
         没有任何读到库版 manifest 的通道，退役组件检测只能退化成 SKIP。
         🔴 第二版实测（本轮再跑 sim2-crm）：只补"缺失"仍不够 —— **值已变**的 skillVersion
         不刷新，库一升级 profile 就永久停在旧版本上，落盘 version_single_source 长红。
         这两个字段是库自有事实（库版本、库位置），不属于用户状态，必须跟随库走；
         maturity/sync/incidents/knownDocs 等一律不碰。
         用文本插入/定点替换而不是整份 stringify 重排（重排会打乱用户文件的键序、造出假 diff）。
         不走 planned 通道：那条通道对"已存在且内容不同"的文件按用户定制跳过，补不进去。 */
      const profText = readText(profPath);
      let pj = null;
      try { pj = JSON.parse(profText); } catch { pj = null; }
      if (pj && typeof pj === 'object' && !Array.isArray(pj)) {
        const FW = { skillRoot: SKILL_ROOT.replace(/\\/g, '/'), skillVersion };
        /* v9.5.0 S1：git 块**只补不覆**——mode 是用户决策位、其余是判据与同步的刷新对象，
         * 两者都不该被一次装机代改；但旧 profile 完全没这个键，不补就永远没有权威源可读。 */
        const FW_ADD_ONLY = pj.git === undefined
          ? { git: { mode: GIT.mode, repo: GIT.repo, repoRoot: GIT.repoRoot ? GIT.repoRoot : null, gitVersion: GIT.gitVersion, trunk: GIT.trunk, remote: GIT.remote, identityConfigured: GIT.identityConfigured, gitattributesPinned: GIT.gitattributesPinned, probedAt: GIT.probedAt } }
          : {};
        const add = [], upd = [];
        for (const k of Object.keys(FW)) {
          if (pj[k] === undefined) add.push(`"${k}": ${JSON.stringify(FW[k])}`);
          else if (pj[k] !== FW[k]) upd.push(k);
        }
        for (const k of Object.keys(FW_ADD_ONLY)) add.push(`"${k}": ${JSON.stringify(FW_ADD_ONLY[k])}`);
        if (add.length || upd.length) {
          const m = profText.match(/\{/);
          const eol = profText.includes('\r\n') ? '\r\n' : '\n';
          const second = profText.slice(m.index + 1).split('\n')[1] || '';
          const pad = (second.match(/^[ \t]+/) || [''])[0];
          let merged = profText;
          if (add.length) merged = merged.slice(0, m.index + 1)
            + eol + add.map(s => `${pad}${s},`).join(eol)
            + merged.slice(m.index + 1);
          for (const k of upd) {
            /* 函数式替换器：替换串里不出现 $1/$&，值含 $ 也不会被重新解释 */
            const re = new RegExp('"' + k + '"(\\s*:\\s*)"[^"]*"');
            if (!re.test(merged)) { log(`[phase-a-init] ⚠️ profile 的 ${k} 形状异常（未能定位其值）——保持原文件不动`); merged = null; break; }
            merged = merged.replace(re, (_all, sep) => `"${k}"${sep}${JSON.stringify(FW[k])}`);
          }
          let mj = null;
          try { mj = merged === null ? null : JSON.parse(merged); } catch { mj = null; }
          const allKeys = new Set([...Object.keys(pj), ...Object.keys(FW)]);
          const untouched = mj && [...allKeys].every(k => k in FW || k in FW_ADD_ONLY || JSON.stringify(mj[k]) === JSON.stringify(pj[k]));
          if (!mj || !untouched) {
            log(`[phase-a-init] ⚠️ profile 框架字段未能补齐/刷新（${mj ? '项目状态被改动' : '合并后 JSON 不可解析'}）——保持原文件不动`);
          } else {
            fs.writeFileSync(profPath + '.bak', profText, 'utf8');
            fs.writeFileSync(profPath, merged, 'utf8');
            counters.profileFieldsAdded = add.length;
            counters.profileFieldsRefreshed = upd.length;
          }
        }
      }
      /* v9.5.0 补丁（本轮验收 2d 实测抓到）：git 的**探测位**属机器事实、不属用户状态 →
       * 二次装机必须刷新，否则磁盘已建仓而 profile.git.repo 仍停在 false（判据只能报漂移、
       * 门禁话术按旧档走）。mode 与 _comment 一律不碰（mode 是用户决策位，探测 ≠ 决策）。
       * 底稿必须从磁盘**重读**——上面那步可能刚写过 profile，拿旧文本合并会把 FW 补齐结果冲掉。
       * 定点替换而非整份 stringify：重排会打乱用户文件键序、造出假 diff（v8.3.0 起本文件的成文纪律）。 */
      {
        const gitProfText = readText(profPath);
        let gitPJ = null;
        try { gitPJ = JSON.parse(gitProfText); } catch { gitPJ = null; }
        const gitBlockStart = gitPJ && gitPJ.git && typeof gitPJ.git === 'object' ? gitProfText.indexOf('"git"') : -1;
        const gitOpen = gitBlockStart >= 0 ? gitProfText.indexOf('{', gitBlockStart) : -1;
        let gitClose = -1;
        if (gitOpen >= 0) {
          let depth = 0;
          for (let i = gitOpen; i < gitProfText.length; i++) {
            if (gitProfText[i] === '{') depth++;
            else if (gitProfText[i] === '}') { depth--; if (depth === 0) { gitClose = i; break; } }
          }
        }
        if (gitOpen >= 0 && gitClose > gitOpen) {
          const REFRESH = {
            repo: GIT.repo, repoRoot: GIT.repoRoot, gitVersion: GIT.gitVersion, trunk: GIT.trunk,
            remote: GIT.remote, identityConfigured: GIT.identityConfigured, gitattributesPinned: GIT.gitattributesPinned, probedAt: GIT.probedAt,
          };
          let span = gitProfText.slice(gitOpen, gitClose + 1);
          let changed = 0, shapeBad = null;
          for (const [k, val] of Object.entries(REFRESH)) {
            const re = new RegExp('("' + k + '"\\s*:\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|-?\\d+(?:\\.\\d+)?|true|false|null)');
            if (!re.test(span)) { shapeBad = k; break; }
            const next = span.replace(re, (_all, sep) => sep + JSON.stringify(val));
            if (next !== span) changed++;
            span = next;
          }
          if (shapeBad) {
            log(`[phase-a-init] ⚠️ profile.git.${shapeBad} 形状异常（未能定位其值）——git 块保持原样，判据 git_ready 会点名漂移`);
          } else if (changed) {
            const merged2 = gitProfText.slice(0, gitOpen) + span + gitProfText.slice(gitClose + 1);
            let j2 = null;
            try { j2 = JSON.parse(merged2); } catch { j2 = null; }
            const othersKept = j2 && Object.keys(gitPJ).every(k => k === 'git' || JSON.stringify(j2[k]) === JSON.stringify(gitPJ[k]));
            const modeKept = j2 && j2.git.mode === gitPJ.git.mode;
            const commentKept = j2 && j2.git._comment === gitPJ.git._comment;
            if (!j2 || !othersKept || !modeKept || !commentKept) {
              log(`[phase-a-init] ⚠️ profile.git 探测位未刷新（${!j2 ? '合并后 JSON 不可解析' : !modeKept ? 'mode 被改动' : !commentKept ? '_comment 被改动' : '其他键被改动'}）——保持原文件不动，判据 git_ready 会点名漂移`);
            } else {
              fs.writeFileSync(profPath, merged2, 'utf8');
              counters.gitProbeRefreshed = changed;
              log(`  [git-probe] profile 已存在 → 就地刷新探测位 ${changed} 处（mode 与 _comment 一字未动）`);
            }
          }
        }
      }
    } else {
      const profSrc = path.join(tpl, 'harness-profile.template.json');
      if (!fs.existsSync(profSrc)) die('missing-template', `模板缺失: ${profSrc}（阶段 A 无法生成 profile）`);
      const text = inject(readText(profSrc), {
        SKILL_VERSION: skillVersion, INIT_DATE: today, INIT_STAMP: nowStamp, SKILL_ROOT: SKILL_ROOT.replace(/\\/g, '/'),
        /* v9.4.0 S2：装机时的运行时事实（跨会话诊断「PATH 里的 node 变了/没了」的唯一落点）。
         * 数值位不带引号 → 漏注入会当场炸成 profile-invalid-json，而不是留下未替换的占位串。 */
        NODE_PATH: process.execPath.replace(/\\/g, '/'), NODE_VERSION: process.version,
        PROBED_AT: new Date().toISOString(), SELFTEST_EXIT: String(RUNTIME.selftest), NODE_MIN_MAJOR: String(RUNTIME.minMajor),
        /* v9.5.0 S1：git 事实块。可空位在模板里**不带引号**，所以这里注入 JSON 字面量
         * （字符串 → "..."，未探到 → null），漏注入会当场炸成 profile-invalid-json 而不是留占位串。 */
        GIT_REPO: String(GIT.repo), GIT_REPO_ROOT: JSON.stringify(GIT.repoRoot), GIT_VERSION: JSON.stringify(GIT.gitVersion),
        GIT_TRUNK: JSON.stringify(GIT.trunk), GIT_REMOTE: JSON.stringify(GIT.remote),
        GIT_IDENTITY: String(GIT.identityConfigured), GIT_PIN: String(GIT.gitattributesPinned), GIT_PROBED_AT: GIT.probedAt,
      });
      try { JSON.parse(text); } catch (e) { die('profile-invalid-json', `注入后 profile 不是合法 JSON：${e.message}`); }
      planned.set(profileRel, { text, sha: sha256(Buffer.from(text, 'utf8')) });
    }
  }
  planFile(settingsTemplate, path.join(dst, 'settings.json'));

  /* M3① 守卫：settings 引用的每个脚本必须真实存在（计划里或磁盘上），否则该 hook 静默不生效 */
  const settingsItem = planned.get('.qoder/settings.json');
  const settingsText = settingsItem ? (settingsItem.text ?? readText(settingsItem.srcFile)) : readText(path.join(PROJECT_ROOT, '.qoder/settings.json'));
  try { JSON.parse(settingsText); } catch (e) { die('settings-invalid-json', e.message); }
  for (const cmd of [...settingsText.matchAll(/"command":\s*"([^"]+)"/g)].map(m => m[1])) {
    const m = cmd.match(/([^\s"']+\.(?:mjs|cjs|js|ps1|sh|py))(?=\s|$)/);
    if (!m) continue;
    const targetRel = m[1].replace(/\\/g, '/').replace(/^\.\//, '');
    if (!planned.has(targetRel) && !fs.existsSync(path.join(PROJECT_ROOT, targetRel))) {
      die('hook-target-missing', `${cmd} → 落盘目标缺失：${targetRel}`);
    }
  }

  /* 写入 staging + 记账 */
  rmrf(staging);
  fs.mkdirSync(staging, { recursive: true });
  const runManifest = { at: new Date().toISOString(), skillRoot: SKILL_ROOT, skillVersion, projectRoot: PROJECT_ROOT, repushScriptsOnly: !!args['repush-scripts-only'], files: [] };
  for (const [key, item] of planned) {
    const stagePath = path.join(staging, key);
    fs.mkdirSync(path.dirname(stagePath), { recursive: true });
    if (item.text !== undefined) fs.writeFileSync(stagePath, item.text, 'utf8');
    else fs.copyFileSync(item.srcFile, stagePath);
    runManifest.files.push({ path: key, sha: item.sha });
  }
  fs.writeFileSync(path.join(staging, 'manifest-of-run.json'), JSON.stringify(runManifest, null, 2), 'utf8');

  /* 对账（换名**之前**，失败即弃 staging → 目标项目一个字节都没动）：口径与 harness-verify Check 2 一致 */
  if (!args['repush-scripts-only']) {
    const srcRules = listAbs(path.join(L0, 'rules'));
    const expectedRules = new Set([...mdBasenames(srcRules), ...(syncSrc ? [path.basename(syncSrc, path.extname(syncSrc))] : [])]);
    const reconcile = [
      ['rules', expectedRules.size, mdBasenames(virtualList('.qoder/rules')).size],
      ['skills-dirs', skillDirNames(listAbs(path.join(L0, 'skills'))).size, skillDirNames(virtualList('.qoder/skills')).size],
      ['skills-allfiles', listAbs(path.join(L0, 'skills')).length, virtualList('.qoder/skills').filter(p => !p.startsWith('better-coding/')).length],
      ['agents-md', topExt(listAbs(path.join(L0, 'agents')), '.md').size, topExt(virtualList('.qoder/agents'), '.md').size],
      ['commands-md', topExt(listAbs(path.join(L0, 'commands')), '.md').size, topExt(virtualList('.qoder/commands'), '.md').size],
      ['hooks-md', topExt(listAbs(path.join(L0, 'hooks')), '.md').size, topExt(virtualList('.qoder/hooks'), '.md').size],
      ['spec-templates', listAbs(path.join(L0, 'spec-templates')).length, virtualList('docs/harness-templates').length],
      ['scripts', topNames(listAbs(path.join(tpl, 'scripts'))).size, topNames(virtualList('.qoder/scripts')).size],
    ];
    /* 比较谓词与 harness-verify Check 2 同源（两处口径分叉会让一个 validator 放行、
     * 另一个把同一状态判死）：只有 commands 精确相等，其余按下限判。
     * 下限而非相等是 v9.0.0 起的硬要求——阶段 B 可选装配的专职专家与 L1/L2 组件
     * 会让目标合法地多于 L0 默认值，逐维 `a !== b` 等于禁止二次初始化。 */
    const EXACT = new Set(['commands-md']);
    const bad = [];
    for (const [n, a, b] of reconcile) {
      const exact = EXACT.has(n);
      const ok = exact ? a === b : b >= a;
      log(`  [reconcile] ${n}: source ${a} ${exact ? '==' : '<='} target ${b}`);
      if (!ok) bad.push(`${n}: source ${a} ${exact ? '!=' : '> '} target ${b}`);
    }
    /* v9.9.0 S1：必备件清单不再本地硬编码，与校验器 filename_case 共用 manifest#loadBearingFiles */
    const required = LOAD_BEARING || readLoadBearing();
    // 面板产物不在这里断言：面板在换名**之后**才跑得起来（需要 .qoder/scripts/build-panel 已落盘），
    // 而本函数是换名**之前**的对账。旧 .ps1 之所以能查，是因为它把面板排在对账之前——S4 契约反过来后必须移位。
    for (const f of required) if (!planned.has(f) && !fs.existsSync(path.join(PROJECT_ROOT, f))) bad.push(`缺失: ${f}`);
    if (bad.length) die('reconcile-failed', '对账失败 -> ' + bad.join('; ') + '（staging 已丢弃，目标项目未被写入）');
  }

  /* 原子换名（逐文件 rename；被覆盖者先挪进 staging/_backup，中途失败可整体还原） */
  const moved = [];
  try {
    for (const key of planned.keys()) {
      const target = path.join(PROJECT_ROOT, key);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const isNew = !fs.existsSync(target);
      if (!isNew) {
        const bak = path.join(stagingBackup, key);
        fs.mkdirSync(path.dirname(bak), { recursive: true });
        fs.renameSync(target, bak);
      }
      fs.renameSync(path.join(staging, key), target);
      /* v9.3.0 S2：新建件的时间戳归一到运行时刻。复制会保留库源文件的老 mtime，
       * 实测后果：docs/项目交接.md 显示的是模板生成日而非本次初始化日，
       * 用户按"修改时间"排序会判定它没被生成。覆盖件不在此列（内容已换，时间戳归库源无害）。 */
      if (isNew) { try { const now = new Date(); fs.utimesSync(target, now, now); } catch { /* 时间戳失败不影响落盘 */ } }
      moved.push(key);
      counters.copied++;
    }
  } catch (e) {
    const unrecovered = [];
    for (const key of moved) {
      const target = path.join(PROJECT_ROOT, key);
      try { rmrf(target, { recursive: false }); } catch { }
      const bak = path.join(stagingBackup, key);
      if (fs.existsSync(bak)) {
        try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.renameSync(bak, target); } catch { unrecovered.push(key); }
      } else if (fs.existsSync(target)) {
        unrecovered.push(key);   // 换入件删不掉、又无备份可还原 → 项目里多出一个库版本文件，必须如实报
      }
    }
    rmrf(staging);
    releaseLock();
    log('PHASE-A-ROLLED-BACK');
    console.error(unrecovered.length
      ? `落盘失败，已回滚但 ${unrecovered.length} 个文件未能还原（项目里可能多出库版本文件，需手工核对删除）：${unrecovered.slice(0, 10).join(', ')}`
      : `落盘失败已回滚，目标项目保持原样：${e.message}`);
    process.exit(1);
  }

  /* .gitattributes（P2-20 → v9.5.0 S3 改按需写）：要钉的事实没变（系统 core.autocrlf=true 会
   * 把 LF 脚本静默改成 CRLF 而损坏），变的是**时机**——从"装机无条件写"改成"已找到仓库、或用户
   * 已决定建仓"才写。理由不是洁癖：在没有仓库的项目根凭空放一份 git 配置文件，用户第一反应就是
   * "这是干什么的"（本轮实测发生），而真正需要它的项目（已有 .git）反而没人核它在不在场。
   * 🔴 残余窗口如实写：用户自己 `git init` 且在被拦之前发生过 checkout → 被改写的字节**后补这份
   *    文件还原不了**；今天的无条件写不存在这个窗口。换上去的是两层即时机制：① pre-commit-lint
   *    在 `git commit` 之前查 pin，缺席即 exit 2 并给可复制修复；② 判据 git_ready 把"有仓库无 pin"
   *    判 FAIL（v9.4.0 之前那一格根本无人核）。第二个写入者是 /branch-workflow Step 0，按 I3 顺序
   *    先写 pin 再让用户执行 git init。 */
  {
    const ga = path.join(PROJECT_ROOT, '.gitattributes');
    const cur = fs.existsSync(ga) ? fs.readFileSync(ga, 'utf8') : '';
    const add = GIT_PIN_LINES.filter(w => !cur.split(/\r?\n/).some(l => l.trim() === w));
    const wantsRepo = GIT.mode === 'local' || GIT.mode === 'remote';
    if (GIT.gitattributesPinned) {
      log('  [gitattributes] ok —— 行尾钉已在场（本项目或上层仓库覆盖，幂等未追加）');
    } else if (GIT.repo || wantsRepo) {
      fs.appendFileSync(ga, (cur === '' || cur.endsWith('\n') ? '' : '\n') + add.join('\n') + '\n', 'utf8');
      log(`  [gitattributes] 追加 ${add.length} 行（${GIT.repo ? '仓库在场 @' + GIT.repoRoot : 'mode=' + GIT.mode + ' 已选择建仓'} → 必须先于任何 checkout 钉死行尾）`);
      /* 实测 2c 抓到的自相矛盾：探测跑在写钉之前，于是本运行刚把钉落盘、profile.git 却仍记
       * "缺席"。判据读磁盘不会误判，但档案与事实不一致就是不一致 → 写成功后把这一个键地带正。
       * 只允许改 gitattributesPinned 一键，且写前 JSON.parse 回读校验；不达标就保持原文件并如实报。 */
      try {
        const profPath2 = path.join(dst, 'harness-profile.json');
        if (fs.existsSync(profPath2)) {
          const t2 = fs.readFileSync(profPath2, 'utf8');
          const re2 = /("gitattributesPinned"\s*:\s*)(true|false)/;
          if (re2.test(t2)) {
            const m2 = t2.replace(re2, '$1true');
            const chk = JSON.parse(m2);
            if (chk && chk.git && chk.git.gitattributesPinned === true && chk.git.mode === GIT.mode) {
              fs.writeFileSync(profPath2, m2, 'utf8');
              log('  [gitattributes] profile.git.gitattributesPinned 已随之置 true（只改这一键，mode 未动）');
            } else { log('[phase-a-init] ⚠️ 回读校验未通过 → profile.git 保持原样（判据读磁盘，不影响判定）'); }
          }
        }
      } catch (e) { log(`[phase-a-init] ⚠️ profile.git 同步探测位失败：${e.message}（保持原样，判据读磁盘不受影响）`); }
    } else {
      log('  [gitattributes] 跳过 —— 无仓库且 git 方式未定（mode=pending）；建仓那一步（/branch-workflow Step 0）会先写它再 git init，期间若手工 git commit 由 pre-commit-lint 拦下');
    }
  }

  /* v9.4.0 S7 防回潮哨兵：换名后核对"本次运行是否创建了阶段 A 已不再负责的那三条路径"。
   * 只判**本次创建**（基线快照 PRE_EXISTING 取在任何写入之前），所以"用户已有 docs/test/ 后重跑初始化"
   * 不会被误判；一旦有人把预建加回复制清单，这里会响亮失败而不是悄悄回到三处脱账的状态。
   * 触发时换名已完成 → 如实说明文件已落盘、不回滚（这是给维护侧的回归信号，不是用户故障）。 */
  {
    const created = Object.keys(PRE_EXISTING).filter(p => !PRE_EXISTING[p] && fs.existsSync(path.join(PROJECT_ROOT, p)));
    if (created.length) die('stray-dir-residue', `本次运行创建了阶段 A 不应创建的目录：${created.join('、')}（复制清单被改回 v9.4.0 之前的形态；换名已完成，本次落盘文件未回滚）`);
    log(`  [no-prebuild] ok —— 本次未创建 ${Object.keys(PRE_EXISTING).join(' / ')}（归按需写入方自建）`);
  }

  /* 面板（M2 哈希保护：手改过的 PROJECT-LIVE.html 不被静默覆盖，先另存 .bak 再重建） */
  let panelFailed = null;
  if (!args['skip-panel'] && !args['repush-scripts-only']) {
    const out = path.join(docsDir, 'PROJECT-LIVE.html');
    const stampFile = path.join(dst, 'logs', 'panel.sha256');
    const template = path.join(tpl, 'docs', 'PROJECT-LIVE.template.html');
    /* Task 5.12③：分发侧只带 brotli 压缩引擎（545,624B）；build-panel 首次用时按需膨胀进
     * 用户级缓存并按 SHA256 校验复用，明文 2,916,204B 不再随库走（否则分发集 5.64MB 超预算）。 */
    const bundle = path.join(tpl, 'docs', 'PROJECT-LIVE.bundle.js.br');
    if (fs.existsSync(out)) {
      const last = fs.existsSync(stampFile) ? readText(stampFile).trim() : '';
      /* 🔴 P1-4：`last` 为空（panel.sha256 缺失——首装被中断过、或 .qoder/logs 被清过）时**照样**先存 .bak。
       * 原写法 `last && …` 让"没有戳"退化成"不保护"，可没戳恰恰是最该保护的情形：
       * 无从判断是否被手改，此时静默覆盖用户产物就是一次不可恢复的数据丢失。 */
      if (!last || fileSha(out) !== last) {
        fs.copyFileSync(out, out + '.bak');
        /* 🔴 不能塞进 customizedSkipped：那个计数器的对外口径是「受保护跳过（未被覆盖）」，
         * 而面板这一刻**已经被下面的 build-panel 重建覆盖**了——把它记进去等于当着用户说谎。
         * review 判定：P1-4 之前这条只在哈希不符时触发，改后每次清过 logs 的复跑都会触发，
         * 于是假披露从偶发变成常态，必须换独立计数器。 */
        counters.panelBackups.push(out + '.bak（' + (last
          ? '与上次生成哈希不符'
          : '无 panel.sha256 哈希戳、无法判定是否被手改，保守保护') + '，原件已另存此路径，随后按库重建）');
      }
    }
    const bp = path.join(dst, 'scripts', 'build-panel.mjs');
    if (!fs.existsSync(bp)) panelFailed = 'build-panel.mjs 未落盘（复制清单与执行器不同步？）';
    else {
      const r = probe(process.execPath, [bp, '--template', template, '--bundle', bundle, '--out', out, '--project-name', project], 120000);
      if (r.code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) fs.writeFileSync(stampFile, fileSha(out), 'utf8');
      else if (r.code === 0) panelFailed = `build-panel.mjs 退出码 0 但未产出 ${rel(out)}（面板产物缺失）`;
      else panelFailed = `build-panel.mjs 退出码 ${r.code}${r.err ? '：' + r.err.split('\n').slice(-1)[0] : ''}`;
    }
  }

  /* 框架代码回刷的持久备份：换名时被覆盖的旧内容此刻还躺在 staging/_backup，
     而 staging 马上要整树删除 → 不挪出来就等于静默销毁。挪进 .qoder/logs/backup/（不参与任何计数扫描）。 */
  const repushStamp = runManifest.at.replace(/[:.]/g, '-');
  const repushBackupDir = path.join(dst, 'logs', 'backup', 'scripts', repushStamp);
  for (const key of counters.repushedFrom) {
    const from = path.join(stagingBackup, key);
    if (!fs.existsSync(from)) continue;
    const to = path.join(repushBackupDir, path.basename(key));
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      counters.repushBackups.push(rel(to));
    } catch { }
  }

  rmrf(staging);

  if (args['repush-scripts-only']) {
    fs.mkdirSync(path.join(dst, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dst, 'logs', 'init.stamp'), JSON.stringify({
      at: new Date().toISOString(), mode: 'repush-scripts-only', skillVersion,
      displacedBackupDir: counters.repushBackups.length ? rel(repushBackupDir) : null,
      scriptsSha: [...planned.entries()].filter(([k]) => k.startsWith('.qoder/scripts/')).map(([k, v]) => ({ file: k, sha: v.sha })),
    }, null, 2), 'utf8');
  }

  /* S3 stubs 口径：数**换名后磁盘上真实生效**的 hook 入口，而不是本次计划写入集。
     否则复跑时计划为空 → stubs 恒报 0，而磁盘上仍躺着占位桩，等于把"门禁未生效"藏起来。
     哨兵写成正则而非字面量，使本文件自身与任何提及该哨兵的文档都不可能被误计为桩。 */
  {
    const stubRe = /#\s*harness:stub\b/;
    const hookFiles = [...listAbs(path.join(dst, 'hooks')).map(p => path.join(dst, 'hooks', p)), path.join(dst, 'scripts', 'harness.mjs')]
      .filter(p => fs.existsSync(p) && fs.statSync(p).isFile());
    for (const f of hookFiles) if (stubRe.test(readText(f))) counters.stubFiles.push(rel(f));
    counters.stubs = counters.stubFiles.length;
  }

  /* v9.4.0 S5：首次同步的**确定性部分**由脚本代做。
   * 病灶：下面 sync-scope 里硬写着 `derivable = ['agents.projectStructure']`，而根目录列表在 S0 就已经
   * readdirSync 过一遍——等于"答案在手里，却把它派给 AI 再算一次"。实测那次代做的净产出是 1 个可推导字段
   * 加 3 个标签，代价约 25 次工具调用，而**改动前校验器就已 36 项全绿**。
   * 三条边界（缺一即退化成"以后同步都能省"）：
   * ① 只做确定性动作。`aiDecided` 四项（词汇本/交接面/团队规范/经验索引）依赖对话事实，脚本猜=编造（P4），一律留给 AI；
   * ② 只在**新装机**（profile 未被保留）时改 profile——已存在的项目状态一律不碰；
   * ③ 任一项失败就把它从代做清单里剔除并如实上报，由 AI 按 sync-scope 补做，**绝不伪装成已完成**。
   * ⚠️ spec 原列的第三项"刷 footer 同步日期"实施时判为**空动作**：该日期已由本脚本的 token 注入完成，
   *    再写一遍只是同一天的同一个值，故本函数不做、也不声称做了（spec §S5 已按实测回改）。
   * 判定"这一节还是初态吗"靠模板里的标记注释 `<!-- harness:auto:projectStructure -->`，
   * 而不是比对中文提示语——中文在两处各写一份就是第二事实源，改一处即静默失效。 */
  const firstSyncDone = [];
  const firstSyncSkipped = [];
  if (args['repush-scripts-only']) {
    /* 该模式的契约是"只回刷 .qoder/scripts/，不碰 profile / rules / docs、不拼面板"（见 A.2 参数表）。
     * AGENTS.md 与 profile 都在"不碰"之列，故代做动作整体跳过；跳过必须进未代做清单，不静默消失。 */
    firstSyncSkipped.push('全部（--repush-scripts-only 模式不写 AGENTS.md / profile）');
  } else {
    const MARK = '<!-- harness:auto:projectStructure -->';
    try {
      const agentsP = path.join(PROJECT_ROOT, 'AGENTS.md');
      const a = readText(agentsP);
      if (a.includes(MARK)) {
        /* v9.7.0 S2.7：.qoder/ 与 docs/ 属框架自有且可直接发现的结构，列进每会话常驻的 AGENTS.md 就是
         * "重复可发现仓库结构"的目录清单（官方评审 agents-md-review.md 反模式条目）→ 默认不列。 */
        const SKIP_NAMES = new Set(['.git', 'node_modules', '.qoder-init.lock', '.qoder', 'docs']);
        const ents = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true })
          .filter(e => !SKIP_NAMES.has(e.name) && !e.name.startsWith('.init-'))
          .sort((x, y) => (Number(y.isDirectory()) - Number(x.isDirectory())) || String(x.name).localeCompare(String(y.name)));
        const CAP = 24;   // 试验场里有数百 MB 的外部样例目录：只做顶层 + 一层子项名，不深扫（与 S0 同一纪律）
        const shown = ents.slice(0, CAP);
        const describe = e => {
          if (!e.isDirectory()) return '';
          try {
            const kids = fs.readdirSync(path.join(PROJECT_ROOT, e.name));
            /* v9.7.0 证-8 修正：空目录不再输出"（0 项：）"这种带悬空冒号的残句 */
            if (!kids.length) return '';
            return `（${kids.length} 项：${kids.slice(0, 8).map(k => '`' + k + '`').join('、')}${kids.length > 8 ? ` …共 ${kids.length} 项` : ''}）`;
          } catch { return ''; }
        };
        const tree = [
          '> 由 `phase-a-init` 扫描顶层目录填入（脚本代做的确定性动作，来源=文件系统，无推断成分）。要刷新或补语义说明请说 `/live-refresh`。',
          '',
          ...shown.map(e => `- \`${e.name}${e.isDirectory() ? '/' : ''}\` ${describe(e)}`.trimEnd()),
          ...(ents.length > CAP ? [`- …另有 ${ents.length - CAP} 个顶层条目未列出`] : []),
        ].join('\n');
        fs.writeFileSync(agentsP, a.split(MARK).join(tree), 'utf8');
        firstSyncDone.push('agents.projectStructure');
      } else {
        firstSyncSkipped.push('agents.projectStructure（该节已非初态 → 视为已定制，不重写；要刷新走 /live-refresh）');
      }
    } catch (e) { firstSyncSkipped.push(`agents.projectStructure（${e.message}）`); }

    /* v9.7.0 S2：Setup 命令 / 测试说明 两张表按**可机械解析的脚手架事实**代填（裁定 R2 把铁律收窄为「不猜语义」）。
     * 五条纪律：① 只认磁盘事实（package.json 的 scripts + lockfile/packageManager 名 / 栈信号文件 + 项目内 techstack-commands.json）；
     * ② 解析不到的格保持「待检测」，禁止编造；③ 含「【」或任何中日韩字符的值一律判不可用——`_fallback` 的
     *    【__…__】会被 Check 1 placeholder_scan 当场判红，python 的「（无需构建）」是散文不是命令；
     * ④ 放弃或失败必须进未代做清单并点名原因（读不到映射 / 无信号 / 表已非初态），不静默丢失；
     * ⑤ 「该表还是初态吗」靠机器标记 harness:auto:commands[Test] 判定，与 projectStructure 同一纪律。
     * 出处（D2 裁定）只写进 profile.buildCommands.source，AGENTS.md 不因代填加一个字节。 */
    {
      const MARKS = ['<!-- harness:auto:commands -->', '<!-- harness:auto:commandsTest -->'];
      try {
        const agentsP = path.join(PROJECT_ROOT, 'AGENTS.md');
        let text = readText(agentsP);
        let cm = null; try { cm = JSON.parse(readText(path.join(dst, 'techstack-commands.json'))); } catch { }
        let pkg = null; try { pkg = JSON.parse(readText(path.join(PROJECT_ROOT, 'package.json'))); } catch { }
        const want = {};
        let provenance = '';
        if (pkg) {
          let pm = 'npm';
          const pam = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
          if (/^(pnpm|yarn)[@/]/.test(pam)) pm = pam.slice(0, Math.max(pam.indexOf('@'), pam.indexOf('/')));
          else if (fs.existsSync(path.join(PROJECT_ROOT, 'pnpm-lock.yaml'))) pm = 'pnpm';
          else if (fs.existsSync(path.join(PROJECT_ROOT, 'yarn.lock'))) pm = 'yarn';
          const run = k => (pm === 'npm' && (k === 'test' || k === 'start')) ? `${pm} ${k}` : `${pm} run ${k}`;
          want['安装依赖'] = `${pm} install`;
          const scr = (pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
          if (typeof scr.build === 'string') want['编译/构建项目'] = run('build');
          if (typeof scr.dev === 'string') want['启动开发服务器'] = run('dev');
          else if (typeof scr.start === 'string') want['启动开发服务器'] = run('start');
          if (typeof scr.lint === 'string') want['代码规范检查（lint）'] = run('lint');
          if (typeof scr.test === 'string') want['运行测试套件（全量）'] = run('test');
          provenance = `package.json scripts（${pm}）`;
        } else {
          if (!cm) throw new Error('命令映射不可用：.qoder/techstack-commands.json 读不到或 JSON 坏，且无 package.json 可解析');
          const STACK_BY_FILE = { 'pom.xml': 'java-spring', 'build.gradle': 'java-spring-gradle', 'go.mod': 'go', 'requirements.txt': 'python', 'pyproject.toml': 'python', 'setup.py': 'python' };
          const hit = Object.keys(STACK_BY_FILE).find(f => fs.existsSync(path.join(PROJECT_ROOT, f)));
          if (!hit) throw new Error('无可解析的脚手架命令（无 package.json，且未命中栈信号文件 ' + Object.keys(STACK_BY_FILE).join('/') + '）');
          const stack = STACK_BY_FILE[hit];
          if (!cm[stack]) throw new Error(`命令映射不可用：表内无 ${stack} 条目`);
          const e = cm[stack];
          const usable = v => typeof v === 'string' && !!v.trim() && v.indexOf('【') < 0 && !/[\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/.test(v);
          for (const pair of [['编译/构建项目', 'build'], ['启动开发服务器', 'start'], ['代码规范检查（lint）', 'lint'], ['运行测试套件（全量）', 'test']]) {
            if (usable(e[pair[1]])) want[pair[0]] = String(e[pair[1]]).trim();
          }
          if (!Object.keys(want).length) throw new Error(`命令映射不可用：${stack} 的 build/test/lint/start 四键均缺失或不可作为命令`);
          provenance = `${hit} → techstack-commands.json#${stack}`;
        }
        const filled = [];
        for (const MARK of MARKS) {
          if (!text.includes(MARK)) continue;
          const lines = text.split('\n');
          const start = lines.findIndex(l => l.includes(MARK));
          for (let i = start + 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            if (!/^\|/.test(lines[i])) break;
            const cells = lines[i].split('|');
            if (cells.length < 4 || /^\s*-+\s*$/.test(cells[1])) continue;
            const use = cells[2].trim();
            if (cells[1].trim() === '待检测' && want[use]) { cells[1] = ' `' + want[use] + '` '; filled.push(use); lines[i] = cells.join('|'); }
          }
          text = lines.join('\n');
        }
        if (!filled.length) {
          firstSyncSkipped.push(Object.keys(want).length
            ? 'agents.buildCommands（两张命令表已非初态 → 视为已定制，不重写；要刷新走 /live-refresh）'
            : 'agents.buildCommands（解析到 0 条可用命令 → 保持待检测）');
        } else {
          fs.writeFileSync(agentsP, text, 'utf8');
          firstSyncDone.push('agents.buildCommands');
          if (!counters.profilePreserved) {
            try {
              const profP = path.join(dst, 'harness-profile.json');
              const j = JSON.parse(readText(profP));
              const pend = j.pendingPlaceholders && j.pendingPlaceholders['agents.md'];
              if (!pend) throw new Error('pendingPlaceholders["agents.md"] 不存在（模板键名变了？请同步本函数）');
              pend.buildCommands = { status: 'filled', autoFillable: true, signal: 'scaffolding', source: `${provenance} · phase-a-init ${today} · 已填 ${filled.length} 格（${filled.join('、')}）` };
              if (Array.isArray(j.history)) j.history.push({ date: today, action: 'first-sync', detail: `脚本代做：命令表 ${filled.length} 格。出处只存本键的 source（v9.7.0 D2 裁定：AGENTS.md 不加来源行）` });
              fs.writeFileSync(profP, JSON.stringify(j, null, 2) + '\n', 'utf8');
              firstSyncDone.push('profile.buildCommands+history');
            } catch (e) { firstSyncSkipped.push(`profile.buildCommands（${e.message}）`); }
          }
        }
      } catch (e) { firstSyncSkipped.push(`agents.buildCommands（${e.message}）`); }
    }

    if (!counters.profilePreserved && firstSyncDone.includes('agents.projectStructure')) {
      try {
        const profP = path.join(dst, 'harness-profile.json');
        const j = JSON.parse(readText(profP));
        /* ⚠️ 键名是带点的**单层**键 "agents.md"（不是 agents 对象下的 md 子键）——写成两级访问会得到
         * undefined 并在赋值时抛错。实测：本项首版就栽在这里，靠"失败即如实报未代做"的降级才没被静默吞掉。
         * 键缺失时同样退化为未代做，而不是悄悄什么都不改。 */
        const pend = j.pendingPlaceholders && j.pendingPlaceholders['agents.md'];
        if (!pend) throw new Error('pendingPlaceholders["agents.md"] 不存在（模板键名变了？请同步本函数）');
        pend.projectStructure = { status: 'filled', autoFillable: true, signal: 'filesystem', source: `phase-a-init 目录扫描 ${today}` };
        if (Array.isArray(j.history)) j.history.push({ date: today, action: 'first-sync', detail: '脚本代做：项目结构（目录扫描）+ 本条记账。aiDecided 四项与 notDerivable 七项仍归 AI/保持待检测' });
        fs.writeFileSync(profP, JSON.stringify(j, null, 2) + '\n', 'utf8');
        firstSyncDone.push('profile.projectStructure+history');
      } catch (e) { firstSyncSkipped.push(`profile（${e.message}）`); }
    }
  }
  /* 汇总必须在 if/else 之外：守卫分支若不打印，就等于"静默跳过"，
   * 违反本块自己承诺的"跳过必须进未代做清单并在摘要里点名"。 */
  log(`[phase-a-init] first_sync=${firstSyncSkipped.length ? 'partial' : 'ok'}｜脚本代做 ${firstSyncDone.length} 项${firstSyncDone.length ? `（${firstSyncDone.join('、')}）` : ''}${firstSyncSkipped.length ? `｜未代做 ${firstSyncSkipped.join('；')}（AI 按 sync-scope 补做，不静默）` : ''}`);

  /* v9.3.0 S5：sync-scope —— 把"这次有什么可填"算成一张清单落盘，供首次同步收敛渲染范围。
   * 动机：阶段 A 后强制"3 步全做"，但空项目上手册 22 段提示词无可绑定事实、面板三图无拓扑依据，
   * 读掉 81KB 手册再原样放回是纯仪式。三步一条不删，只把**渲染范围**交给磁盘事实决定。
   * 落 .qoder/logs/ —— 该目录不参与任何计数扫描，因此零台账影响（不动 componentCounts）。
   * 纪律：只列脚本能算的；依赖对话事实的项一律进 aiDecided，禁止脚本替用户猜。 */
  {
    const SCAFFOLD = ['package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle', 'Cargo.toml', 'composer.json'];
    const has = rel2 => fs.existsSync(path.join(PROJECT_ROOT, rel2));
    const anyIn = (dirRel, re) => { try { return fs.readdirSync(path.join(PROJECT_ROOT, dirRel)).some(f => re.test(f)); } catch { return false; } };
    let pj = null;
    try { pj = JSON.parse(readText(path.join(dst, 'harness-profile.json'))); } catch { pj = null; }
    const ts = (pj && pj.techstack) || {};
    const tsDeclared = ['backend', 'frontend', 'database'].some(k => Array.isArray(ts[k]) && ts[k].length > 0) || !!String(ts.deploy || '').trim();
    const scaffold = SCAFFOLD.some(f => has(f));
    const hasArch = anyIn('docs/arch', /^ARCH/i);
    const hasPrd = anyIn('docs/prd', /^PRD/i);
    const maturityAllFalse = !pj || !pj.maturity || Object.values(pj.maturity).every(v => !v);
    const hasKnownDocs = !!(pj && Array.isArray(pj.knownDocs) && pj.knownDocs.length);
    /* 代码在场判据：只看根目录源码文件与常见应用目录是否存在，不做全库深扫（试验场里有数百 MB 的外部样例目录） */
    const SRC_EXT = /\.(ts|tsx|js|jsx|py|go|java|kt|rs|c|cpp|cs|rb|php|vue|svelte|sql)$/i;
    const APP_DIRS = ['src', 'app', 'server', 'backend', 'frontend', 'api', 'cmd', 'lib'];
    let hasCode = false;
    try {
      const top = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
      hasCode = top.some(e => e.isFile() && SRC_EXT.test(e.name)) || top.some(e => e.isDirectory() && APP_DIRS.includes(e.name.toLowerCase()));
    } catch { hasCode = false; }
    const derivable = ['agents.projectStructure'];
    const notDerivable = [];
    const bucket = (ok, key) => (ok ? derivable : notDerivable).push(key);
    bucket(scaffold || tsDeclared, 'agents.techStack');
    bucket(scaffold, 'agents.buildCommands');
    bucket(!!(pj && pj.project && String(pj.project.name || '').trim()) || hasPrd, 'agents.projectName');
    bucket(hasPrd, 'agents.projectIntro');
    bucket(hasArch, 'agents.layerSpec');
    bucket(hasArch || hasPrd, 'agents.keyConstraints');
    bucket(hasCode, 'agents.namingConvention');
    /* v9.7.0 S2.4：脚本已代做成功的项必须从 derivable 摘掉。live-refresh 细则写明「在 scriptedFirstSync 内即不得重做」，
     * 同一项同时出现在 derivable 与 scriptedFirstSync 会让 AI 再渲一遍并可能覆盖脚本填的真命令。 */
    for (const k of ['agents.buildCommands']) {
      if (!firstSyncDone.includes(k)) continue;
      const i = derivable.indexOf(k);
      if (i >= 0) derivable.splice(i, 1);
    }
    /* v9.10.0 S6 归属登记（避免下批再猜一遍）：profile.project.apps（应用清单唯一权威）**不在**
     * 下面四个桶里——阶段 A 能确定的只有"尚未产出"这一件事，故由模板自带初态 []；
     * 它既不是 AI 语义判断项（不进 aiDecided），也不是不可推导项（不进 notDerivable），
     * 真正写入发生在 1·1 Step 0 的 /create-proposal。 */
    const skipRender = [];
    if (maturityAllFalse && !hasKnownDocs) skipRender.push('manual.workflow');
    if (!hasArch && !scaffold) skipRender.push('panel.diagrams');
    const scope = {
      at: new Date().toISOString(),
      derivable, notDerivable,
      aiDecided: ['glossary', 'handoff', 'agents.teamStandards', 'agents.memoryIndex'],
      /* v9.4.0 S5：脚本已代做的确定性项 —— AI 读到即**不得重做**；未代做清单同样落盘，
       * 否则"降级"会变成静默丢失（该项既没人做也没人知道）。两者都由实际成功结果推出，不预先声明。 */
      scriptedFirstSync: firstSyncDone,
      scriptedFirstSyncSkipped: firstSyncSkipped,
      skipRender,
      reason: `maturity 全 false=${maturityAllFalse}｜根目录脚手架=${scaffold}｜profile.techstack 非空=${tsDeclared}｜docs/arch 有 ARCH=${hasArch}｜docs/prd 有 PRD=${hasPrd}｜knownDocs 非空=${hasKnownDocs}｜代码在场=${hasCode}`
    };
    fs.writeFileSync(path.join(dst, 'logs', 'sync-scope.json'), JSON.stringify(scope, null, 2) + '\n', 'utf8');
    /* v9.7.0 实施时发现：原先这里把相对字面量 '.qoder/logs/sync-scope.json' 喂给 rel()，而 rel() 内部
     * path.relative(PROJECT_ROOT, 相对串) 会先按 process.cwd() 解析它 —— 只要调用目录不是项目根，
     * 打印出来的路径就指向一个根本不存在的位置（文件其实写在正确地方）。改传真实绝对路径。 */
    log(`  [sync-scope] 可填 ${derivable.length} 项｜不可填 ${notDerivable.length} 项｜免重渲 ${skipRender.length} 区 → ${rel(path.join(dst, 'logs', 'sync-scope.json'))}`);
  }

  /* S3：摘要（必含 customized_skipped / profile_preserved / stubs） */
  log(`[phase-a-init] project=${PROJECT_ROOT} skillRoot=${SKILL_ROOT} project_name=${project} skill_version=${skillVersion}`);
  log(`[phase-a-init] copied=${counters.copied} identical_skipped=${counters.identical} customized_skipped=${counters.customizedSkipped.length} repushed=${counters.repushedFrom.length} profile_preserved=${counters.profilePreserved} stubs=${counters.stubs}`);
  if (counters.customizedSkipped.length) {
    /* v9.4.0 S5 附带修正：S5 之后脚本自己会写 AGENTS.md（填项目结构节），于是每次重跑该项都以
     * "用户定制内容与库版本不同"的身份出现在 customized_skipped 里——那是**脚本自填**，不是用户改的，
     * 披露若不说清楚就等于说谎。判据用脚本自己写入时带的树前导句做指纹（确定性字符串，不靠 profile 里的
     * source 字段：profile 记账不会因用户后来手改该节而回退，据此判断会把真定制误标成脚本自填）。
     * 只加限定语，**不改任何计数口径与跳过行为**。 */
    let agentsSelfFilled = '';
    try {
      const am = readText(path.join(PROJECT_ROOT, 'AGENTS.md'));
      /* v9.7.0 S2.5：两把指纹取**或**。命令表代填不消耗标记（只改单元格，标记仍在），
       * 而 projectStructure 的标记会被生成的树整体替换掉、只剩树前导句 —— 单独改用 harness:auto: 前缀
       * 反而会把「项目结构已被脚本填过」这一格漏掉，退回 checklist#A.5 明令禁止的假阳性归因。 */
      const parts = [];
      if (am.includes('由 `phase-a-init` 扫描顶层目录填入')) parts.push('「项目结构」节');
      if (am.includes('harness:auto:commands')) parts.push('「Setup 命令/测试说明」表');
      agentsSelfFilled = parts.join(' 与 ');
    } catch { }
    log('[phase-a-init] 受保护跳过（与库版本不同，未被覆盖）：');
    for (const s of counters.customizedSkipped.slice(0, 20)) {
      /* 🔴 v9.7.0 V7 实测抓到的存量缺陷：customizedSkipped 存的是**绝对路径**（planTokenized push 的是
       * path.join(PROJECT_ROOT, …)），而旧写法按 `s === 'AGENTS.md'` 全等比较 —— 于是 v9.4.0 那条
       * 「框架自填 ≠ 用户定制」的限定语**从来没显示过**，每次复跑都把脚本自填说成用户改过。按 basename 比。 */
      log('  - ' + s + (path.basename(s) === 'AGENTS.md' && agentsSelfFilled
        ? `（差异含本脚本首次同步自填的 ${agentsSelfFilled} —— 非用户定制；要刷新走 /live-refresh，要回库版加 --overwrite-customized）`
        : ''));
    }
    if (counters.customizedSkipped.length > 20) log(`  ... 共 ${counters.customizedSkipped.length} 项`);
    log('[phase-a-init] 如需以库版本强制回刷这些文件，重跑本脚本并加 --overwrite-customized（升级场景请优先走 /harness-upgrade 两态处置）');
  }
  /* 🔴 面板单独披露：它**不是**"未动"，而是"原件已另存 .bak、随后仍按库重建覆盖"。
   * 挂进上面那个「受保护跳过（未被覆盖）」名下就是当着用户说谎——v9.12.0 全局 review 判定：
   * P1-4 把触发条件从"哈希不符"扩到"无哈希戳"后，这条假披露由偶发变常态，必须拆计数器。 */
  if (counters.panelBackups.length) {
    log(`[phase-a-init] 面板保护性备份 ${counters.panelBackups.length} 份（🔴 原件已另存，但成品随后按库重建覆盖——与上面的「未被覆盖」是两类事，别混着转述）：`);
    for (const s of counters.panelBackups.slice(0, 5)) log('  - ' + s);
  }
  if (counters.repushedFrom.length) {
    log(`[phase-a-init] 框架脚本回刷 ${counters.repushedFrom.length} 个（脚本层是 SKILL 托管代码，与库不同即按"库升级前的旧构建"处理，故不计入 customized_skipped）：${counters.repushedFrom.join(', ')}`);
    log(counters.repushBackups.length
      ? `[phase-a-init] 被换下的原内容已存持久备份（逐文件比对后再删）：目录 ${rel(repushBackupDir)}，内含 ${counters.repushBackups.join(', ')}`
      : '[phase-a-init] ⚠️ 被换下的原内容未能存下持久备份（rename 失败）——如需找回请从版本控制或旧 SKILL 安装件取');
  }
  if (counters.profilePreserved) log(`[phase-a-init] 已存在 harness-profile.json，项目状态（成熟度/同步记录/incidents）未被覆盖${counters.profileFieldsAdded || counters.profileFieldsRefreshed ? `；框架字段补齐 ${counters.profileFieldsAdded || 0} 项、刷新 ${counters.profileFieldsRefreshed || 0} 项（skillRoot/skillVersion 跟随库版本），原文件已存 ${'.qoder/harness-profile.json.bak'}` : ''}`);
  log('  [case] case_fixed=' + caseFixed.length + (caseFixed.length ? '（只改名不改内容，逐字节比对通过）：' + caseFixed.join(', ') : '') + (caseSkipped.length ? '｜未自动处置：' + caseSkipped.join('；') : ''));
  if (counters.stubs) log(`[phase-a-init] ⚠️ 本平台有 ${counters.stubs} 个门禁 hook 仍是占位桩（${counters.stubFiles.join(', ')}），报告中已显式披露（§9「门禁真实」判据）`);
  releaseLock();
  if (panelFailed) { console.error(`[phase-a-init] 面板构建失败：${panelFailed}（见 build-panel 报告）`); log('PHASE-A-PANEL-FAIL'); process.exit(2); }
  log('PHASE-A-COPY-OK');
  process.exit(0);
} catch (e) {
  try { rmrf(staging); } catch { }
  releaseLock();
  die('exception', e && e.stack ? e.stack : String(e));
}
