/**
 * dsh-input-suggest / prompt — 系统提示词渲染与详细度档位（纯函数）。
 *
 * 模板是用户可改的字符串，支持这些占位符：
 *   {{instructions}}  内置的「你只能预测用户下一句」刚性约束
 *   {{style}}         用户在设置页写的风格偏好（可能为空）
 *   {{memory}}        本地学习到的使用画像（可能为空）
 *   {{examples}}      最近被采纳的几条建议原文（可关闭，可能为空）
 *   {{language}}      建议语言（简体中文 / English）
 *   {{detail}}        详细度对应的写作要求
 *   {{maxChars}}      可见字符上限
 *
 * 未知占位符留空；缺失 {{instructions}} 时把内置约束前置，避免用户把模型
 * 引导成「生成代码」。
 *
 * @module dsh-input-suggest/prompt
 */

/** 内置刚性约束：这是整个功能的红线，模板把它删掉时会自动补回。 */
export const INSTRUCTIONS = [
  'You are a prompt suggestion generator. Your ONLY purpose is to predict the user\'s next prompt in a coding-assistant chat - never to generate content.',
  '',
  'CRITICAL CONSTRAINTS:',
  '- You are NOT a code generator, writer, or task executor.',
  '- You MUST respond with ONLY the suggestion text, on a single line.',
  '- NEVER generate, implement, code, or produce any content.',
  '- NEVER provide explanations, reasoning, or extra text.',
  '- NEVER use quotes, labels, Markdown, XML, or formatting.',
  '- If the next step is not obvious, reply with nothing at all.',
  '',
  'Reply with ONLY the suggestion. If the next step is not obvious, reply with nothing.',
].join('\n')

/** 三档详细度：写作要求 + 默认字符上限。 */
export const DETAIL_LEVELS = Object.freeze({
  brief: {
    label: 'brief',
    maxChars: 40,
    rule: 'Keep it extremely short: 1-6 words, a single phrase or verb. No punctuation at the end.',
  },
  standard: {
    label: 'standard',
    maxChars: 120,
    rule: 'Aim for 3-12 words. Be specific when you can - name files, functions, or actions.',
  },
  detailed: {
    label: 'detailed',
    maxChars: 240,
    rule: 'Write one short sentence (at most 20 words) that states the next concrete step, including the target (file, test, command) when it is known. Still one line, never two sentences.',
  },
})

/** 默认模板：保持与旧版内置提示词等价，只是拆成了可替换的段落。 */
export const DEFAULT_TEMPLATE = [
  '{{instructions}}',
  '',
  'Your job:',
  '1. Read the user\'s most recent message and the assistant\'s final answer.',
  '2. Predict what the USER would naturally type next - not what the assistant should do.',
  '',
  '{{detail}}',
  '',
  'NEVER SUGGEST:',
  '- Evaluative feedback ("looks good", "thanks")',
  '- Questions ("what about...?")',
  '- Assistant-voice phrasing ("Let me...", "I\'ll...", "Here\'s...")',
  '- New ideas the user did not ask about',
  '- Multiple sentences',
  '',
  'STYLE / PREFERENCES:',
  '{{style}}',
  '',
  'PROFILE OF THIS USER (learned locally on this machine):',
  '{{memory}}',
  '',
  'RECENTLY ACCEPTED SUGGESTIONS (imitate their voice and length):',
  '{{examples}}',
  '',
  'Language: {{language}}',
  'At most {{maxChars}} visible characters.',
].join('\n')

/** 空段落说明：占位符没有内容时用一句中性描述，避免出现空标题。 */
const EMPTY_NOTE = '(none configured)'

/** 详细度归一：未知值回落到 standard。 */
export function resolveDetail(level) {
  const key = typeof level === 'string' ? level.trim().toLowerCase() : ''
  return DETAIL_LEVELS[key] ?? DETAIL_LEVELS.standard
}

/** 把模板里的所有占位符替换成对应值；未知占位符替换为空串。 */
export function fillTemplate(template, values) {
  const source = typeof template === 'string' && template.trim() !== '' ? template : DEFAULT_TEMPLATE
  return source.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const value = values[name]
    return value === undefined || value === null ? '' : String(value)
  })
}

/**
 * 渲染最终系统提示词。
 *
 * @param {object} input - 渲染输入。
 * @param {string} input.template - 用户模板（空则用默认）。
 * @param {string} input.style - 风格偏好。
 * @param {string} input.memory - 记忆摘要。
 * @param {string} input.examples - 采纳样例。
 * @param {string} input.language - 建议语言。
 * @param {string} input.detailLevel - brief | standard | detailed。
 * @param {number} input.maxChars - 可见字符上限。
 * @returns {string} 系统提示词。
 */
export function renderPrompt(input) {
  const detail = resolveDetail(input.detailLevel)
  const template = typeof input.template === 'string' && input.template.trim() !== ''
    ? input.template
    : DEFAULT_TEMPLATE
  const hasInstructions = /\{\{instructions\}\}/.test(template)
  const body = fillTemplate(template, {
    instructions: INSTRUCTIONS,
    style: typeof input.style === 'string' && input.style.trim() !== '' ? input.style.trim() : EMPTY_NOTE,
    memory: typeof input.memory === 'string' && input.memory.trim() !== '' ? input.memory.trim() : EMPTY_NOTE,
    examples: typeof input.examples === 'string' && input.examples.trim() !== '' ? input.examples.trim() : EMPTY_NOTE,
    language: typeof input.language === 'string' && input.language !== '' ? input.language : 'English',
    detail: detail.rule,
    maxChars: String(input.maxChars),
  })
  // 模板里删掉了刚性约束时补回：这是功能红线，不该被一次编辑毁掉。
  return hasInstructions ? body : INSTRUCTIONS + '\n\n' + body
}

/** 模板校验：返回人类可读的问题列表（空数组表示没问题）。 */
export function validateTemplate(template) {
  const problems = []
  if (typeof template !== 'string' || template.trim() === '') return problems
  if (!/\{\{instructions\}\}/.test(template)) {
    problems.push('missing {{instructions}}: the built-in constraints will be prepended')
  }
  if (!/\{\{maxChars\}\}/.test(template)) {
    problems.push('missing {{maxChars}}: the length cap will not reach the model')
  }
  const known = new Set(['instructions', 'style', 'memory', 'examples', 'language', 'detail', 'maxChars'])
  for (const match of template.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!known.has(match[1])) problems.push('unknown placeholder {{' + match[1] + '}} will render empty')
  }
  return problems
}

