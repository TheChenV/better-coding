/* assets/templates/scripts/hook-ask-card.mjs — 选择卡契约 v10 守卫（原 ask-card-guard.hook.ps1，438 行 → 单语言）
 *
 * 拆成独立模块的原因：这 11 条启发式是全库唯一"文本级质量判定"，行数与另外 9 个 hook 的总和相当，
 * 塞进入口会让 harness.mjs 变成不可审的大文件；判定顺序与消息模板逐字沿用 .ps1，
 * 因为 tools/fixtures/hook-baseline/ 里存的就是它的真实输出，等价性靠比对而不是靠"看起来对"。
 *
 * 铁律同入口：自身任何异常一律 exit 0（守卫坏了不能阻断用户交互）。
 */

const EVAL_WORDS = [
  '最快', '最慢', '最接近', '最低', '最高', '最简', '最容易', '最难', '最省', '最优', '最佳', '最成熟', '最大',
  '亲切', '门槛高', '门槛低', '上手门槛', '风险最高', '风险大', '风险低', '打折', '工程量', '削弱', '兼顾',
  '友好', '复杂', '划算', '可靠', '灵活', '稳定', '成熟', '昂贵', '便宜', '轻量', '笨重', '麻烦',
  '体验好', '体验差', '学习成本', '性价比', '维护成本', '生态好', '生态差', '优势', '劣势', '痛点', '负担',
];
const PUNCT_SET = [...'，、。；！？,;'];
const RECOMMEND_TAIL = /[（(]\s*(?:推荐|建议|首选|默认)\s*[)）]\s*$/;
const RECOMMEND_ANY = /[（(]\s*(?:推荐|建议|首选|默认)\s*[)）]/;
const H13_LIST = /选项\s*[：:]\s*[A-Za-z]\s*=/;

/** 显示宽度：CJK/全角/假名/韩文/中文标点算 1，其余半角算 0.5 —— H1 与 H12 同源用这把尺子 */
export function displayWidth(s) {
  if (!s) return 0;
  let len = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    const wide = (code >= 0x1100 && code <= 0x115F)
      || (code >= 0x2E80 && code <= 0xA4CF)
      || (code >= 0xAC00 && code <= 0xD7A3)
      || (code >= 0xF900 && code <= 0xFAFF)
      || (code >= 0xFE30 && code <= 0xFE6F)
      || (code >= 0xFF00 && code <= 0xFF60)
      || (code >= 0xFFE0 && code <= 0xFFE6);
    len += wide ? 1.0 : 0.5;
  }
  return len;
}

const trim = s => String(s ?? '').trim();
const stripRecommend = s => trim(String(s ?? '').replace(RECOMMEND_TAIL, ''));

/** 连续 CJK 字符先接成串再取二元组（.ps1 是把非 CJK 直接丢弃后滑动窗口） */
function cjkBigrams(s) {
  const set = new Set();
  const cjk = [...String(s ?? '')].filter(ch => ch.codePointAt(0) >= 0x4E00 && ch.codePointAt(0) <= 0x9FFF).join('');
  for (let i = 0; i < cjk.length - 1; i++) set.add(cjk.slice(i, i + 2));
  return set;
}

