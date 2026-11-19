
window.__ModuleLoader__.load({
  id: 'dsh-input-suggest',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')

    var NS = 'dsh-input-suggest'
    var GHOST_SLOT = 'conversation.input.overlay'
    var ACTIONS_SLOT = 'conversation.input.right'
    var SETTINGS_SLOT = 'settings.section'
    var SETTINGS_NS = 'input-suggest'
    var SECTION_ID = 'input-suggest'
    var SECTION_ORDER = 16

    var GET_PATH = '/api/input-suggest/get'
    var FEEDBACK_PATH = '/api/input-suggest/feedback'
    var USAGE_PATH = '/api/input-suggest/usage'
    var PRESETS_PATH = '/api/input-suggest/presets'
    var GENERATE_PATH = '/api/input-suggest/generate'
    var POLL_MS = 900
    var REQUEST_TIMEOUT_MS = 90000
    /** 提示文字在工具栏上停留多久后自动消失。 */
    var NOTICE_TTL_MS = 4000
    /** 手动触发建议的快捷键：焦点在输入框里按它，立刻生成一条。 */
    var MANUAL_KEY = 'Alt+Slash'


    var COPY = {
      zh: {
        nav: '\u667a\u80fd\u5efa\u8bae',
        intro: '\u6bcf\u8f6e\u56de\u7b54\u7ed3\u675f\u540e\uff0c\u7528\u4e00\u4e2a\u6307\u5b9a\u7684\u8f85\u52a9\u6a21\u578b\u9884\u6d4b\u4f60\u4e0b\u4e00\u53e5\u6700\u53ef\u80fd\u8bf4\u7684\u8bdd\uff0c\u4ee5\u6d45\u8272\u6587\u5b57\u663e\u793a\u5728\u8f93\u5165\u6846\u91cc\u3002\u6309\u4f60\u8bbe\u5b9a\u7684\u5feb\u6377\u952e\uff08\u9ed8\u8ba4 Tab\uff09\u91c7\u7eb3\uff0c\u300c\u91cd\u968f\u300d\u6309\u94ae\u91cd\u65b0\u751f\u6210\u3002',
        routeTitle: '\u5efa\u8bae\u6a21\u578b',
        routeHelp: '\u4e13\u95e8\u7528\u4e8e\u751f\u6210\u5efa\u8bae\u7684\u8f85\u52a9\u6a21\u578b\uff0c\u4e0e\u4f60\u5f53\u524d\u4f1a\u8bdd\u7684\u6a21\u578b\u65e0\u5173\u3002\u7559\u7a7a\u8868\u793a\u6cbf\u7528\u4f1a\u8bdd\u6700\u8fd1\u4e00\u6b21\u8bf7\u6c42\u7684\u8def\u7531\u3002',
        provider: '\u4f9b\u5e94\u5546',
        model: '\u6a21\u578b',
        effort: '\u601d\u8003\u6df1\u5ea6',
        inherit: '\u6cbf\u7528\u4f1a\u8bdd',
        modelDefault: '\u6a21\u578b\u9ed8\u8ba4',
        behaviourTitle: '\u884c\u4e3a',
        enabled: '\u81ea\u52a8\u751f\u6210\u5efa\u8bae',
        acceptKey: '\u91c7\u7eb3\u5feb\u6377\u952e',
        acceptKeyHelp: '\u70b9\u8fdb\u8f93\u5165\u6846\u540e\u76f4\u63a5\u6309\u4f60\u60f3\u7528\u7684\u7ec4\u5408\u952e\uff08\u9ed8\u8ba4 Tab\uff09\u3002',
        maxChars: '\u5efa\u8bae\u6700\u957f\u5b57\u7b26\u6570',
        styleTitle: '\u63d0\u793a\u8bcd\u4e0e\u98ce\u683c',
        styleHelp: '\u8fd9\u6bb5\u6587\u5b57\u4f1a\u8ffd\u52a0\u5230\u7cfb\u7edf\u63d0\u793a\u8bcd\u672b\u5c3e\uff0c\u7528\u6765\u63a7\u5236\u5efa\u8bae\u7684\u8bed\u6c14\u3001\u957f\u5ea6\u3001\u98ce\u683c\u3002\u7559\u7a7a\u8868\u793a\u53ea\u7528\u5185\u7f6e\u63d0\u793a\u8bcd\u3002',
        stylePlaceholder: '\u4f8b\u5982\uff1a\u7528\u7b80\u77ed\u7684\u4e2d\u6587\u52a8\u8bcd\u5f00\u5934\uff1b\u591a\u63d0\u5177\u4f53\u6587\u4ef6\u540d\uff1b\u4e0d\u8981\u5efa\u8bae\u63d0\u4ea4\u4ee3\u7801\u3002',
        presetTitle: '\u5efa\u8bae\u98ce\u683c\u9884\u8bbe',
        presetHelp: '\u9884\u8bbe\u7ed9\u51fa\u4e00\u6bb5\u5199\u4f5c\u6307\u4ee4\u548c\u4e00\u7ec4\u63a8\u8350\u503c\uff08\u8be6\u7ec6\u5ea6\u3001\u6700\u957f\u5b57\u7b26\uff09\u3002\u9009\u62e9\u540e\u4ecd\u53ef\u4fee\u6539\u4e0b\u65b9\u4efb\u4e00\u9879\uff1b\u300c\u81ea\u5b9a\u4e49\u300d\u4e0d\u4f7f\u7528\u9884\u8bbe\u3002',
        presetCustom: '\u81ea\u5b9a\u4e49\uff08\u4e0d\u7528\u9884\u8bbe\uff09',
        presetApply: '\u5957\u7528\u8be5\u9884\u8bbe\u7684\u63a8\u8350\u503c',
        presetHint: '\u60f3\u8981\u65b9\u6848\u7c7b\u8f93\u5165\u9009\u300c\u65b9\u6848 / \u6b65\u9aa4\u300d\uff1b\u7406\u8bba\u63a8\u5bfc\u9009\u300c\u7406\u8bba / \u63a8\u5bfc\u300d\u3002',
        styleHelpExtra: '\u8fd9\u91cc\u5199\u7684\u4f1a\u8ffd\u52a0\u5728\u9884\u8bbe\u4e4b\u540e\uff1b\u7559\u7a7a\u8868\u793a\u53ea\u7528\u9884\u8bbe\u3002',
        presetFailed: '\u8bfb\u53d6\u98ce\u683c\u9884\u8bbe\u5931\u8d25\uff0c\u53ef\u624b\u5199\u98ce\u683c\u3002',
        save: '\u4fdd\u5b58',
        saving: '\u4fdd\u5b58\u4e2d',
        saved: '\u5df2\u4fdd\u5b58',
        reset: '\u6062\u590d\u9ed8\u8ba4',
        unavailable: '\u8be5\u8bbe\u7f6e\u4e0d\u53ef\u7528\uff08\u5bf9\u5e94\u63d2\u4ef6\u884c\u6ca1\u52a0\u8f7d\uff09\u3002',
        readonly: '\u5f53\u524d profile \u4e0d\u5141\u8bb8\u5199\u5165\u3002',
        conflict: '\u8bbe\u7f6e\u5df2\u5728\u522b\u5904\u66f4\u65b0\uff0c\u8bf7\u91cd\u8bd5\u3002',
        catalogFailed: '\u6a21\u578b\u76ee\u5f55\u8bfb\u53d6\u5931\u8d25\uff0c\u53ef\u70b9\u300c\u5237\u65b0\u300d\u3002',
        refresh: '\u5237\u65b0\u6a21\u578b',
        regenerate: '\u91cd\u968f',
        refine: '\u4f18\u5316\u63d0\u793a\u8bcd',
        summon: '\u751f\u6210\u5efa\u8bae',
        accept: '\u91c7\u7eb3\u5efa\u8bae',
        generating: '\u751f\u6210\u4e2d',
        empty: '\u8fd9\u4e00\u8f6e\u6ca1\u6709\u660e\u786e\u7684\u4e0b\u4e00\u6b65',
        noContext: '\u8fd8\u6ca1\u6709\u5b8c\u6210\u7684\u56de\u5408',
        failed: '\u751f\u6210\u5931\u8d25',
        busy: '\u6b63\u5728\u751f\u6210\uff0c\u8bf7\u7a0d\u7b49',
        detail: '详细度',
        detailBrief: '极简（几个词）',
        detailStandard: '标准（一句话）',
        detailDetailed: '详细（含具体目标）',
        detailHelp: '控制建议的长度与具体程度；与「最长字符数」取较小者生效。',
        templateTitle: '提示词模板（高级）',
        templateHelp: '可用占位符：{{instructions}} {{style}} {{format}} {{memory}} {{examples}} {{language}} {{detail}} {{maxChars}} {{task}} {{extended}} {{mode}}。留空使用内置模板；删掉 {{instructions}} 时会自动补回内置约束。',
        templatePlaceholder: '留空 = 使用内置模板',
        templateMemory: '在模板里注入本地画像',
        templateExamples: '注入最近采纳的建议作为示例',
        memoryTitle: '记忆与隐私',
        memoryHelp: '画像只保存在本机插件存储里：采纳率、平均长度、语言与常用开头词，不含对话正文。',
        learn: '持续学习我的使用习惯',
        allowRemote: '允许把上下文发送到非本机端点',
        allowRemoteHelp: '默认关闭：只把上下文发给 loopback（本机）地址。打开后会把最近一轮对话（已脱敏）发给远端模型。',
        on: '开启',
        usageTitle: 'Token 用量',
        usageHelp: '本功能单独记账：辅助模型的每次调用（含没有产出建议的调用）。与会话主模型的开销分开统计。',
        usageCalls: '调用次数',
        usageTotal: '合计 token',
        usageInput: '输入 token',
        usageOutput: '输出 token',
        usageAvg: '平均每次',
        usageFailedCalls: '失败 / 无建议',
        usageFailed: '读取用量失败',
        strategyTitle: '建议策略',
        formatTitle: '输出格式',
        formatHelp: '与风格预设独立，只决定建议的形状。结构化 / 分步 / 研究格式是多行建议，其余为单行。',
        formatSingle: '单行（默认）',
        formatConcise: '极简指令',
        formatStructured: '结构化（目标 / 步骤 / 验收）',
        formatSteps: '分步执行',
        formatResearch: '研究分析（问题 / 假设 / 分析 / 结论）',
        formatCustom: '自定义结构',
        formatTemplateLabel: '自定义结构说明',
        formatTemplateHelp: '仅在输出格式选「自定义结构」时生效：告诉模型每行怎么组织。',
        formatTemplatePlaceholder: '例如：第一行目标；第二行两个步骤，用分号分隔；第三行验收条件。',
        mode: '建议模式',
        modePredict: '预测下一句',
        modeNext: '推荐下一步',
        modeHybrid: '混合（先预测，必要时推荐）',
        modeHelp: '预测模式模仿你自己的说法；推荐模式按任务进度给出有依据的下一步；混合模式先判断意图，两者都不确定时保持静默。',
        taskAwareness: '任务感知',
        taskAwarenessHelp: '从最近回合与回合状态里提取任务阶段（探索 / 规划 / 执行 / 受阻 / 复查 / 完成）。任务已完成且没有明确后续目标时，插件保持静默。',
        contextLevel: '上下文范围',
        contextRecent: '最近回合',
        contextTask: '当前任务摘要',
        contextExtended: '扩展上下文',
        contextHelp: '任务摘要只在内存里保留，按下面的时长过期；扩展上下文会带上更多历史用户指令，Token 消耗更高。',
        taskMemory: '任务摘要保留时长（分钟）',
        taskMemoryHelp: '0 表示不留存任务摘要，只用最近回合；范围 0–120 分钟。',
        draftCompletion: '草稿续写（预留）',
        draftCompletionHelp: '预留给下一阶段的输入中补全。当前版本打开也不会改变建议行为：草稿非空时仍然不显示建议。',
        localPolicy: '本地路由策略',
        localPolicyGateway: '本地网关（请求只发本机，网关可能继续转发）',
        localPolicyStrict: '严格本地推理（只信任指定的供应商与模型）',
        localPolicyHelp: '网关模式只保证请求发到本机地址，网关之后是否继续外发由网关决定。严格模式按供应商 id 与模型 id 精确匹配，路由不匹配时直接放弃生成。',
        trustedProvider: '可信本地供应商',
        trustedModel: '可信本地模型',
        trustedHelp: '按供应商 id 与模型 id 精确匹配。严格模式下留空表示不生成建议。',
        feedbackTitle: '建议反馈',
        feedbackHelp: '只统计本机事件：展示、显式采纳、实际发送、采纳后修改、关闭、重随。发送与修改由宿主在你发出消息后比对。',
        feedbackShown: '展示',
        feedbackAccepted: '采纳',
        feedbackSent: '发送',
        feedbackEdited: '修改',
        feedbackDismissed: '关闭',
        feedbackRegenerated: '重随',
        feedbackAcceptRate: '采纳率',
        feedbackSendRate: '采纳后发送率',
        feedbackEditRatio: '平均改动比例',
        feedbackDuplicateRate: '重复建议率',
        feedbackResponse: '平均响应',
        feedbackTokensPerSent: '每条已发送建议的 token',
        feedbackEmpty: '还没有反馈数据。',
        limited: '自动建议已达上限，稍后再试或手动重随',
        skipped: '这一轮不需要建议',
      },
      en: {
        nav: 'Input suggestions',
        intro: 'After each answer, an auxiliary model predicts your next message and shows it as ghost text in the composer. Press your accept shortcut (Tab by default); Reroll regenerates.',
        routeTitle: 'Suggestion model',
        routeHelp: 'The auxiliary model that writes suggestions, independent of this conversation model. Leave empty to inherit the session route.',
        provider: 'Provider',
        model: 'Model',
        effort: 'Reasoning effort',
        inherit: 'Inherit from session',
        modelDefault: 'Model default',
        behaviourTitle: 'Behaviour',
        enabled: 'Generate suggestions automatically',
        acceptKey: 'Accept shortcut',
        acceptKeyHelp: 'Focus the field and press the combination you want (Tab by default).',
        maxChars: 'Maximum characters',
        styleTitle: 'Prompt and style',
        styleHelp: 'Appended to the system prompt. Use it to steer tone, length and phrasing.',
        stylePlaceholder: 'e.g. short imperative Chinese; name concrete files; never suggest committing.',
        presetTitle: 'Style preset',
        presetHelp: 'A preset supplies a writing instruction plus a recommended detail level and character cap. Everything below stays editable; Custom uses no preset.',
        presetCustom: 'Custom (no preset)',
        presetApply: 'Apply the recommended values',
        presetHint: 'Plan / steps suits planning-style prompts; Theory / derivation suits analytical ones.',
        styleHelpExtra: 'This text is appended after the preset. Leave it empty to use the preset alone.',
        presetFailed: 'Could not read the preset catalog; write the style by hand.',
        save: 'Save',
        saving: 'Saving',
        saved: 'Saved',
        reset: 'Reset to default',
        unavailable: 'This setting is unavailable: its plugin row is not loaded.',
        readonly: 'This profile does not allow writing this setting.',
        conflict: 'Settings changed elsewhere. Retry.',
        catalogFailed: 'Could not read the model catalog. Try Refresh.',
        refresh: 'Refresh models',
        regenerate: 'Reroll',
        refine: 'Refine prompt',
        summon: 'Generate suggestion',
        accept: 'Accept suggestion',
        generating: 'Generating',
        empty: 'No obvious next step for this turn',
        noContext: 'No completed turn yet',
        failed: 'Generation failed',
        busy: 'Already generating',
        detail: 'Detail level',
        detailBrief: 'Brief (a few words)',
        detailStandard: 'Standard (one line)',
        detailDetailed: 'Detailed (names the target)',
        detailHelp: 'Controls length and specificity; the smaller of this and the character cap wins.',
        templateTitle: 'Prompt template (advanced)',
        templateHelp: 'Placeholders: {{instructions}} {{style}} {{format}} {{memory}} {{examples}} {{language}} {{detail}} {{maxChars}} {{task}} {{extended}} {{mode}}. Empty uses the built-in template; dropping {{instructions}} re-adds the built-in constraints.',
        templatePlaceholder: 'Empty = built-in template',
        templateMemory: 'Inject the local profile',
        templateExamples: 'Inject recently accepted suggestions',
        memoryTitle: 'Memory and privacy',
        memoryHelp: 'The profile stays on this machine: acceptance rate, average length, language and leading words. No conversation text is stored.',
        learn: 'Keep learning my habits',
        allowRemote: 'Allow sending context to non-loopback endpoints',
        allowRemoteHelp: 'Off by default: context only goes to loopback. Turning it on sends the last turn (redacted) to a remote model.',
        on: 'On',
        usageTitle: 'Token usage',
        usageHelp: 'This feature keeps its own ledger: every auxiliary call, including calls that produced no suggestion. Separate from the conversation model.',
        usageCalls: 'Calls',
        usageTotal: 'Total tokens',
        usageInput: 'Input tokens',
        usageOutput: 'Output tokens',
        usageAvg: 'Average per call',
        usageFailedCalls: 'Failed / no suggestion',
        usageFailed: 'Could not read usage',
        strategyTitle: 'Suggestion strategy',
        formatTitle: 'Output format',
        formatHelp: 'Independent of the style preset; decides only the shape of the suggestion. Structured / steps / research formats are multiline; the rest are single-line.',
        formatSingle: 'Single line (default)',
        formatConcise: 'Concise',
        formatStructured: 'Structured (goal / steps / acceptance)',
        formatSteps: 'Steps',
        formatResearch: 'Research (question / hypothesis / analysis / conclusion)',
        formatCustom: 'Custom structure',
        formatTemplateLabel: 'Custom structure description',
        formatTemplateHelp: 'Used only when Output format is Custom: tell the model how to organize each line.',
        formatTemplatePlaceholder: 'e.g. line 1 the goal; line 2 two steps separated by semicolons; line 3 the acceptance criterion.',
        mode: 'Suggestion mode',
        modePredict: 'Predict the next line',
        modeNext: 'Recommend the next action',
        modeHybrid: 'Hybrid (predict first, recommend when useful)',
        modeHelp: 'Predict imitates how you phrase things. Recommend proposes the next step from task progress. Hybrid judges your intent first and stays silent when neither is clear.',
        taskAwareness: 'Task awareness',
        taskAwarenessHelp: 'Reads the task stage (exploring, planning, executing, blocked, reviewing, completed) from recent turns. Once the task is done with no clear follow-up, the plugin stays silent.',
        contextLevel: 'Context level',
        contextRecent: 'Recent turn',
        contextTask: 'Task summary',
        contextExtended: 'Extended context',
        contextHelp: 'The task summary is kept in memory and expires after the window below. Extended context adds more of your earlier instructions and costs more tokens.',
        taskMemory: 'Task summary lifetime (minutes)',
        taskMemoryHelp: '0 keeps no task summary and uses the recent turn only. Range 0-120 minutes.',
        draftCompletion: 'Draft completion (reserved)',
        draftCompletionHelp: 'Reserved for in-draft completion in a later stage. Turning it on now changes nothing: suggestions still hide while the draft has text.',
        localPolicy: 'Local route policy',
        localPolicyGateway: 'Loopback gateway (local address, may forward)',
        localPolicyStrict: 'Strict local inference (trusted route only)',
        localPolicyHelp: 'Gateway mode only guarantees the request reaches a loopback address. Strict mode matches provider and model ids exactly and refuses to generate when the route differs.',
        trustedProvider: 'Trusted local provider',
        trustedModel: 'Trusted local model',
        trustedHelp: 'Exact provider and model ids. Empty in strict mode means no suggestions are generated.',
        feedbackTitle: 'Suggestion feedback',
        feedbackHelp: 'Counts stay on this machine: shown, accepted, sent, edited after accept, dismissed, regenerated. The host compares your real message after you send it.',
        feedbackShown: 'Shown',
        feedbackAccepted: 'Accepted',
        feedbackSent: 'Sent',
        feedbackEdited: 'Edited',
        feedbackDismissed: 'Dismissed',
        feedbackRegenerated: 'Regenerated',
        feedbackAcceptRate: 'Accept rate',
        feedbackSendRate: 'Send rate after accept',
        feedbackEditRatio: 'Average edit ratio',
        feedbackDuplicateRate: 'Duplicate rate',
        feedbackResponse: 'Average response',
        feedbackTokensPerSent: 'Tokens per sent suggestion',
        feedbackEmpty: 'No feedback recorded yet.',
        limited: 'Automatic suggestions are capped for now; retry later or reroll',
        skipped: 'No suggestion needed this turn',
      },
    }


    /** 界面语言是不是中文。 */
    function isChinese() {
      var language = String(
        (typeof document === 'undefined' || document.documentElement === null ? '' : document.documentElement.lang)
        || (typeof navigator === 'undefined' ? '' : navigator.language)
        || ''
      )
      return language.toLowerCase().indexOf('zh') === 0
    }

    /** 当前语言的文案表。 */
    function copy() {
      return isChinese() ? COPY.zh : COPY.en
    }

    /** 稳定比较两个值是否相同（只含 JSON 值）。 */
    function same(left, right) {
      return JSON.stringify(left) === JSON.stringify(right)
    }

    /** 把任意值收成字符串。 */
    function str(value) {
      return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
    }

    var KEY_CODES = {
      tab: 'Tab', enter: 'Enter', space: 'Space', ' ': 'Space',
      slash: 'Slash', '/': 'Slash', backspace: 'Backspace', delete: 'Delete',
      escape: 'Escape', esc: 'Escape', insert: 'Insert', home: 'Home', end: 'End',
      pageup: 'PageUp', pagedown: 'PageDown',
      arrowup: 'ArrowUp', up: 'ArrowUp', arrowdown: 'ArrowDown', down: 'ArrowDown',
      arrowleft: 'ArrowLeft', left: 'ArrowLeft', arrowright: 'ArrowRight', right: 'ArrowRight',
      period: 'Period', '.': 'Period', comma: 'Comma', ',': 'Comma',
      semicolon: 'Semicolon', ';': 'Semicolon', quote: 'Quote', "'": 'Quote',
      bracketleft: 'BracketLeft', '[': 'BracketLeft', bracketright: 'BracketRight', ']': 'BracketRight',
      backslash: 'Backslash', minus: 'Minus', '-': 'Minus', equal: 'Equal', '=': 'Equal',
      backquote: 'Backquote', '`': 'Backquote'
    }

    /** 单个键名 -> KeyboardEvent.code。 */
    function keyCode(token) {
      var lower = token.toLowerCase()
      if (KEY_CODES[lower] !== undefined) return KEY_CODES[lower]
      if (/^[a-z]$/.test(lower)) return 'Key' + lower.toUpperCase()
      if (/^[0-9]$/.test(lower)) return 'Digit' + lower
      if (/^f(?:[1-9]|1[0-2])$/.test(lower)) return 'F' + lower.slice(1)
      return undefined
    }

    /** 把配置里的快捷键解析成精确的事件匹配器；解析失败返回 undefined。 */
    function parseAcceptKey(spec) {
      var parts = String(spec || '').trim().split(/\s*\+\s*/).map(function (part) { return part.toLowerCase() })
      if (parts.length === 0 || parts.some(function (part) { return part === '' })) return undefined
      var code
      var alt = false
      var ctrl = false
      var meta = false
      var shift = false
      for (var index = 0; index < parts.length; index += 1) {
        var part = parts[index]
        if (part === 'alt' || part === 'option') { alt = true; continue }
        if (part === 'ctrl' || part === 'control') { ctrl = true; continue }
        if (part === 'meta' || part === 'cmd' || part === 'command') { meta = true; continue }
        if (part === 'shift') { shift = true; continue }
        if (code !== undefined) return undefined
        code = keyCode(part)
        if (code === undefined) return undefined
      }
      if (code === undefined) return undefined
      return function (event) {
        return event.code === code
          && Boolean(event.altKey) === alt
          && Boolean(event.ctrlKey) === ctrl
          && Boolean(event.metaKey) === meta
          && Boolean(event.shiftKey) === shift
      }
    }

    /** 把一次按键编码成规范的快捷键文本。 */
    function encodeKey(code, modifiers) {
      var modifierCodes = {
        AltLeft: 1, AltRight: 1, ControlLeft: 1, ControlRight: 1,
        MetaLeft: 1, MetaRight: 1, ShiftLeft: 1, ShiftRight: 1
      }
      if (modifierCodes[code] === 1) return undefined
      var parts = []
      if (modifiers.alt === true) parts.push('Alt')
      if (modifiers.ctrl === true) parts.push('Ctrl')
      if (modifiers.meta === true) parts.push('Meta')
      if (modifiers.shift === true) parts.push('Shift')
      var match = /^Key([A-Z])$/.exec(code)
      var main = match !== null ? match[1] : /^Digit([0-9])$/.test(code) ? code.slice(5) : code
      parts.push(main)
      return parts.join('+')
    }


    var warned = false

    /** 传输失败只报一次，避免轮询刷屏。 */
    function warnOnce(message) {
      if (warned) return
      warned = true
      console.warn(message)
    }

    /** 校验一条建议的形状。id 允许缺省（旧宿主），缺失时由文本派生。 */
    function isSuggestion(value) {
      if (value === null || typeof value !== 'object') return false
      if (value.id !== undefined && (typeof value.id !== 'string' || value.id === '')) return false
      return typeof value.text === 'string' && value.text.trim() !== ''
        && Number.isSafeInteger(value.turn) && value.turn >= 0
        && typeof value.truncated === 'boolean'
    }

    /** 建议的稳定标识：宿主给的 id 优先，旧宿主没有 id 时按回合 + 文本派生。 */
    function suggestionIdentity(suggestion) {
      if (suggestion === null || suggestion === undefined) return ''
      if (typeof suggestion.id === 'string' && suggestion.id !== '') return suggestion.id
      var text = str(suggestion.text)
      var hash = 2166136261
      for (var index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619) >>> 0
      }
      return 't' + String(suggestion.turn) + '-' + hash.toString(36)
    }

    /**
     * 读宿主存好的建议。
     *
     * 返回 null 表示「宿主明确说没有建议」，undefined 表示读取失败。两者必须
     * 分开：早先失败也返回 null，于是一次本机请求抖动就把正在显示的幽灵文字
     * 抹掉了。
     */
    async function fetchSuggestion(sessionId, signal) {
      try {
        var response = await fetch(GET_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId }),
          signal: signal,
          cache: 'no-store'
        })
        if (response.ok !== true) return undefined
        var body = await response.json()
        if (body === null || typeof body !== 'object' || !('suggestion' in body)) return undefined
        return isSuggestion(body.suggestion) ? body.suggestion : null
      } catch (error) {
        warnOnce('input-suggest: read failed (' + String(error) + ')')
        return undefined
      }
    }

    /**
     * 事件式反馈的全部取值。宿主按事件学习，草稿正文永远不上报。
     *
     * `submitted` 只带一个不透明的提交 id：宿主用它把这次发送与真实的
     * user/message（`source.rpcId`）对上，具体文本由宿主从会话里取。
     */
    var FEEDBACK_EVENTS = ['shown', 'accepted', 'dismissed', 'submitted']

    /**
     * 可选事件：采纳之后又清空草稿（放弃），或采纳后改成别的内容。
     * 宿主的可信来源是真实用户消息，这两个只作辅助信号。
     */
    var EXTRA_FEEDBACK_EVENTS = ['abandoned', 'edited']

    /**
     * 宿主是否认得事件式反馈。
     *
     * 判据读 `/usage` 里的 `feedback` 段：新版宿主总会带上它（分母为零时比率
     * 为 null）。旧宿主只认 `{ text, rejected }`，把一条没有正文的事件当成
     * 「建议被拒」写进画像 —— 那会污染学习，所以不支持时整条事件丢弃。
     */
    var feedbackCapability = null
    var feedbackProbeAt = 0
    var feedbackChain = Promise.resolve()
    var FEEDBACK_TIMEOUT_MS = 5000
    var FEEDBACK_PROBE_INTERVAL_MS = 30000

    /** 带超时的 POST：反馈是尽力而为，不能让队列卡在一次挂起的请求上。 */
    async function postJson(path, payload, options) {
      var init = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store'
      }
      var timer = null
      if (typeof AbortController === 'function') {
        var controller = new AbortController()
        init.signal = controller.signal
        timer = setTimeout(function () { controller.abort() }, FEEDBACK_TIMEOUT_MS)
      }
      if (options !== null && options !== undefined && options.keepalive === true) init.keepalive = true
      try {
        return await fetch(path, init)
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    }

    async function hasEventFeedback() {
      if (feedbackCapability === true) return true
      // 探测失败不能变成每次事件都多打一次请求。
      if (feedbackProbeAt !== 0 && Date.now() - feedbackProbeAt < FEEDBACK_PROBE_INTERVAL_MS) {
        return feedbackCapability === true
      }
      feedbackProbeAt = Date.now()
      try {
        var response = await postJson(USAGE_PATH, {})
        if (response.ok !== true) return false
        var body = await response.json()
        // 当前宿主把反馈统计放在响应的顶层（`/usage` -> { usage, feedback }），
        // 早期草案放在 usage 里面。两处都认，便于前后端独立升级。
        if (body === null || typeof body !== 'object') return false
        var block = body.feedback !== null && typeof body.feedback === 'object'
          ? body.feedback
          : body.usage !== null && typeof body.usage === 'object'
            ? body.usage.feedback
            : null
        if (block === null || typeof block !== 'object') return false
        feedbackCapability = true
        return true
      } catch {
        // 读失败不能下结论，隔一会儿再试。
        return false
      }
    }

    /** 让下一次反馈重新探测宿主能力（插件热重载与自检用）。 */
    function resetFeedbackCapability() {
      feedbackCapability = null
      feedbackProbeAt = 0
      feedbackChain = Promise.resolve()
    }

    /**
     * 上报一个反馈事件，按调用顺序串行发送。
     *
     * 采纳必须在写入草稿的同一个事件里上报，不能等「草稿非空」或「用户发消息」
     * 再推断：那既会把用户自己打的字误判为采纳，也会漏掉真正采纳后又改写的样本。
     *
     * @param {string} sessionId - 会话 id。
     * @param {string} identity - 建议标识。
     * @param {string} event - 事件名。
     */
    function reportFeedbackEvent(sessionId, identity, event, requestId) {
      if (typeof sessionId !== 'string' || sessionId === '') return Promise.resolve(false)
      if (FEEDBACK_EVENTS.indexOf(event) < 0 && EXTRA_FEEDBACK_EVENTS.indexOf(event) < 0) return Promise.resolve(false)
      var payload = { sessionId: sessionId, suggestionId: identity, event: event }
      if (typeof requestId === 'string' && requestId !== '') payload.requestId = requestId
      feedbackChain = feedbackChain.then(async function () {
        if ((await hasEventFeedback()) !== true) return false
        try {
          await postJson(FEEDBACK_PATH, payload, { keepalive: true })
          return true
        } catch {
          // 学习是尽力而为。
          return false
        }
      }).catch(function () { return false })
      return feedbackChain
    }

    /**
     * 显式请求一次生成。
     *
     * @param {string} sessionId - 会话 id。
     * @param {AbortSignal|undefined} signal - 取消信号。
     * @param {object} options - `{ trigger: 'manual'|'idle', suggestionId }`。
     *   手动触发缺省，兼容旧调用；重随把当前显示的建议 id 一并送上，宿主据此
     *   记录「这一条被换掉」。
     */
    async function requestGeneration(sessionId, signal, options) {
      var settings = options !== null && options !== undefined ? options : {}
      var trigger = settings.trigger === 'idle' ? 'idle' : 'manual'
      var payload = { sessionId: sessionId, trigger: trigger }
      if (typeof settings.suggestionId === 'string' && settings.suggestionId !== '') {
        payload.suggestionId = settings.suggestionId
      }
      if (typeof settings.draft === 'string' && settings.draft.trim() !== '') {
        payload.draft = settings.draft
      }
      try {
        var response = await fetch(GENERATE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: signal,
          cache: 'no-store'
        })
        var body = await response.json()
        if (body === null || typeof body !== 'object' || !('status' in body)) return { status: 'error', suggestion: null }
        if (body.status === 'generated' && isSuggestion(body.suggestion)) return { status: 'generated', suggestion: body.suggestion }
        var known = ['empty', 'no-context', 'busy', 'limited', 'skipped']
        if (known.indexOf(body.status) >= 0) return { status: body.status, suggestion: null }
        return { status: 'error', suggestion: null }
      } catch (error) {
        return { status: 'error', suggestion: null }
      }
    }

    /** 两条建议是否等价。 */
    function sameSuggestion(left, right) {
      if (left === null || left === undefined || right === null || right === undefined) return left === right
      if (suggestionIdentity(left) !== suggestionIdentity(right)) return false
      return left.turn === right.turn
        && left.text === right.text
        && left.truncated === right.truncated
        && left.acceptKey === right.acceptKey
    }

    /**
     * 轮询某会话的建议，并暴露显式刷新与直接写入。
     * 只有会话切换才重置，运行状态变化不清空（重随进行中不该丢失当前建议）。
     */
    /** 每个会话一份共享轮询：输入框与工具栏不会各发一次请求。 */
    var sources = new Map()

    /** 把一次新值广播给所有订阅者（输入框与工具栏各有一份订阅）。 */
    function publishSource(source) {
      var listeners = source.listeners.slice()
      for (var index = 0; index < listeners.length; index += 1) listeners[index]()
    }

    function sourceOf(sessionId) {
      var existing = sources.get(sessionId)
      if (existing !== undefined) return existing
      var source = {
        sessionId: sessionId,
        value: null,
        listeners: [],
        pending: false,
        timer: undefined,
        controller: new AbortController(),
        /** 本地已采纳 / 已关闭的建议标识：轮询回来也保持隐藏。 */
        muted: {},
        /** 本地静音一条建议：两个视图会同时看到它消失。 */
        mute: function (identity) {
          if (typeof identity !== 'string' || identity === '') return
          if (Object.keys(source.muted).length > 200) source.muted = {}
          source.muted[identity] = true
          if (source.value !== null && suggestionIdentity(source.value) === identity) {
            rememberSuggestion(source, source.sessionId, null)
          }
        },
        /** 生成序号：只有最新一次请求的结果允许写回。 */
        epoch: 0,
        /**
         * 本地写入序号。每次本地写入（记住建议、静音、生成落地）都自增；
         * 轮询请求发出时记下它，回来时对不上就丢弃 —— 旧 GET 不能覆盖
         * 更新的生成结果。
         */
        writeSeq: 0,
        /** 在途的生成请求控制权，用于 latest-wins 取消。 */
        generating: null
      }
      sources.set(sessionId, source)
      var read = function () {
        if (source.pending) return
        source.pending = true
        // 请求开始时记下写入序号：回来时若本地已经写过，这一份就是旧的。
        var seq = source.writeSeq
        void fetchSuggestion(sessionId, source.controller.signal).then(function (next) {
          source.pending = false
          // 读失败（undefined）保留当前建议：本机请求抖一下不该让幽灵文字闪掉。
          if (next === undefined) return
          if (source.writeSeq !== seq) return
          if (source.value !== null && sameSuggestion(source.value, next)) return
          source.value = next
          publishSource(source)
        }).catch(function () {
          source.pending = false
        })
      }
      read()
      source.timer = setInterval(read, POLL_MS)
      return source
    }

    function releaseSource(source) {
      if (source.listeners.length > 0) return
      if (sources.get(source.sessionId) === source) sources.delete(source.sessionId)
      clearInterval(source.timer)
      if (source.generating !== null) source.generating.abort()
      source.generating = null
      source.controller.abort()
    }

    /**
     * 把一条建议写进共享源并广播。
     *
     * 这是「本地写入」的唯一入口：它自增写入序号，让已经发出的 GET 回来时
     * 自动作废。会话已切换或源已释放时丢弃迟到的结果，避免写进别人的输入框；
     * 本地已采纳 / 已关闭的那条也不重新显示。
     *
     * @param {object} source - 建议源。
     * @param {string} sessionId - 会话 id。
     * @param {object|null} next - 新建议。
     */
    function rememberSuggestion(source, sessionId, next) {
      if (source === null || source === undefined) return
      if (sources.get(sessionId) !== source) return
      if (next !== null && next !== undefined && source.muted[suggestionIdentity(next)] === true) return
      // 写入后必须广播：输入框与工具栏是两个独立订阅者，只更新调用者自己的
      // state 会让另一方停在旧建议上（表现为「点重随没变化」）。
      source.value = next
      source.writeSeq += 1
      publishSource(source)
    }

    function useSuggestionSource(sessionId) {
      var sourceState = react.useState(function () {
        return sessionId === undefined || sessionId === null ? null : sourceOf(sessionId)
      })
      var source = sourceState[0]
      var setSource = sourceState[1]
      var versionState = react.useState(0)
      var setVersion = versionState[1]

      react.useEffect(function () {
        if (sessionId === undefined || sessionId === null) {
          setSource(null)
          return undefined
        }
        var live = sourceOf(sessionId)
        setSource(live)
        var listener = function () { setVersion(function (count) { return count + 1 }) }
        live.listeners.push(listener)
        return function () {
          var at = live.listeners.indexOf(listener)
          if (at >= 0) live.listeners.splice(at, 1)
          releaseSource(live)
        }
      }, [sessionId])

      var suggestion = source === null || source.sessionId !== sessionId ? null : source.value
      // 本地已静音（采纳 / 关闭）的建议不再显示，等宿主换下一条。
      if (suggestion !== null && suggestion !== undefined && source.muted[suggestionIdentity(suggestion)] === true) {
        suggestion = null
      }
      return {
        suggestion: suggestion,
        refresh: function () {
          if (source === null) return
          setVersion(function (count) { return count + 1 })
        },
        remember: function (next) {
          rememberSuggestion(source, sessionId, next)
        },
        /** 本地静音一条建议，立刻从两个视图里消失。 */
        mute: function (identity) {
          if (source === null) return
          source.mute(identity)
        },
        /** 申请一次生成：latest-wins，返回 null 表示被更新的请求取代或无法发起。 */
        beginGeneration: function () {
          if (source === null || typeof AbortController !== 'function') return null
          if (source.generating !== null) source.generating.abort()
          var controller = new AbortController()
          var epoch = source.epoch + 1
          source.epoch = epoch
          source.generating = controller
          return {
            signal: controller.signal,
            owns: function () {
              return source.epoch === epoch && source.generating === controller
            },
            settle: function () {
              if (source.generating === controller) source.generating = null
            },
            abort: function () { controller.abort() }
          }
        }
      }
    }


    /**
     * 主动触发：空闲时自己向宿主要一条建议，而不是只等回合事件。
     *
     * 判断依据全部来自客户端已经拿到的状态：会话空闲、草稿为空、且最近一次
     * 用户活动已经过去了 IDLE_DELAY_MS。这样做的效果是「打开会话、停一会儿
     * 就有建议」，不再依赖某一轮是否跑完。
     *
     * 冷却与去重：
     *   - 每会话 IDLE_COOLDOWN_MS 内最多一次主动请求；
     *   - 已经显示建议时不请求；
     *   - 宿主回答 busy / no-context / limited / skipped 时安静退让，不重试也不弹提示。
     * @param {string} sessionId - 会话 id。
     * @param {object} options - `{ idle: boolean, hasSuggestion: boolean }`。
     * @returns {object|null} 新建议，或 null。
     */
    var IDLE_DELAY_MS = 1200
    var IDLE_COOLDOWN_MS = 15000
    var idleRequests = new Map()

    function requestIfIdle(sessionId, options) {
      if (typeof sessionId !== 'string' || sessionId === '') return Promise.resolve(null)
      if (options.idle !== true) return Promise.resolve(null)
      if (options.hasSuggestion === true) return Promise.resolve(null)
      if (typeof AbortController !== 'function') return Promise.resolve(null)
      var now = Date.now()
      var last = idleRequests.get(sessionId)
      if (typeof last === 'number' && now - last < IDLE_COOLDOWN_MS) return Promise.resolve(null)
      idleRequests.set(sessionId, now)
      var controller = new AbortController()
      var timer = setTimeout(function () { controller.abort() }, REQUEST_TIMEOUT_MS)
      return requestGeneration(sessionId, controller.signal, { trigger: 'idle' })
        .then(function (response) {
          if (response.status === 'limited' || response.status === 'skipped') return null
          return response.status === 'generated' ? response.suggestion : null
        })
        .catch(function () { return null })
        .finally(function () { clearTimeout(timer) })
    }


    /**
     * 采纳与显示的单一记录处。
     *
     * 两个视图（输入框幽灵文字、工具栏按钮）都会挂载一次，采纳、关闭、shown
     * 必须只算一次。所有事件按 (会话, 建议 id, 事件) 去重后再发。
     */
    var reported = new Map()
    var accepted = new Map()
    var acceptViews = new Map()
    var ACCEPTED_TTL_MS = 180000
    var SEND_GRACE_MS = 700

    function reportOnce(sessionId, identity, event, requestId) {
      var key = sessionId + '\u0000' + identity + '\u0000' + event
        + (typeof requestId === 'string' && requestId !== '' ? '\u0000' + requestId : '')
      if (reported.get(key) === true) return Promise.resolve(false)
      if (reported.size > 400) reported.clear()
      reported.set(key, true)
      return reportFeedbackEvent(sessionId, identity, event, requestId)
    }

    /**
     * 把建议写进草稿。
     *
     * 宿主提供 `captureInsertion()` + `insertText(text, span)`：span 带着草稿修订
     * 号，插入是一次 CAS。这里额外比对一次「我们渲染时的修订号」：
     *
     *   - 用户在两次渲染之间敲了字，编辑器修订号已经前进，而回调里拿到的
     *     快照还是旧的；
     *   - 只靠 insertText 的 CAS，捕获到的 span 已经是新修订，插入会成功，
     *     结果是在用户刚打的字前面又塞进一句建议。
     *
     * 所以两道闸都要过：span 与渲染快照一致，插入本身再 CAS 一次。任一失败
     * 就放弃，绝不整段覆盖草稿。宿主没有这两个方法（旧版本或测试桩）时退回
     * `setDraft`，此时没有修订号可校验。
     */
    function insertSuggestionText(inputActions, text, expectedRev) {
      if (inputActions === null || inputActions === undefined) return false
      if (typeof inputActions.captureInsertion === 'function' && typeof inputActions.insertText === 'function') {
        var span
        try {
          span = inputActions.captureInsertion()
        } catch {
          return false
        }
        if (span === null || span === undefined) return false
        var rendered = typeof expectedRev === 'number' && Number.isFinite(expectedRev) ? expectedRev : undefined
        if (rendered !== undefined && typeof span.draftRev === 'number' && span.draftRev !== rendered) return false
        try {
          return inputActions.insertText(text, span) === true
        } catch {
          return false
        }
      }
      if (typeof inputActions.setDraft === 'function') {
        inputActions.setDraft(text)
        return true
      }
      return false
    }

    /**
     * 按键是否真的来自输入框。
     *
     * 键盘监听挂在 window 上，其他面板（设置页、侧栏）里的 Tab 不能触发采纳。
     * 先看事件目标是否落在输入框容器里，再看焦点；任一成立即认为在输入框内。
     * 远程浏览器与旧宿主的 DOM 标记可能不同，两种情况都认。
     */
    function isComposerEvent(event) {
      var target = event === null || event === undefined ? null : event.target
      if (target !== null && target !== undefined && typeof target.closest === 'function') {
        if (target.closest('[data-input-scroll]') !== null) return true
        if (target.closest('[data-composer-card]') !== null) return true
      }
      return isComposerFocused()
    }

    /**
     * 采纳一条建议：先上报 accepted，再写草稿，最后本地静音。
     *
     * 上报必须发生在真实按键 / 点击的同一个事件里：宿主用真实用户消息推断
     * 发送与改写，客户端只提供「这一条被显式采纳」的事实。
     *
     * @param {string} sessionId - 会话 id。
     * @param {object} source - 建议源。
     * @param {object} suggestion - 当前建议。
     * @param {object} inputActions - 宿主的输入动作。
     * @returns {boolean} 是否写入成功。
     */
    function acceptSuggestion(sessionId, source, suggestion, inputActions, expectedRev) {
      if (suggestion === null || suggestion === undefined) return false
      // 先写入草稿：任何一步 CAS 失败都表示草稿已经不是我们看到的那份。
      // 写不进去就不是采纳，不能上报。
      if (insertSuggestionText(inputActions, suggestion.text, expectedRev) !== true) return false
      var identity = suggestionIdentity(suggestion)
      void reportOnce(sessionId, identity, 'accepted')
      accepted.set(sessionId, {
        identity: identity,
        text: str(suggestion.text),
        at: Date.now(),
        seenNonEmpty: false,
        edited: false,
        clearedAt: 0,
        acceptedNormalized: normalizeDraftText(suggestion.text),
        lastNormalized: normalizeDraftText(suggestion.text),
        clearNormalized: '',
        pendingAtAccept: snapshotPending(acceptViews.get(sessionId)),
        timer: undefined
      })
      if (source !== null && source !== undefined && typeof source.mute === 'function') source.mute(identity)
      return true
    }

    /** 明确关闭一条建议：上报 dismissed 并本地静音。 */
    function dismissSuggestion(sessionId, source, suggestion) {
      if (suggestion === null || suggestion === undefined) return false
      var identity = suggestionIdentity(suggestion)
      void reportOnce(sessionId, identity, 'dismissed')
      if (source !== null && source !== undefined && typeof source.mute === 'function') source.mute(identity)
      return true
    }

    /**
     * 本地归一化：只作比较证明，不离开浏览器。
     *
     * 大小写、行内空白、空行、行末标点都是噪声；换行结构保留。它与宿主算
     * 改写比例用的归一化口径一致，所以「只改了空格」不会被当成重敲。
     */
    function normalizeDraftText(text) {
      var lines = String(text === null || text === undefined ? '' : text).replace(/\r\n?/g, '\n').split('\n')
      var kept = []
      for (var index = 0; index < lines.length; index += 1) {
        var line = lines[index].replace(/[ \t\u3000]+/g, ' ').replace(/[ \t]*[.!?;:\u3002\uFF01\uFF1F\uFF1B\uFF1A]+[ \t]*$/, '').trim()
        if (line !== '') kept.push(line)
      }
      return kept.join('\n').toLowerCase()
    }

    /**
     * 采纳时已经存在的在途发送，用来区分「原本就在发」与「采纳后新发的」。
     *
     * 用显式的 `present` 标记「有没有拿到视图快照」：视图还没渲染过时
     * present 为 false，此刻队列里的任何一条都可能是本来就有的发送，
     * 不能当作「采纳之后新出现的」。
     *
     * @param {object} view - 视图快照，可能不存在。
     * @returns {{present: boolean, ids: object}} 基线。
     */
    function snapshotPending(view) {
      var ids = {}
      if (view === null || view === undefined) return { present: false, ids: ids }
      var list = Array.isArray(view.pendingSubmissions) ? view.pendingSubmissions : []
      for (var index = 0; index < list.length; index += 1) {
        var requestId = list[index] === null || list[index] === undefined ? undefined : list[index].requestId
        if (requestId !== undefined) ids[String(requestId)] = true
      }
      return { present: true, ids: ids }
    }

    /** 采纳之后新出现在提交队列里的发送。 */
    function newSendsSince(record, pending) {
      var list = Array.isArray(pending) ? pending : []
      var baseline = record.pendingAtAccept
      // 采纳时没拿到视图快照（组件尚未渲染）：此刻队列里的一切都可能是
      // 「本来就有的」。宁可不归因，也不把上一轮的发送算到这一条建议头上。
      if (baseline === null || baseline === undefined || baseline.present !== true) return []
      var fresh = []
      for (var index = 0; index < list.length; index += 1) {
        var requestId = list[index] === null || list[index] === undefined ? undefined : list[index].requestId
        if (baseline.ids[String(requestId)] !== true) fresh.push(list[index])
      }
      return fresh
    }

    /**
     * 从新出现的发送里认出属于这条采纳的那一次。
     *
     * 归因必须是精确的：提交文本要么等于被采纳的那一行，要么等于发送前
     * 最后一次看到的草稿。两者都不匹配就不上报 —— 那可能来自队列、子代理
     * 或用户自己直接键入的别的内容，按「只有一条就当它」去猜会把无关发送
     * 也算成这条建议的采纳。
     *
     * 两条以上同时出现时，只在文本完全对上时认定（原样发出的那一条），
     * 不做任何按顺序或按数量的猜测。
     *
     * @param {object} record - 采纳跟踪。
     * @param {Array} fresh - 新出现的发送。
     * @returns {object|null} `{ requestId, rewritten }` 或 null。
     */
    function claimSubmission(record, fresh) {
      var candidates = []
      for (var index = 0; index < fresh.length; index += 1) {
        var entry = fresh[index]
        var requestId = entry === null || entry === undefined ? undefined : entry.requestId
        if (typeof requestId !== 'string' || requestId === '') continue
        candidates.push({ requestId: requestId, text: normalizeDraftText(entry.text) })
      }
      if (candidates.length === 0) return null
      var accepted = record.acceptedNormalized
      for (var exact = 0; exact < candidates.length; exact += 1) {
        if (accepted !== '' && candidates[exact].text === accepted) {
          return { requestId: candidates[exact].requestId, rewritten: false }
        }
      }
      var seen = record.lastNormalized
      for (var edited = 0; edited < candidates.length; edited += 1) {
        if (seen !== '' && candidates[edited].text === seen) {
          return { requestId: candidates[edited].requestId, rewritten: seen !== accepted }
        }
      }
      // 没有一条与采纳行或发送前草稿吻合：这不是这次采纳的发送。
      return null
    }

    /**
     * 采纳之后的状态跟踪。
     *
     * 采纳后草稿被清空有两种原因：用户发出去了，或用户放弃并删掉。原生发送
     * 在 plain 阶段就是乐观的 —— 先登记 pendingSubmissions，再清草稿 —— 所以
     * 判据是「采纳之后有没有新发送」，与草稿此刻是否为空无关。
     *
     * 放弃的判据要求三件事同时成立：草稿在采纳后被清空过、宽限期内没有新
     * 发送、也没有重新敲字。任何一次新发送都把判断交给宿主 —— 宿主的真实
     * 用户消息才是发送与改写的权威来源。
     *
     * 「清空前那一版草稿」只在本机做归一化比对，用来证明清空的对象就是
     * 这条被采纳 / 改写的行。草稿正文永远不上报。
     *
     * @param {string} sessionId - 会话 id。
     * @param {object} view - `{ draft, phase, pendingSubmissions, running, awaitingFirstTurn }`。
     */
    function observeAcceptance(sessionId, view) {
      var record = accepted.get(sessionId)
      if (record === undefined) return
      if (Date.now() - record.at > ACCEPTED_TTL_MS) {
        cancelAcceptance(sessionId)
        return
      }
      var normalized = normalizeDraftText(view.draft)
      var newSends = newSendsSince(record, view.pendingSubmissions)
      if (newSends.length > 0) {
        // 采纳之后出现了新的发送：把不透明的提交 id 交给宿主，由它用真实
        // user/message 的 source.rpcId 对上。草稿正文仍然留在浏览器里。
        var send = claimSubmission(record, newSends)
        if (send !== null) {
          void reportOnce(sessionId, record.identity, 'submitted', send.requestId)
          // 发送前那一版草稿已经被改写过：给宿主一个明确的「有过编辑」信号。
          // 具体改了多少仍由宿主按真实提交的文本计算。
          if (record.edited !== true && send.rewritten === true) {
            void reportOnce(sessionId, record.identity, 'edited')
          }
        }
        cancelAcceptance(sessionId)
        return
      }
      if (normalized === '') {
        // 草稿还没见过非空渲染就不算「采纳过又清掉」，可能是渲染还没跟上。
        if (record.seenNonEmpty !== true) return
        // 提交进行中清空草稿是发送的必经步骤。
        if (view.phase !== undefined && view.phase !== 'plain') {
          record.sawSubmit = true
          return
        }
        if (record.clearedAt !== 0) return
        record.clearedAt = Date.now()
        record.clearNormalized = record.lastNormalized
        armAcceptanceTimer(sessionId, record)
        return
      }
      if (view.phase !== undefined && view.phase !== 'plain') record.sawSubmit = true
      if (record.clearedAt !== 0) {
        // 宽限期内重新敲字：清空不是最终状态。
        cancelAcceptanceTimer(record)
        record.clearedAt = 0
        // 敲回的是另一行、且没有任何发送回显：这条采纳已经被放弃重写。
        // 本地立刻撤销跟踪并报 abandoned，宿主的第二个宽限期就不必再等。
        if (record.clearNormalized !== '' && normalized !== record.clearNormalized) {
          void reportOnce(sessionId, record.identity, 'abandoned')
          accepted.delete(sessionId)
          return
        }
        record.clearNormalized = ''
      }
      record.seenNonEmpty = true
      record.lastNormalized = normalized
      // 只在用户把建议改写成别的内容时补一个 edited 事件；改动幅度由宿主按
      // 真实发送文本计算，这里只要一个「确实改过」的明确信号。
      if (record.edited !== true && isRewritten(normalized, record.acceptedNormalized)) {
        record.edited = true
        void reportOnce(sessionId, record.identity, 'edited')
      }
    }

    function armAcceptanceTimer(sessionId, record) {
      cancelAcceptanceTimer(record)
      record.timer = setTimeout(function () { settleAcceptance(sessionId, record) }, SEND_GRACE_MS)
      if (typeof record.timer?.unref === 'function') record.timer.unref()
    }

    /** 草稿是否已经抛开了采纳的文字（两边都不再互相包含）。 */
    function isRewritten(draftNormalized, acceptedNormalized) {
      if (draftNormalized === '' || acceptedNormalized === '') return false
      return draftNormalized.indexOf(acceptedNormalized) < 0 && acceptedNormalized.indexOf(draftNormalized) < 0
    }

    function cancelAcceptanceTimer(record) {
      if (record.timer === undefined || record.timer === null) return
      clearTimeout(record.timer)
      record.timer = undefined
    }

    /** 撤销一条采纳跟踪（发送已发生或用户已重新编辑）。 */
    function cancelAcceptance(sessionId) {
      var record = accepted.get(sessionId)
      if (record === undefined) return
      cancelAcceptanceTimer(record)
      accepted.delete(sessionId)
    }

    /** 宽限到期：仍然空着、且没有发送迹象，才当作放弃。 */
    function settleAcceptance(sessionId, record) {
      record.timer = undefined
      if (accepted.get(sessionId) !== record) return
      var view = acceptViews.get(sessionId)
      accepted.delete(sessionId)
      if (record.clearedAt === 0) return
      if (view === undefined) return
      if (typeof view.draft === 'string' && normalizeDraftText(view.draft) !== '') return
      if (view.phase !== undefined && view.phase !== 'plain') return
      // 期间进过提交态：那是命令或普通发送走过的路径，交给宿主判定。
      if (record.sawSubmit === true) return
      if (view.running === true || view.awaitingFirstTurn === true) return
      if (newSendsSince(record, view.pendingSubmissions).length > 0) return
      void reportOnce(sessionId, record.identity, 'abandoned')
    }

    var STYLE_TAG_ID = 'dsh-input-suggest-style'
    var styleUsers = 0

    var GHOST_CSS = [
      '.dsh-input-suggest-ghost{position:absolute;top:calc(10px + 4px);left:16px;right:12px;white-space:pre-wrap;word-break:break-word;overflow:hidden;font:inherit;font-size:inherit;line-height:inherit;color:var(--dsw-alias-label-tertiary,#68707d);pointer-events:none;user-select:none;}',
      '[data-composer-card]:has(.dsh-input-suggest-ghost) [data-composer-placeholder]{visibility:hidden;}',
      '[data-composer-card]:has(.dsh-input-suggest-ghost) textarea::placeholder{color:transparent;-webkit-text-fill-color:transparent;}'
    ].join('\n')

    /** 焦点是否在输入框编辑器里（textarea 与 Lexical contenteditable 都认）。 */
    function isComposerFocused() {
      var active = typeof document === 'undefined' ? null : document.activeElement
      if (active === null || active === undefined) return false
      if (typeof HTMLTextAreaElement === 'function' && active instanceof HTMLTextAreaElement) return true
      if (typeof HTMLElement !== 'function' || !(active instanceof HTMLElement)) return false
      return active.isContentEditable === true || active.closest('[data-input-scroll]') !== null
    }

    /** 现在该显示的幽灵文字；不该显示时返回 undefined。 */
    function currentSuggestion(suggestion, running, draft) {
      if (running === true) return undefined
      if (suggestion === null || suggestion === undefined) return undefined
      if (typeof draft !== 'string' || draft.trim() !== '') return undefined
      return suggestion.text
    }

    /** 注入幽灵样式（引用计数，随插件卸载移除）。 */
    function useGhostStyles() {
      react.useEffect(function () {
        styleUsers += 1
        if (document.getElementById(STYLE_TAG_ID) === null) {
          var tag = document.createElement('style')
          tag.id = STYLE_TAG_ID
          tag.textContent = GHOST_CSS
          document.head.appendChild(tag)
        }
        return function () {
          styleUsers -= 1
          if (styleUsers !== 0) return
          var existing = document.getElementById(STYLE_TAG_ID)
          if (existing !== null) existing.remove()
        }
      }, [])
    }

    /**
     * 幽灵文字的实例登记。
     *
     * 输入框插槽可能在多个容器里各挂一份（主区与嵌入视图）。同一会话只允许
     * 一份渲染幽灵文字，否则页面上会出现两条重影。规则是「最后挂载的那份
     * 胜出」：会话切换后重建的输入框总是最新注册的那个。
     * 标签页隐藏时不报 shown —— 用户看不到的东西不算曝光。
     */
    var ghostViews = new Map()
    var ghostLatest = new Map()
    var ghostOwnerSeq = 0

    function ghostViewOf(sessionId) {
      var existing = ghostViews.get(sessionId)
      if (existing !== undefined) return existing
      var created = { tokens: [], listeners: [] }
      ghostViews.set(sessionId, created)
      return created
    }

    /** 当前应该渲染幽灵文字的实例 token：最后挂载的那个。 */
    function ghostOwner(sessionId) {
      var latest = ghostLatest.get(sessionId)
      return latest === undefined ? 0 : latest
    }

    function notifyGhostView(view) {
      var listeners = view.listeners.slice()
      for (var index = 0; index < listeners.length; index += 1) listeners[index]()
    }

    /** 认领 / 释放幽灵文字渲染权；返回释放函数。 */
    function claimGhostView(sessionId, token, notify) {
      var view = ghostViewOf(sessionId)
      view.tokens.push(token)
      view.listeners.push(notify)
      // 后挂载的实例接管渲染权。
      ghostLatest.set(sessionId, token)
      notifyGhostView(view)
      return function () {
        var at = view.tokens.indexOf(token)
        if (at >= 0) view.tokens.splice(at, 1)
        var listenerAt = view.listeners.indexOf(notify)
        if (listenerAt >= 0) view.listeners.splice(listenerAt, 1)
        // 主人卸载时把渲染权交回仍然挂着的实例，避免视图切换后没有幽灵文字。
        if (ghostLatest.get(sessionId) === token) {
          if (view.tokens.length === 0) ghostLatest.delete(sessionId)
          else ghostLatest.set(sessionId, view.tokens[view.tokens.length - 1])
        }
        if (view.tokens.length === 0 && ghostViews.get(sessionId) === view) ghostViews.delete(sessionId)
        notifyGhostView(view)
      }
    }

    /** 当前视图是否可见（remote 浏览器与旧宿主没有 visibilityState 时按可见处理）。 */
    function viewVisible() {
      if (typeof document === 'undefined' || document === null) return true
      return document.visibilityState !== 'hidden'
    }

    /**
     * 输入框里的幽灵建议。
     * @param {object} props - 会话作用域标准 props。
     */
    function GhostSuggestion(props) {
      var sessionId = props.sessionId
      var useSession = props.useSession
      var useInput = props.useInput
      var inputActions = props.inputActions

      var source = useSuggestionSource(sessionId)
      var running = useSession(function (state) { return state.running })
      var pendingSubmissions = useSession(function (state) {
        return state === null || state === undefined ? undefined : state.pendingSubmissions
      })
      var awaitingFirstTurn = useSession(function (state) {
        return state === null || state === undefined ? undefined : state.awaitingFirstTurn
      })
      var draft = useInput(function (state) { return state.draft })
      var phase = useInput(function (state) { return state.phase })
      // 渲染时的编辑器修订号：采纳时拿它和实时修订号比对。
      var draftRev = useInput(function (state) { return state.draftRev })

      var suggestion = source.suggestion
      var text = phase === undefined || phase === 'plain'
        ? currentSuggestion(suggestion, running, draft)
        : undefined
      var identity = text === undefined ? '' : suggestionIdentity(suggestion)

      var acceptSpec = suggestion !== null && suggestion !== undefined && typeof suggestion.acceptKey === 'string'
        ? suggestion.acceptKey
        : 'Tab'
      var matcher = react.useMemo(function () { return parseAcceptKey(acceptSpec) }, [acceptSpec])

      useGhostStyles()

      // 单实例：认领当前会话的渲染权，后挂载的胜出（用户眼前的那个才是真的）。
      // 序号在渲染期分配，登记放在 effect 里：同一帧里两个实例都能拿到不同的
      // token，但先渲染不等于先挂载，只有 effect 顺序能决定谁真正在屏幕上。
      var tokenRef = react.useRef(0)
      if (tokenRef.current === 0) {
        ghostOwnerSeq += 1
        tokenRef.current = ghostOwnerSeq
        // 渲染期就登记：同一帧里后渲染的实例接管。effect 只负责监听与释放，
        // 这样第一帧就有确定的归属，不会两份都先画一条再互相撤销。
        if (sessionId !== undefined && sessionId !== null) ghostLatest.set(sessionId, tokenRef.current)
      }
      var ownerTick = react.useState(0)
      var setOwnerTick = ownerTick[1]
      react.useEffect(function () {
        if (sessionId === undefined || sessionId === null) return undefined
        ghostLatest.set(sessionId, tokenRef.current)
        return claimGhostView(sessionId, tokenRef.current, function () {
          setOwnerTick(function (count) { return count + 1 })
        })
      }, [sessionId])
      var isOwner = sessionId !== undefined
        && sessionId !== null
        && ghostOwner(sessionId) === tokenRef.current

      // 采纳必须来自真实按键：只在输入框里、且正在显示建议时拦截。
      // Escape 是明确的关闭动作，同样只在显示期间生效。
      react.useEffect(function () {
        if (text === undefined || isOwner !== true) return undefined
        var onKeyDown = function (event) {
          if (event.isComposing === true) return
          if (isComposerEvent(event) !== true) return
          if (event.code === 'Escape') {
            event.preventDefault()
            dismissSuggestion(sessionId, source, suggestion)
            return
          }
          if (matcher === undefined) return
          if (matcher(event) !== true) return
          event.preventDefault()
          acceptSuggestion(sessionId, source, suggestion, inputActions, draftRev)
        }
        window.addEventListener('keydown', onKeyDown)
        return function () { window.removeEventListener('keydown', onKeyDown) }
      }, [text, matcher, inputActions, sessionId, isOwner, identity, draftRev])

      // 曝光：真正渲染出幽灵文字之后才报 shown，且每条只报一次。
      // 标签页隐藏时先挂一个监听，回到前台再报 —— 用户没看到的不能算曝光。
      react.useEffect(function () {
        if (text === undefined || identity === '' || isOwner !== true) return undefined
        if (source === null || ghostOwner(sessionId) !== tokenRef.current) return undefined
        if (viewVisible() !== true) {
          if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
          var onVisible = function () {
            if (viewVisible() !== true) return
            document.removeEventListener('visibilitychange', onVisible)
            if (ghostOwner(sessionId) !== tokenRef.current) return
            void reportOnce(sessionId, identity, 'shown')
          }
          document.addEventListener('visibilitychange', onVisible)
          return function () { document.removeEventListener('visibilitychange', onVisible) }
        }
        void reportOnce(sessionId, identity, 'shown')
        return undefined
      }, [text, identity, sessionId, isOwner])

      // 主动触发：会话空闲、草稿为空、停止活动 IDLE_DELAY_MS 之后，自己去要一条。
      // 不依赖回合事件，所以「刚打开会话」「上一轮早就答完」也会有建议。
      var idleTimer = react.useRef(null)
      react.useEffect(function () {
        if (sessionId === undefined || sessionId === null) return undefined
        var idle = running !== true && typeof draft === 'string' && draft.trim() === ''
        var hasSuggestion = suggestion !== null && suggestion !== undefined
        if (idleTimer.current !== null) { clearTimeout(idleTimer.current); idleTimer.current = null }
        if (!idle) return undefined
        idleTimer.current = setTimeout(function () {
          idleTimer.current = null
          void requestIfIdle(sessionId, { idle: true, hasSuggestion: hasSuggestion }).then(function (next) {
            if (next !== null && next !== undefined) source.remember(next)
          })
        }, IDLE_DELAY_MS)
        return function () {
          if (idleTimer.current !== null) { clearTimeout(idleTimer.current); idleTimer.current = null }
        }
      }, [sessionId, running, draft, suggestion])

      // 采纳之后：用户改写了还是发出去了，只能从真实草稿变化里看。
      var viewRef = react.useRef(null)
      viewRef.current = {
        draft: draft,
        phase: phase,
        running: running,
        awaitingFirstTurn: awaitingFirstTurn,
        pendingSubmissions: pendingSubmissions
      }
      react.useEffect(function () {
        if (sessionId === undefined || sessionId === null) return
        acceptViews.set(sessionId, viewRef.current)
        observeAcceptance(sessionId, {
          draft: draft,
          phase: phase,
          running: running,
          pendingSubmissions: pendingSubmissions
        })
      }, [sessionId, draft, phase, running, pendingSubmissions, awaitingFirstTurn])
      react.useEffect(function () {
        if (sessionId === undefined || sessionId === null) return undefined
        return function () { acceptViews.delete(sessionId) }
      }, [sessionId])

      if (text === undefined || isOwner !== true) return null
      return react.createElement(
        'div',
        { style: { display: 'contents' }, 'data-input-suggest-ghost': '' },
        react.createElement('div', { className: 'dsh-input-suggest-ghost', 'aria-hidden': true }, text)
      )
    }


    var ACTIONS_CSS = [
      '.dsh-input-suggest-actions{position:relative;display:inline-flex;gap:2px;flex:0 0 auto;}',
      '.dsh-input-suggest-action{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:28px;height:28px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:12px;line-height:1.2;white-space:nowrap;cursor:pointer;touch-action:manipulation;}',
      '.dsh-input-suggest-action:hover{background:var(--dsw-alias-fill-tertiary,#80808018);}',
      '.dsh-input-suggest-action:focus-visible{outline:2px solid var(--dsw-alias-tint,#729dff);outline-offset:2px;}',
      '.dsh-input-suggest-action:disabled{opacity:.55;cursor:wait;}',
      '.dsh-input-suggest-spin{animation:dsh-input-suggest-spin 1s linear infinite;}',
      '@keyframes dsh-input-suggest-spin{to{transform:rotate(360deg);}}'
    ].join('\n')

    var ACTIONS_STYLE_ID = 'dsh-input-suggest-actions-style'

    /** 注入按钮样式。 */
    function useActionsStyles() {
      react.useEffect(function () {
        if (document.getElementById(ACTIONS_STYLE_ID) !== null) return undefined
        var tag = document.createElement('style')
        tag.id = ACTIONS_STYLE_ID
        tag.textContent = ACTIONS_CSS
        document.head.appendChild(tag)
        return undefined
      }, [])
    }

    /** 一个简笔图标。 */
    function icon(paths) {
      return react.createElement(
        'svg',
        {
          width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': true
        },
        paths.map(function (d, index) { return react.createElement('path', { key: String(index), d: d }) })
      )
    }

    /**
     * 输入框工具栏：重随（始终有），采纳（有建议且草稿为空时）。
     * @param {object} props - 会话作用域标准 props。
     */
    function SuggestionActions(props) {
      var sessionId = props.sessionId
      var useSession = props.useSession
      var useInput = props.useInput
      var inputActions = props.inputActions

      var t = copy()
      useActionsStyles()

      var source = useSuggestionSource(sessionId)
      var running = useSession(function (state) { return state.running })
      var draft = useInput(function (state) { return state.draft })
      var phase = useInput(function (state) { return state.phase })
      var draftRev = useInput(function (state) { return state.draftRev })

      var resultState = react.useState(null)
      var result = resultState[0]
      var setResult = resultState[1]
      var request = react.useRef(null)

      react.useEffect(function () {
        setResult(null)
        return function () {
          if (request.current !== null) request.current.abort()
          request.current = null
        }
      }, [sessionId])

      // 提示自动消失：早先 notice 只被覆盖、从不清除，一次「还没有完成的回合」会永远挂在这里。
      // 每次结果落地后起一个计时器，到点清掉；同一条提示被新结果替换时重新计时。
      var noticeTick = react.useRef(0)
      var noticeSequence = result === null || result.notice === null || result.notice === undefined ? null : result.notice
      react.useEffect(function () {
        if (noticeSequence === null) return undefined
        noticeTick.current += 1
        var mine = noticeTick.current
        var timer = setTimeout(function () {
          if (noticeTick.current !== mine) return
          setResult(function (previous) {
            if (previous === null || previous.notice === null) return previous
            return { sessionId: previous.sessionId, busy: previous.busy, notice: null }
          })
        }, NOTICE_TTL_MS)
        return function () { clearTimeout(timer) }
      }, [noticeSequence])

      var suggestion = source.suggestion
      var editable = running !== true && typeof draft === 'string' && draft.trim() === '' && (phase === undefined || phase === 'plain')
      // 「主动要一条」只在会话空闲时出现：正在生成时按钮会被忙碌态盖住。
      var editingAllowed = running !== true && (phase === undefined || phase === 'plain')
      var busy = result !== null && result.sessionId === sessionId && result.busy === true
      var notice = result !== null && result.sessionId === sessionId ? result.notice : null

      /** 采纳：只写草稿，绝不提交。 */
      var accept = function () {
        if (suggestion === null || suggestion === undefined) return
        if (editable !== true) return
        acceptSuggestion(sessionId, source, suggestion, inputActions, draftRev)
      }

      /**
       * 显式生成一次（重随 / 手动触发共用）。
       *
       * 用的是本会话共享的生成通道：两个视图各点一次不会并行打出两次请求，
       * 后发起的请求会取消前一个，迟到的旧结果也不会写回。
       */
      var reroll = function () {
        if (sessionId === undefined || sessionId === null) return
        if (busy === true) return
        var flight = source.beginGeneration()
        if (flight === null) return
        if (request.current !== null && request.current !== flight) request.current.abort()
        request.current = flight
        setResult({ sessionId: sessionId, busy: true, notice: null })
        var timer = setTimeout(function () { flight.abort() }, REQUEST_TIMEOUT_MS)
        var currentSuggestion = suggestion
        var options = {
          trigger: 'manual',
          draft: typeof draft === 'string' && draft.trim() !== '' ? draft : undefined,
          suggestionId: currentSuggestion === null || currentSuggestion === undefined
            ? undefined
            : suggestionIdentity(currentSuggestion)
        }
        void requestGeneration(sessionId, flight.signal, options).then(function (response) {
          if (request.current !== flight || flight.owns() !== true) return
          if (response.status === 'generated') {
            source.remember(response.suggestion)
            source.refresh()
            setResult({ sessionId: sessionId, busy: false, notice: null })
            return
          }
          setResult({
            sessionId: sessionId,
            busy: false,
            notice: response.status === 'empty'
              ? t.empty
              : response.status === 'no-context'
                ? t.noContext
                : response.status === 'busy'
                  ? t.busy
                  : response.status === 'limited'
                    ? t.limited
                    : response.status === 'skipped'
                      ? t.skipped
                      : t.failed
          })
        }).finally(function () {
          clearTimeout(timer)
          flight.settle()
          if (request.current === flight) request.current = null
        })
      }

      // 手动快捷键：放在 reroll 定义之后，避免在初始化前引用它。
      react.useEffect(function () {
        if (typeof window === 'undefined' || sessionId === undefined || sessionId === null) return undefined
        var matcher = parseAcceptKey(MANUAL_KEY)
        if (matcher === undefined) return undefined
        var onKeyDown = function (event) {
          if (event.isComposing === true) return
          if (matcher(event) !== true) return
          if (isComposerFocused() !== true) return
          event.preventDefault()
          reroll()
        }
        window.addEventListener('keydown', onKeyDown)
        return function () { window.removeEventListener('keydown', onKeyDown) }
      }, [sessionId, reroll])

      var children = []
      if (busy === true) {
        children.push(react.createElement('span', { key: 'spin', style: { display: 'inline-flex', alignItems: 'center', opacity: 0.7 } },
          react.createElement('span', { className: 'dsh-input-suggest-spin', style: { display: 'inline-flex' } },
            icon(['M13.6 8A5.6 5.6 0 1 1 8 2.4', 'M8 2.4h4v0']))
        ))
      }
      if (suggestion !== null && suggestion !== undefined && editable === true) {
        children.push(react.createElement('button', {
          key: 'accept',
          type: 'button',
          className: 'dsh-input-suggest-action',
          title: t.accept,
          'aria-label': t.accept,
          'data-input-suggest-accept': '',
          onMouseDown: function (event) { event.preventDefault() },
          onClick: accept
        }, icon(['m3 8.5 3.2 3.2L13 4.8'])))
      }
      // 没有建议时的主动入口：不用等回合、不用改设置，点一下就要一条。
      if ((suggestion === null || suggestion === undefined) && editingAllowed) {
        children.push(react.createElement('button', {
          key: 'summon',
          type: 'button',
          className: 'dsh-input-suggest-action',
          title: t.summon + ' (' + MANUAL_KEY + ')',
          'aria-label': t.summon,
          'data-input-suggest-summon': '',
          disabled: busy === true,
          onMouseDown: function (event) { event.preventDefault() },
          onClick: reroll
        }, icon(['M8 2.2v3', 'M8 10.8v3', 'M2.2 8h3', 'M10.8 8h3', 'M4 4l1.8 1.8', 'M10.2 10.2L12 12', 'M12 4l-1.8 1.8', 'M5.8 10.2L4 12'])))
      }
      children.push(react.createElement('button', {
        key: 'reroll',
        type: 'button',
        className: 'dsh-input-suggest-action',
        title: busy === true ? t.generating : (typeof draft === 'string' && draft.trim() !== '' ? t.refine : t.regenerate),
        'aria-label': busy === true ? t.generating : (typeof draft === 'string' && draft.trim() !== '' ? t.refine : t.regenerate),
        'aria-busy': busy === true,
        'data-input-suggest-reroll': '',
        disabled: busy === true,
        onMouseDown: function (event) { event.preventDefault() },
        onClick: reroll
      }, icon(['M13.4 6.3A5.6 5.6 0 1 0 14 8', 'M13.6 2.4v4h-4'])))

      return react.createElement(
        'span',
        { className: 'dsh-input-suggest-actions', 'data-input-suggest-actions': '' },
        children,
        notice === null ? null : react.createElement('span', {
          role: 'status',
          style: { position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, whiteSpace: 'nowrap', fontSize: 12, opacity: 0.75 }
        }, notice)
      )
    }


    var styles = {
      page: { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640, padding: '4px 2px 24px', fontSize: 13, lineHeight: 1.6 },
      intro: { opacity: 0.72 },
      section: { border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24))', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
      title: { fontWeight: 600, fontSize: 13.5 },
      help: { opacity: 0.62, fontSize: 12 },
      row: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
      label: { flex: '0 0 auto', minWidth: 150 },
      control: { display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minWidth: 0 },
      input: { width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'inherit', font: 'inherit' },
      textarea: { width: '100%', boxSizing: 'border-box', minHeight: 96, resize: 'vertical', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'inherit', font: 'inherit' },
      select: { width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'inherit', font: 'inherit' },
      notice: { color: 'var(--dsw-alias-state-warning-primary, #d97706)', fontSize: 12 },
      check: { display: 'flex', alignItems: 'center', gap: 8 },
      actions: { display: 'flex', alignItems: 'center', gap: 10 },
      button: { padding: '6px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      primary: { padding: '6px 16px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))', background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.22))', color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 600 },
      link: { padding: 0, border: 'none', background: 'none', color: 'inherit', opacity: 0.7, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' },
      usageGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 16px', fontSize: 12 },
      usageValue: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 }
    }

    /** 一行：左标签 + 右控件。 */
    function Row(props) {
      return react.createElement(
        'div',
        { style: styles.row },
        react.createElement('div', { style: styles.label }, props.label),
        react.createElement('div', { style: styles.control }, props.children)
      )
    }

    /** 订阅一个配置表单 scope。 */
    /** 读快照的安全包装：缺 scope 或形状异常时给一个 unavailable 快照。 */
    var EMPTY_SNAPSHOT = { status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode: 'host' }

    function snapshotOf(scope) {
      try {
        var value = scope === null || scope === undefined || typeof scope.getSnapshot !== 'function' ? undefined : scope.getSnapshot()
        return value !== null && typeof value === 'object' ? value : EMPTY_SNAPSHOT
      } catch {
        return EMPTY_SNAPSHOT
      }
    }

    function useScope(scope) {
      var state = react.useState(function () { return snapshotOf(scope) })
      react.useEffect(function () {
        state[1](snapshotOf(scope))
        if (scope === null || scope === undefined || typeof scope.subscribe !== 'function') return undefined
        return scope.subscribe(function () { state[1](snapshotOf(scope)) })
      }, [scope])
      return state[0]
    }

    /** 一个分区的草稿状态机：跟随 Host 值、记录脏标记、按修订号保存。 */
    function useSection(scope, normalize, opsOf) {
      var snapshot = useScope(scope)
      var current = normalize(snapshot.value)
      var currentKey = JSON.stringify(current)
      var draftState = react.useState(current)
      var draft = draftState[0]
      var setDraft = draftState[1]
      var dirtyState = react.useState(false)
      var dirty = dirtyState[0]
      var setDirty = dirtyState[1]
      var busyState = react.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var noticeState = react.useState('')
      var notice = noticeState[0]
      var setNotice = noticeState[1]

      react.useEffect(function () {
        if (dirty !== true) setDraft(JSON.parse(currentKey))
      }, [currentKey, dirty])

      var edit = function (patch) {
        setDraft(function (previous) {
          var next = {}
          for (var key in previous) next[key] = previous[key]
          for (var patchKey in patch) next[patchKey] = patch[patchKey]
          return next
        })
        setDirty(true)
        setNotice('')
      }

      var reset = function (next) {
        setDraft(next)
        setDirty(false)
        setNotice('')
      }

      var save = async function () {
        var ops = opsOf(draft, JSON.parse(currentKey))
        if (ops.length === 0) {
          setNotice(copy().unavailable)
          return false
        }
        var live = scope.getSnapshot()
        if (live.status !== 'ready') { setNotice(copy().unavailable); return false }
        if (live.writable !== true) { setNotice(copy().readonly); return false }
        if (live.revision !== snapshot.revision) { setNotice(copy().conflict); return false }
        setBusy(true)
        try {
          await scope.mutate(ops, live.revision)
          setDirty(false)
          setNotice(copy().saved)
          return true
        } catch (error) {
          var message = error !== null && error !== undefined && error.message !== undefined ? error.message : error
          setNotice(String(message))
          return false
        } finally {
          setBusy(false)
        }
      }

      return { snapshot: snapshot, current: current, draft: draft, dirty: dirty, edit: edit, reset: reset, save: save, busy: busy, notice: notice }
    }

    /** 读 Host 的实时模型目录。 */
    /**
     * 读本功能的 token 账本。
     *
     * 与建议本身不同，账本是长期累计的统计，不需要 900ms 轮询；
     * 设置页打开时读一次，用户点「刷新」再读一次。
     */
    function useUsage() {
      var state = react.useState({ status: 'idle', usage: null, topFeedback: null })
      var nonceState = react.useState(0)
      var setNonce = nonceState[1]

      react.useEffect(function () {
        var live = true
        state[1]({ status: 'loading', usage: state[0].usage, topFeedback: state[0].topFeedback })
        Promise.resolve()
          .then(function () {
            return fetch(USAGE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' })
          })
          .then(function (response) { return response.ok === true ? response.json() : null })
          .then(function (body) {
            if (!live) return
            var usage = body !== null && body !== undefined && typeof body === 'object' ? body.usage : null
            var topFeedback = body !== null && body !== undefined && typeof body === 'object'
              && body.feedback !== null && typeof body.feedback === 'object'
              ? body.feedback
              : null
            state[1]({ status: usage === null || usage === undefined ? 'error' : 'ready', usage: usage ?? null, topFeedback })
          })
          .catch(function () {
            if (live) state[1]({ status: 'error', usage: state[0].usage, topFeedback: state[0].topFeedback })
          })
        return function () { live = false }
      }, [nonceState[0]])

      return {
        status: state[0].status,
        usage: state[0].usage,
        topFeedback: state[0].topFeedback,
        refresh: function () { setNonce(function (n) { return n + 1 }) },
      }
    }

    /** 把 token 数量写成便于阅读的形式。 */
    /**
     * 读风格预设目录。
     *
     * 预设文本住在宿主侧的 prompt.js；这里只拿 id、名称、说明和推荐值。
     * 读不到时返回空列表，设置页退化成「只能手写风格」，不会整页空白。
     */
    function usePresets() {
      var state = react.useState({ status: 'loading', presets: [], fallback: '' })
      var setState = state[1]
      var nonceState = react.useState(0)
      var setNonce = nonceState[1]

      react.useEffect(function () {
        var live = true
        Promise.resolve()
          .then(function () {
            return fetch(PRESETS_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' })
          })
          .then(function (response) { return response.ok === true ? response.json() : null })
          .then(function (body) {
            if (!live) return
            var list = body !== null && body !== undefined && Array.isArray(body.presets) ? body.presets : []
            var fallback = body !== null && body !== undefined && typeof body.default === 'string' ? body.default : ''
            setState({ status: list.length === 0 ? 'error' : 'ready', presets: list, fallback: fallback })
          })
          .catch(function () {
            if (live) setState({ status: 'error', presets: [], fallback: '' })
          })
        return function () { live = false }
      }, [nonceState[0]])

      return {
        status: state[0].status,
        presets: state[0].presets,
        fallback: state[0].fallback,
        refresh: function () { setNonce(function (n) { return n + 1 }) }
      }
    }

    /** 预设的本地化文本：label / description 可能是 { zh, en }。 */
    function presetText(field) {
      if (field === null || field === undefined) return ''
      if (typeof field === 'string') return field
      var key = isChinese() ? 'zh' : 'en'
      var value = field[key] !== undefined ? field[key] : field.en !== undefined ? field.en : field.zh
      return typeof value === 'string' ? value : ''
    }

    function formatTokens(value) {
      var number = Number(value ?? 0)
      if (!Number.isFinite(number) || number <= 0) return '0'
      if (number >= 1000000) return (number / 1000000).toFixed(2) + 'M'
      if (number >= 1000) return (number / 1000).toFixed(1) + 'k'
      return String(Math.round(number))
    }

    /** 建议模式：predict | next-action | hybrid。 */
    function normalizeMode(value) {
      return value === 'predict' || value === 'next-action' ? value : 'hybrid'
    }

    /** 上下文范围：recent | task | extended。 */
    function normalizeContextLevel(value) {
      return value === 'recent' || value === 'extended' ? value : 'task'
    }

    /** 输出格式：single-line | concise | structured | steps | research | custom。 */
    function normalizeOutputFormat(value) {
      return value === 'single-line' || value === 'concise' || value === 'structured'
        || value === 'steps' || value === 'research' || value === 'custom' ? value : 'single-line'
    }

    /** 设置页读到的配置 -> 表单草稿。缺字段时补默认值。 */
    function normalizeSettings(value) {
      var source = value !== null && value !== undefined ? value : {}
      return {
        enabled: source.enabled !== false,
        provider: str(source.provider),
        model: str(source.model),
        reasoningEffort: str(source.reasoningEffort),
        acceptKey: str(source.acceptKey) || 'Tab',
        maxSuggestionChars: String(source.maxSuggestionChars !== undefined ? source.maxSuggestionChars : 240),
        style: str(source.style),
        stylePreset: str(source.stylePreset) || 'neutral',
        detailLevel: str(source.detailLevel) || 'standard',
        template: str(source.template),
        useMemory: source.useMemory !== false,
        useExamples: source.useExamples !== false,
        learn: source.learn !== false,
        allowRemote: source.allowRemote === true,
        mode: normalizeMode(source.mode),
        taskAwareness: source.taskAwareness !== false,
        contextLevel: normalizeContextLevel(source.contextLevel),
        taskMemoryMinutes: String(
          Number.isSafeInteger(source.taskMemoryMinutes) ? source.taskMemoryMinutes : 30
        ),
        draftCompletion: source.draftCompletion === true,
        outputFormat: normalizeOutputFormat(source.outputFormat),
        formatTemplate: str(source.formatTemplate),
        agentConfig: source.agentConfig !== false,
        localPolicy: source.localPolicy === 'strict-local' ? 'strict-local' : 'loopback-gateway',
        trustedLocalProvider: str(source.trustedLocalProvider),
        trustedLocalModel: str(source.trustedLocalModel)
      }
    }

    /** 表单草稿与宿主值之间的差异，变成 configForms 的 op 列表。 */
    function settingsOps(draft, live) {
      var ops = []
      if (draft.enabled !== live.enabled) ops.push({ op: 'set', path: ['enabled'], value: draft.enabled === true })
      var flags = ['useMemory', 'useExamples', 'learn', 'allowRemote', 'taskAwareness', 'draftCompletion', 'agentConfig']
      for (var flagIndex = 0; flagIndex < flags.length; flagIndex += 1) {
        var flag = flags[flagIndex]
        if (draft[flag] !== live[flag]) ops.push({ op: 'set', path: [flag], value: draft[flag] === true })
      }
      if (draft.detailLevel !== live.detailLevel) ops.push({ op: 'set', path: ['detailLevel'], value: draft.detailLevel })
      if (draft.stylePreset !== live.stylePreset) ops.push({ op: 'set', path: ['stylePreset'], value: draft.stylePreset })
      if (draft.mode !== live.mode) ops.push({ op: 'set', path: ['mode'], value: draft.mode })
      if (draft.contextLevel !== live.contextLevel) {
        ops.push({ op: 'set', path: ['contextLevel'], value: draft.contextLevel })
      }
      if (draft.outputFormat !== live.outputFormat) {
        ops.push({ op: 'set', path: ['outputFormat'], value: draft.outputFormat })
      }
      if (draft.localPolicy !== live.localPolicy) {
        ops.push({ op: 'set', path: ['localPolicy'], value: draft.localPolicy })
      }
      var textFields = ['provider', 'model', 'reasoningEffort', 'style', 'template', 'formatTemplate', 'trustedLocalProvider', 'trustedLocalModel']
      for (var index = 0; index < textFields.length; index += 1) {
        var field = textFields[index]
        if (draft[field] === live[field]) continue
        ops.push(draft[field] === '' ? { op: 'unset', path: [field] } : { op: 'set', path: [field], value: draft[field] })
      }
      if (draft.acceptKey !== live.acceptKey && draft.acceptKey !== '') {
        ops.push({ op: 'set', path: ['acceptKey'], value: draft.acceptKey })
      }
      if (draft.taskMemoryMinutes !== live.taskMemoryMinutes) {
        var minutes = Number(draft.taskMemoryMinutes)
        // 越界的输入不写回去：0 表示不留存，120 是上限。
        if (Number.isSafeInteger(minutes) && minutes >= 0 && minutes <= 120) {
          ops.push({ op: 'set', path: ['taskMemoryMinutes'], value: minutes })
        }
      }
      if (draft.maxSuggestionChars !== live.maxSuggestionChars) {
        var chars = Number(draft.maxSuggestionChars)
        if (Number.isSafeInteger(chars) && chars >= 1) {
          ops.push({ op: 'set', path: ['maxSuggestionChars'], value: chars })
        }
      }
      return ops
    }

    /** 比率（0..1，分母为零时为 null）写成百分比。 */
    function formatRate(value) {
      if (value === null || value === undefined) return '—'
      var number = Number(value)
      if (!Number.isFinite(number)) return '—'
      return String(Math.round(number * 100)) + '%'
    }

    /** 平均响应时间：毫秒给到秒，超过一分钟给到分。 */
    function formatMilliseconds(value) {
      if (value === null || value === undefined) return '—'
      var number = Number(value)
      if (!Number.isFinite(number) || number < 0) return '—'
      if (number < 1000) return String(Math.round(number)) + 'ms'
      if (number < 60000) return (number / 1000).toFixed(1) + 's'
      return (number / 60000).toFixed(1) + 'min'
    }

    /** 读 Host 的实时模型目录。 */
    function useCatalog(ctx) {
      var state = react.useState({ status: 'idle', groups: [], failures: 0 })
      var nonceState = react.useState(0)
      var setNonce = nonceState[1]

      react.useEffect(function () {
        var live = true
        state[1](function (previous) {
          var next = {}
          for (var key in previous) next[key] = previous[key]
          next.status = 'loading'
          return next
        })
        Promise.resolve()
          .then(function () {
            // remote 缺失时降级为空目录：设置页其余部分仍然可用。
            if (ctx === null || ctx === undefined || ctx.remote === null || ctx.remote === undefined
              || ctx.remote.session === null || ctx.remote.session === undefined
              || typeof ctx.remote.session.modelCatalog !== 'function') {
              return { ok: false, value: { groups: [], failures: [] } }
            }
            return ctx.remote.session.modelCatalog()
          })
          .then(function (response) {
            if (!live) return
            if (response !== null && response !== undefined && response.ok === true) {
              var value = response.value !== null && response.value !== undefined ? response.value : {}
              state[1]({
                status: 'ready',
                groups: Array.isArray(value.groups) ? value.groups : [],
                failures: Array.isArray(value.failures) ? value.failures.length : 0
              })
            } else {
              state[1]({ status: 'error', groups: [], failures: 0 })
            }
          })
          .catch(function () {
            if (live) state[1]({ status: 'error', groups: [], failures: 0 })
          })
        return function () { live = false }
      }, [ctx, nonceState[0]])

      // 订阅是可选的：没有 remote 就不订阅，页面照常渲染。
      react.useEffect(function () {
        if (ctx === null || ctx === undefined || ctx.remote === null || ctx.remote === undefined
          || typeof ctx.remote.$on !== 'function') return undefined
        var off = ctx.remote.$on('llm/adapters-updated', function () { setNonce(function (n) { return n + 1 }) })
        return typeof off === 'function' ? off : undefined
      }, [ctx])
      react.useEffect(function () {
        if (ctx === null || ctx === undefined || ctx.remote === null || ctx.remote === undefined
          || typeof ctx.remote.$on !== 'function') return undefined
        var off = ctx.remote.$on('settings/document-updated', function () { setNonce(function (n) { return n + 1 }) })
        return typeof off === 'function' ? off : undefined
      }, [ctx])

      return {
        status: state[0].status,
        groups: state[0].groups,
        failures: state[0].failures,
        refresh: function () { setNonce(function (n) { return n + 1 }) }
      }
    }

    /** 供应商下拉选项。 */
    function providerOptions(catalog, currentProvider) {
      var options = catalog.groups.map(function (group) {
        return { value: group.id, label: group.name ? group.id + ' - ' + group.name : group.id }
      })
      if (currentProvider !== '' && !options.some(function (option) { return option.value === currentProvider })) {
        options.push({ value: currentProvider, label: currentProvider + ' (not in catalog)' })
      }
      return options
    }

    /** 模型下拉选项。 */
    function modelOptions(catalog, provider, currentModel) {
      var group = catalog.groups.find(function (candidate) { return candidate.id === provider })
      var models = group !== undefined && Array.isArray(group.models) ? group.models : []
      var options = models.map(function (model) {
        return { value: model.id, label: model.name ? model.id + ' - ' + model.name : model.id }
      })
      if (currentModel !== '' && !options.some(function (option) { return option.value === currentModel })) {
        options.push({ value: currentModel, label: currentModel + ' (not in catalog)' })
      }
      return options
    }

    /** 思考强度下拉选项。 */
    function effortOptions(catalog, provider, model, currentEffort) {
      var group = catalog.groups.find(function (candidate) { return candidate.id === provider })
      var entry = group !== undefined && Array.isArray(group.models)
        ? group.models.find(function (candidate) { return candidate.id === model })
        : undefined
      var efforts = entry !== undefined && entry.reasoning !== undefined && Array.isArray(entry.reasoning.efforts)
        ? entry.reasoning.efforts
        : []
      var options = efforts.map(function (effort) {
        var isDefault = entry !== undefined && entry.reasoning !== undefined && effort.id === entry.reasoning.defaultEffort
        return { value: effort.id, label: (effort.name || effort.id) + (isDefault ? ' (default)' : '') }
      })
      if (currentEffort !== '' && !options.some(function (option) { return option.value === currentEffort })) {
        options.push({ value: currentEffort, label: currentEffort + ' (not in catalog)' })
      }
      return options
    }

    /** 下拉框。 */
    function Select(props) {
      return react.createElement(
        'select',
        {
          style: styles.select,
          value: props.value,
          disabled: props.disabled === true,
          onChange: function (event) { props.onChange(event.target.value) }
        },
        props.options.map(function (option) {
          return react.createElement('option', { key: option.value === '' ? '__empty' : option.value, value: option.value }, option.label)
        })
      )
    }

    /** 快捷键捕获输入框：聚焦后直接按组合键即可写入。 */
    function AcceptKeyInput(props) {
      var focusedState = react.useState(false)
      var focused = focusedState[0]
      var setFocused = focusedState[1]
      return react.createElement('input', {
        type: 'text',
        readOnly: true,
        value: props.value,
        placeholder: 'Tab',
        style: focused ? Object.assign({}, styles.input, { borderColor: 'var(--dsw-alias-tint, #729dff)' }) : styles.input,
        onFocus: function () { setFocused(true) },
        onBlur: function () { setFocused(false) },
        onKeyDown: function (event) {
          event.preventDefault()
          if (event.key === 'Escape') {
            event.currentTarget.blur()
            return
          }
          var encoded = encodeKey(event.code, {
            alt: event.altKey === true,
            ctrl: event.ctrlKey === true,
            meta: event.metaKey === true,
            shift: event.shiftKey === true
          })
          if (encoded === undefined) return
          props.onChange(encoded)
        }
      })
    }


    /**
     * 设置页：模型路由 / 行为 / 提示词与风格。
     * @param {object} props - 设置 section props（含注入的 scopes 与 ctx）。
     */
    function InputSuggestSettingsPage(props) {
      var t = copy()
      var catalog = useCatalog(props.ctx)
      var usage = useUsage()
      var presets = usePresets()
      var scopes = props.scopes
      // 反馈统计住在 /usage 的 feedback 段；旧宿主没有这一段时整块隐藏。
      var usageFeedback = usage.usage !== null && usage.usage !== undefined
        && usage.usage.feedback !== null && typeof usage.usage.feedback === 'object'
        ? usage.usage.feedback
        : null
      var feedback = usage.topFeedback !== null && typeof usage.topFeedback === 'object'
        ? usage.topFeedback
        : usageFeedback

      var main = useSection(
        scopes.main,
        normalizeSettings,
        settingsOps
      )

      var setField = function (field, value) {
        var patch = {}
        patch[field] = value
        main.edit(patch)
      }

      var reset = function () {
        main.reset(main.current)
      }

      // 风格预设：选中只是写入 stylePreset，模型指令由宿主侧 prompt.js 提供。
      // 预设的推荐值（详细度、字符上限）不会自动覆盖用户的选择，需要显式「套用」，
      // 否则用户调过长度之后再点预设会被悄悄改回去。
      var presetOptions = presets.presets.map(function (preset) {
        return { value: preset.id, label: presetText(preset.label) }
      })
      // 目录读不到、或配置里是个本版没有的预设时，把当前值补进去：
      // 否则下拉框的 value 匹配不到任何 option，显示成空白。
      if (main.draft.stylePreset !== '' && !presetOptions.some(function (option) { return option.value === main.draft.stylePreset })) {
        presetOptions.push({ value: main.draft.stylePreset, label: main.draft.stylePreset + ' (not in catalog)' })
      }
      var activePreset = null
      for (var presetIndex = 0; presetIndex < presets.presets.length; presetIndex += 1) {
        if (presets.presets[presetIndex].id === main.draft.stylePreset) { activePreset = presets.presets[presetIndex]; break }
      }
      var applyPresetValues = function () {
        if (activePreset === null) return
        main.edit({
          detailLevel: str(activePreset.detailLevel) || main.draft.detailLevel,
          maxSuggestionChars: String(activePreset.maxChars !== undefined ? activePreset.maxChars : main.draft.maxSuggestionChars)
        })
      }

      return react.createElement(
        'div',
        { style: styles.page },
        react.createElement('div', { style: styles.intro }, t.intro),

        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.routeTitle),
          react.createElement('div', { style: styles.help }, t.routeHelp),
          react.createElement(Row, { label: t.provider },
            react.createElement(Select, {
              value: main.draft.provider,
              options: [{ value: '', label: t.inherit }].concat(providerOptions(catalog, main.draft.provider)),
              onChange: function (value) { setField('provider', value) }
            })
          ),
          react.createElement(Row, { label: t.model },
            react.createElement(Select, {
              value: main.draft.model,
              options: [{ value: '', label: t.inherit }].concat(modelOptions(catalog, main.draft.provider, main.draft.model)),
              onChange: function (value) { setField('model', value) }
            })
          ),
          react.createElement(Row, { label: t.effort },
            react.createElement(Select, {
              value: main.draft.reasoningEffort,
              options: [{ value: '', label: t.modelDefault }].concat(effortOptions(catalog, main.draft.provider, main.draft.model, main.draft.reasoningEffort)),
              onChange: function (value) { setField('reasoningEffort', value) }
            })
          ),
          catalog.status === 'error' ? react.createElement('div', { style: styles.notice }, t.catalogFailed) : null,
          react.createElement('div', { style: styles.actions },
            react.createElement('button', { type: 'button', style: styles.link, onClick: catalog.refresh }, t.refresh)
          )
        ),

        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.behaviourTitle),
          react.createElement('label', { style: styles.check },
            react.createElement('input', {
              type: 'checkbox',
              checked: main.draft.enabled === true,
              onChange: function (event) { setField('enabled', event.target.checked) }
            }),
            react.createElement('span', null, t.enabled)
          ),
          react.createElement(Row, { label: t.acceptKey },
            react.createElement(AcceptKeyInput, {
              value: main.draft.acceptKey,
              onChange: function (value) { setField('acceptKey', value) }
            })
          ),
          react.createElement('div', { style: styles.help }, t.acceptKeyHelp),
          react.createElement(Row, { label: t.detail },
            react.createElement(Select, {
              value: main.draft.detailLevel,
              options: [
                { value: 'brief', label: t.detailBrief },
                { value: 'standard', label: t.detailStandard },
                { value: 'detailed', label: t.detailDetailed }
              ],
              onChange: function (value) { setField('detailLevel', value) }
            })
          ),
          react.createElement('div', { style: styles.help }, t.detailHelp),
          react.createElement(Row, { label: t.maxChars },
            react.createElement('input', {
              type: 'number',
              min: 1,
              style: styles.input,
              value: main.draft.maxSuggestionChars,
              onChange: function (event) { setField('maxSuggestionChars', event.target.value) }
            })
          )
        ),

        // 建议策略：模式、任务感知、上下文范围。三者互相独立，都能单独关掉。
        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.strategyTitle),
          react.createElement(Row, { label: t.mode },
            react.createElement(Select, {
              value: main.draft.mode,
              options: [
                { value: 'hybrid', label: t.modeHybrid },
                { value: 'predict', label: t.modePredict },
                { value: 'next-action', label: t.modeNext }
              ],
              onChange: function (value) { setField('mode', value) }
            })
          ),
          react.createElement('div', { style: styles.help }, t.modeHelp),
          react.createElement(Row, { label: t.taskAwareness },
            react.createElement('label', { style: styles.check },
              react.createElement('input', {
                type: 'checkbox',
                checked: main.draft.taskAwareness === true,
                onChange: function (event) { setField('taskAwareness', event.target.checked) }
              }),
              react.createElement('span', null, t.on)
            )
          ),
          react.createElement('div', { style: styles.help }, t.taskAwarenessHelp),
          react.createElement(Row, { label: t.contextLevel },
            react.createElement(Select, {
              value: main.draft.contextLevel,
              options: [
                { value: 'recent', label: t.contextRecent },
                { value: 'task', label: t.contextTask },
                { value: 'extended', label: t.contextExtended }
              ],
              onChange: function (value) { setField('contextLevel', value) }
            })
          ),
          react.createElement('div', { style: styles.help }, t.contextHelp),
          react.createElement(Row, { label: t.taskMemory },
            react.createElement('input', {
              type: 'number',
              min: 0,
              max: 120,
              style: styles.input,
              value: main.draft.taskMemoryMinutes,
              onChange: function (event) { setField('taskMemoryMinutes', event.target.value) }
            })
          ),
          react.createElement('div', { style: styles.help }, t.taskMemoryHelp),
          react.createElement(Row, { label: t.draftCompletion },
            react.createElement('label', { style: styles.check },
              react.createElement('input', {
                type: 'checkbox',
                checked: main.draft.draftCompletion === true,
                onChange: function (event) { setField('draftCompletion', event.target.checked) }
              }),
              react.createElement('span', null, t.on)
            )
          ),
          react.createElement('div', { style: styles.help }, t.draftCompletionHelp)
        ),

        // 输出格式：与风格预设独立。结构化 / 分步 / 研究是多行建议。
        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.formatTitle),
          react.createElement('div', { style: styles.help }, t.formatHelp),
          react.createElement(Select, {
            value: main.draft.outputFormat,
            options: [
              { value: 'single-line', label: t.formatSingle },
              { value: 'concise', label: t.formatConcise },
              { value: 'structured', label: t.formatStructured },
              { value: 'steps', label: t.formatSteps },
              { value: 'research', label: t.formatResearch },
              { value: 'custom', label: t.formatCustom }
            ],
            onChange: function (value) { setField('outputFormat', value) }
          }),
          main.draft.outputFormat !== 'custom' ? null : react.createElement('div', { style: styles.help }, t.formatTemplateHelp),
          main.draft.outputFormat !== 'custom' ? null : react.createElement('textarea', {
            style: styles.textarea,
            value: main.draft.formatTemplate,
            placeholder: t.formatTemplatePlaceholder,
            onChange: function (event) { setField('formatTemplate', event.target.value) }
          })
        ),

        // 风格预设：常见诉求（方案类、理论推导等）做成下拉选项，
        // 选中后写入 stylePreset，由宿主拼进系统提示词；下方仍可自由覆盖。
        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.presetTitle),
          react.createElement('div', { style: styles.help }, t.presetHelp),
          react.createElement(Select, {
            value: main.draft.stylePreset,
            // neutral 本身就是「不加额外指令」，所以没有单独的「自定义」项：
            // 要补充要求就写在下面的风格文本框，它追加在预设之后。
            options: presetOptions.length > 0 ? presetOptions : [{ value: 'neutral', label: 'neutral' }],
            onChange: function (value) { setField('stylePreset', value) }
          }),
          activePreset === null ? null : react.createElement('div', { style: styles.help }, presetText(activePreset.description)),
          activePreset === null ? null : react.createElement('div', { style: styles.actions },
            react.createElement('button', {
              type: 'button',
              style: styles.button,
              onClick: applyPresetValues
            }, t.presetApply)
          ),
          react.createElement('div', { style: styles.help }, t.presetHint),
          presets.status === 'error' ? react.createElement('div', { style: styles.notice }, t.presetFailed) : null
        ),

        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.styleTitle),
          react.createElement('div', { style: styles.help }, t.styleHelp),
          react.createElement('textarea', {
            style: styles.textarea,
            value: main.draft.style,
            placeholder: t.stylePlaceholder,
            onChange: function (event) { setField('style', event.target.value) }
          }),
          react.createElement('div', { style: styles.help }, t.styleHelpExtra)
        ),

        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.templateTitle),
          react.createElement('div', { style: styles.help }, t.templateHelp),
          react.createElement('textarea', {
            style: Object.assign({}, styles.textarea, { minHeight: 220, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12 }),
            value: main.draft.template,
            placeholder: t.templatePlaceholder,
            onChange: function (event) { setField('template', event.target.value) }
          }),
          react.createElement(Row, { label: t.templateMemory },
            react.createElement('label', { style: styles.check },
              react.createElement('input', {
                type: 'checkbox',
                checked: main.draft.useMemory === true,
                onChange: function (event) { setField('useMemory', event.target.checked) }
              }),
              react.createElement('span', null, t.on)
            )
          ),
          react.createElement(Row, { label: t.templateExamples },
            react.createElement('label', { style: styles.check },
              react.createElement('input', {
                type: 'checkbox',
                checked: main.draft.useExamples === true,
                onChange: function (event) { setField('useExamples', event.target.checked) }
              }),
              react.createElement('span', null, t.on)
            )
          )
        ),

        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.memoryTitle),
          react.createElement('div', { style: styles.help }, t.memoryHelp),
          react.createElement(Row, { label: t.learn },
            react.createElement('label', { style: styles.check },
              react.createElement('input', {
                type: 'checkbox',
                checked: main.draft.learn === true,
                onChange: function (event) { setField('learn', event.target.checked) }
              }),
              react.createElement('span', null, t.on)
            )
          ),
          react.createElement(Row, { label: t.allowRemote },
            react.createElement('label', { style: styles.check },
              react.createElement('input', {
                type: 'checkbox',
                checked: main.draft.allowRemote === true,
                onChange: function (event) { setField('allowRemote', event.target.checked) }
              }),
              react.createElement('span', null, t.on)
            )
          ),
          react.createElement('div', { style: styles.help }, t.allowRemoteHelp),
          react.createElement(Row, { label: t.localPolicy },
            react.createElement(Select, {
              value: main.draft.localPolicy,
              options: [
                { value: 'loopback-gateway', label: t.localPolicyGateway },
                { value: 'strict-local', label: t.localPolicyStrict }
              ],
              onChange: function (value) { setField('localPolicy', value) }
            })
          ),
          react.createElement('div', { style: styles.help }, t.localPolicyHelp),
          main.draft.localPolicy !== 'strict-local' ? null : react.createElement(Row, { label: t.trustedProvider },
            react.createElement('input', {
              type: 'text',
              style: styles.input,
              value: main.draft.trustedLocalProvider,
              placeholder: 'opencodex',
              onChange: function (event) { setField('trustedLocalProvider', event.target.value) }
            })
          ),
          main.draft.localPolicy !== 'strict-local' ? null : react.createElement(Row, { label: t.trustedModel },
            react.createElement('input', {
              type: 'text',
              style: styles.input,
              value: main.draft.trustedLocalModel,
              placeholder: 'llama-3.1-8b',
              onChange: function (event) { setField('trustedLocalModel', event.target.value) }
            })
          ),
          main.draft.localPolicy !== 'strict-local' ? null : react.createElement('div', { style: styles.help }, t.trustedHelp)
        ),

        // token 用量：本功能自己的账本，与会话主模型的消耗分开看。
        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.usageTitle),
          react.createElement('div', { style: styles.help }, t.usageHelp),
          usage.status === 'error'
            ? react.createElement('div', { style: styles.notice }, t.usageFailed)
            : react.createElement(
              'div',
              { style: styles.usageGrid },
              react.createElement('span', null, t.usageCalls),
              react.createElement('span', { style: styles.usageValue }, String(usage.usage?.calls ?? 0)),
              react.createElement('span', null, t.usageTotal),
              react.createElement('span', { style: styles.usageValue }, formatTokens(usage.usage?.totalTokens)),
              react.createElement('span', null, t.usageInput),
              react.createElement('span', { style: styles.usageValue }, formatTokens(usage.usage?.inputTokens)),
              react.createElement('span', null, t.usageOutput),
              react.createElement('span', { style: styles.usageValue }, formatTokens(usage.usage?.outputTokens)),
              react.createElement('span', null, t.usageAvg),
              react.createElement('span', { style: styles.usageValue }, formatTokens(usage.usage?.avgTokensPerCall)),
              react.createElement('span', null, t.usageFailedCalls),
              react.createElement('span', { style: styles.usageValue }, String(usage.usage?.failures ?? 0))
            ),
          react.createElement('div', { style: styles.actions },
            react.createElement('button', {
              type: 'button',
              style: styles.link,
              onClick: usage.refresh,
            }, t.refresh)
          )
        ),

        // 建议反馈：只统计真实事件。发送与改写由宿主按你实际发出的消息判定。
        react.createElement(
          'div',
          { style: styles.section },
          react.createElement('div', { style: styles.title }, t.feedbackTitle),
          react.createElement('div', { style: styles.help }, t.feedbackHelp),
          react.createElement(
            'div',
            { style: styles.usageGrid },
            react.createElement('span', null, t.feedbackShown),
            react.createElement('span', { style: styles.usageValue }, String(feedback?.shown ?? 0)),
            react.createElement('span', null, t.feedbackAccepted),
            react.createElement('span', { style: styles.usageValue }, String(feedback?.accepted ?? 0)),
            react.createElement('span', null, t.feedbackSent),
            react.createElement('span', { style: styles.usageValue }, String(feedback?.sent ?? 0)),
            react.createElement('span', null, t.feedbackEdited),
            react.createElement('span', { style: styles.usageValue }, String(feedback?.edited ?? 0)),
            react.createElement('span', null, t.feedbackDismissed),
            react.createElement('span', { style: styles.usageValue }, String(feedback?.dismissed ?? 0)),
            react.createElement('span', null, t.feedbackRegenerated),
            react.createElement('span', { style: styles.usageValue }, String(feedback?.regenerated ?? 0)),
            react.createElement('span', null, t.feedbackAcceptRate),
            react.createElement('span', { style: styles.usageValue }, formatRate(feedback?.acceptRate)),
            react.createElement('span', null, t.feedbackSendRate),
            react.createElement('span', { style: styles.usageValue }, formatRate(feedback?.sendRate)),
            react.createElement('span', null, t.feedbackEditRatio),
            react.createElement('span', { style: styles.usageValue }, formatRate(feedback?.avgEditRatio)),
            react.createElement('span', null, t.feedbackDuplicateRate),
            react.createElement('span', { style: styles.usageValue }, formatRate(feedback?.duplicateRate)),
            react.createElement('span', null, t.feedbackResponse),
            react.createElement('span', { style: styles.usageValue }, formatMilliseconds(feedback?.avgResponseMs)),
            react.createElement('span', null, t.feedbackTokensPerSent),
            react.createElement('span', { style: styles.usageValue }, formatTokens(feedback?.tokensPerSent))
          ),
          feedback === null ? react.createElement('div', { style: styles.help }, t.feedbackEmpty) : null
        ),

        main.notice !== '' ? react.createElement('div', { style: styles.notice }, main.notice) : null,
        react.createElement(
          'div',
          { style: styles.actions },
          react.createElement('button', {
            type: 'button',
            style: styles.primary,
            disabled: main.busy === true || main.dirty !== true,
            onClick: function () { void main.save() }
          }, main.busy === true ? t.saving : t.save),
          main.dirty === true
            ? react.createElement('button', {
              type: 'button',
              style: styles.button,
              onClick: reset
            }, t.reset)
            : null
        )
      )
    }

    /** 挂载插件。 */
    function apply(ctx) {
      var slots = ctx.slots
      if (slots === undefined || slots === null) return

      ctx.effect(function () {
        return slots.inject(GHOST_SLOT, function () {
          return slots.register({ name: GHOST_SLOT, id: NS, order: 30 }, GhostSuggestion)
        })
      }, 'input-suggest: ghost overlay')

      ctx.effect(function () {
        return slots.inject(ACTIONS_SLOT, function () {
          return slots.register({ name: ACTIONS_SLOT, id: NS + '-actions', order: 30 }, SuggestionActions)
        })
      }, 'input-suggest: composer actions')

      // 设置页直接注册在根 ctx 上。
      //
      // 早先的写法是 ctx.inject(['configForms'], child => ...) 再在子 ctx 上注册：
      // 子 ctx 只有 configForms，没有 remote / remote.session，页面里的模型目录读取
      // 会在渲染期抛错，而 slots 的注册成功、导航项照常出现 —— 表现就是
      // 「设置里能看到『智能建议』，点进去一片空白」。
      // 顶层 inject 声明这三个服务，注册留在根 ctx，face 直接拿得到 remote。
      ctx.effect(function () {
        return slots.inject(SETTINGS_SLOT, function () {
          var scope = ctx.configForms.get(SETTINGS_NS)
          var face = { ctx: ctx, scopes: { main: scope } }
          return slots.register({
            name: SETTINGS_SLOT,
            id: SECTION_ID,
            order: SECTION_ORDER,
            label: function () { return copy().nav },
            inject: function () { return face }
          }, InputSuggestSettingsPage)
        })
      }, 'input-suggest: settings page')
    }

    exports.NS = NS
    exports.GHOST_SLOT = GHOST_SLOT
    exports.ACTIONS_SLOT = ACTIONS_SLOT
    exports.SETTINGS_NS = SETTINGS_NS
    exports.apply = apply
    // 顶层依赖：设置页要读模型目录，缺 remote 会在渲染期抛错（导航项在、内容空白）。
    exports.inject = ['slots', 'configForms', 'remote', 'remote.session']
    exports.GhostSuggestion = GhostSuggestion
    exports.SuggestionActions = SuggestionActions
    exports.InputSuggestSettingsPage = InputSuggestSettingsPage
    exports.__internals = {
      isChinese: isChinese,
      copy: copy,
      parseAcceptKey: parseAcceptKey,
      encodeKey: encodeKey,
      isSuggestion: isSuggestion,
      currentSuggestion: currentSuggestion,
      suggestionIdentity: suggestionIdentity,
      insertSuggestionText: insertSuggestionText,
      acceptSuggestion: acceptSuggestion,
      dismissSuggestion: dismissSuggestion,
      observeAcceptance: observeAcceptance,
      reportFeedbackEvent: reportFeedbackEvent,
      requestGeneration: requestGeneration,
      requestIfIdle: requestIfIdle,
      normalizeMode: normalizeMode,
      normalizeContextLevel: normalizeContextLevel,
      normalizeSettings: normalizeSettings,
      settingsOps: settingsOps,
      normalizeDraftText: normalizeDraftText,
      isComposerEvent: isComposerEvent,
      viewVisible: viewVisible,
      reportOnce: reportOnce,
      resetFeedbackCapability: resetFeedbackCapability,
      /** 等队列里的反馈全部发完（自检用，避免跨用例串记录）。 */
      flushFeedback: function () { return feedbackChain },
      /** 停止所有轮询与计时器（自检收尾用，避免进程被定时器挂住）。 */
      disposeAll: function () {
        for (var record of accepted.values()) cancelAcceptanceTimer(record)
        accepted.clear()
        acceptViews.clear()
        for (var source of sources.values()) {
          clearInterval(source.timer)
          source.generating?.abort?.()
          source.generating = null
          source.listeners.length = 0
          source.controller.abort()
        }
        sources.clear()
      },
      settleAcceptance: settleAcceptance,
      cancelAcceptance: cancelAcceptance,
      /** 测试用：直接观察采纳跟踪与去重表，不需要等真实计时器。 */
      state: { accepted: accepted, acceptViews: acceptViews, reported: reported, sources: sources },
      formatRate: formatRate,
      formatMilliseconds: formatMilliseconds,
      ghostOwner: ghostOwner,
      claimGhostView: claimGhostView,
      rememberSuggestion: rememberSuggestion,
      // 供自检直接驱动共享源，验证「两个订阅者都收到广播」。
      sourceOf: sourceOf,
      publishSource: publishSource,
      presetText: presetText
    }
    return module.exports
  }
})