/** PS 的 `-f` 用 UTF-16 code unit 计数截断，这里同口径（不是码点计数） */
function shorten(s, max) {
  const t = String(s ?? '').replace(/[\r\n]+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

const prop = (o, k) => (o && typeof o === 'object' ? o[k] : null);

/** 跑一轮判定，返回给用户的整改文本；无违规返回 null */
export function guardCard(evt) {
  let toolInput = prop(evt, 'tool_input');
  if (typeof toolInput === 'string') { try { toolInput = JSON.parse(toolInput); } catch { return null; } }
  if (!toolInput) return null;
  const questions = prop(toolInput, 'questions');
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const reportLines = [];
  let anyViolation = false;
  let firstBadDesc;

  for (const q of questions) {
    const qText = String(prop(q, 'question') ?? '');
    const hText = String(prop(q, 'header') ?? '');
    let qName = qText;
    if (!trim(qName)) qName = hText;
    if (!trim(qName)) qName = '(未命名问题)';
    const topicGrams = cjkBigrams(qText + ' ' + hText);

    const opts = prop(q, 'options');
    if (!Array.isArray(opts) || opts.length === 0) continue;

    const results = [];
    let cleanCount = 0;
    let badCount = 0;

    opts.forEach((o, i) => {
      const label = String(prop(o, 'label') ?? '');
      const desc = String(prop(o, 'description') ?? '');
      if (!trim(label)) return;

      const core = stripRecommend(label);
      const coreLen = displayWidth(core);
      const hits = [];

      if (coreLen > 16) hits.push('H1');
      if ([...core].filter(ch => PUNCT_SET.includes(ch)).length >= 2) hits.push('H2');
      if (EVAL_WORDS.some(w => core.includes(w))) hits.push('H3');

      /* 单拉丁字母（A/B/C…）是序号不是候选值，不构成值锚点；单字中文（是/否）仍是合法值 */
      const hasAnchorToken = !/^[A-Za-z]$/.test(core) && /[A-Za-z0-9]/.test(core);
      let hasTopicOverlap = false;
      for (const g of cjkBigrams(core)) if (topicGrams.has(g)) { hasTopicOverlap = true; break; }
      const noAnchor = !hasAnchorToken && !hasTopicOverlap;

      const descLen = displayWidth(desc);
      const h5 = !!trim(desc) && coreLen > descLen;
      if (h5) hits.push('H5');

      let h10 = false;
      if (trim(desc) && trim(core)) {
        const dt = desc.replace(/^\s+/, '');
        h10 = dt.startsWith(core) || dt.startsWith('【' + core) || dt.startsWith('[' + core);
      }
      if (h10) hits.push('H10');

      const h11 = RECOMMEND_ANY.test(label);
      if (h11) hits.push('H11');
      const h12 = !!trim(desc) && displayWidth(desc) > 40;
      if (h12) hits.push('H12');

      const styleHits = ['H1', 'H2', 'H3'].filter(h => hits.includes(h)).length;
      /* 出报告的通路是 violated → H6/H7 → anyViolation；只喂 weak 不影响判定（实测第一版就栽在这）。
         H13 已被 question 文本检测器占用（:19），本信号用 H14。 */
      const serialLabel = /^[A-Za-z]$/.test(core);
      if (serialLabel) hits.push('H14');
      const weak = styleHits > 0 || h5 || serialLabel;
      const violated = (styleHits > 0 && noAnchor) || h5 || serialLabel;
      const h6Bad = violated || styleHits >= 2;
      if (h6Bad) badCount++; else if (!weak) cleanCount++;

      results.push({ index: i + 1, label, core, desc, hits: hits.join('/'), noAnchor, h5, h10, h11, h12, weak, h6Bad, violated });
    });

    const h6 = results.length >= 2 && cleanCount >= 1 && badCount >= 1;
    const confirmed = results.filter(r => r.violated);
    const h7 = badCount >= 2 && cleanCount === 0 && confirmed.length === 0;
    const h13 = H13_LIST.test(qText);
    const h10Bads = results.filter(r => r.h10);
    const h11Bads = results.filter(r => r.h11);
    const h12Bads = results.filter(r => r.h12);

    if (!h6 && confirmed.length === 0 && !h7 && !h13 && !h10Bads.length && !h11Bads.length && !h12Bads.length) continue;

    anyViolation = true;
    let badOnes = [];
    let h1to7Reported = false;
    if (h6) {
      reportLines.push(`[H6非均匀劣化] question「${shorten(qName, 40)}」：${cleanCount} 项合规 / ${badCount} 项违规`);
      badOnes = results.filter(r => r.h6Bad);
      h1to7Reported = true;
    } else if (h7) {
      reportLines.push(`[H7均匀实质劣化] question「${shorten(qName, 40)}」：${badCount} 项实质劣化 / 共 ${results.length} 项（无任何清洁项——全盲选，比非均匀劣化更严重）`);
      badOnes = results.filter(r => r.h6Bad);
      h1to7Reported = true;
    } else if (confirmed.length > 0) {
      reportLines.push(`[单项违规] question「${shorten(qName, 40)}」：${confirmed.length} 项违规 / 共 ${results.length} 项（均匀劣化，未触发 H6 非均匀信号）`);
      badOnes = confirmed;
      h1to7Reported = true;
    }

    for (const b of badOnes) {
      const anchorNote = b.noAnchor ? '无值锚点' : '锚点存疑';
      const suffix = b.h5 ? '，长度倒挂 description' : '';
      reportLines.push(`  option#${b.index} label="${shorten(b.label, 60)}"（命中 ${b.hits || '—'}，${anchorNote}${suffix}）`);
    }

    if (h10Bads.length > 0 && !h1to7Reported) {
      reportLines.push(`[H10值与理由重复] question「${shorten(qName, 40)}」：${h10Bads.length} 项 description 以候选值开头（值已在 label 显示，重复即浪费唯一可见预算）`);
    }
    for (const b of h10Bads) {
      if (firstBadDesc === undefined) firstBadDesc = b.desc;
      reportLines.push(`  option#${b.index} description 不得以候选值或【候选值】开头：label="${shorten(b.core, 24)}" description="${shorten(b.desc, 40)}"`);
    }
    for (const b of h11Bads) {
      reportLines.push(`  option#${b.index} [H11推荐标记冗余] label 内写了推荐类标记，但徽标由平台硬挂第 1 项：label="${shorten(b.label, 40)}"`);
    }
    for (const b of h12Bads) {
      reportLines.push(`  option#${b.index} [H12描述超长] description 显示宽 ${displayWidth(b.desc)} > 40，一行读不完会被截断："${shorten(b.desc, 40)}"`);
    }
    if (h13) {
      reportLines.push(`[H13值清单残留] question「${shorten(qName, 40)}」正文里还写着「选项：A=…」——label 已渲染，清单是纯冗余且挤占 3 行显示预算`);
    }
  }

  if (!anyViolation) return null;

  return [
    '[ask-card-guard] 选择卡不符合契约 v10（渲染取证：label 会显示，且是回传给模型的唯一字段）：',
    ...reportLines,
    '',
    '六条硬规则：',
    '1) label = 具体候选值（名词短语，≤16字），评价与权衡移入 description；超长时截评价不截值。',
    '2) 推荐项放第 1 个；label 内不写「（推荐）」——平台已把徽标硬挂给第 1 项（H11）。',
    '3) description = {量化影响}；{推荐理由}，≤40字一行读完，不得以 label 原文或【label】开头（H10/H12）。',
    '4) question 只写问题本身（≤2行），不追加「选项：A=…」值清单（H13）。',
    '5) options 2–4 个；每批 ≤4 问（平台一次只显一题）。',
    '6) 先落四字段中间态（候选值/量化影响/推荐理由/是否推荐）再渲染。',
    '参考改写：',
    `  ❌ description="${shorten(firstBadDesc ?? '', 50)}"`,
    '  ✅ description="开发最快；纯文本可 diff，适合频繁迭代"（不含候选值，≤40字）',
    '     label="Markdown 源文件"（候选值只出现在 label，用户与模型同时看得到）',
    '同批已有合规选项时，请对齐其写法后重新调用 AskUserQuestion。',
    '详见 .qoder/rules/ask-card-option-quality.md',
  ].join('\n');
}

/** 双模式：默认警告（exit 0 + additionalContext），ASK_CARD_GUARD_BLOCK 为真值时硬阻断（exit 2 + stderr） */
export function askCardGuardBlocks(env = process.env) {
  const flag = String(env.ASK_CARD_GUARD_BLOCK ?? '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}
