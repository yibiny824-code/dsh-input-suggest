
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
    var GENERATE_PATH = '/api/input-suggest/generate'
    var POLL_MS = 900
    var REQUEST_TIMEOUT_MS = 90000
    /** 提示文字在工具栏上停留多久后自动消失。 */
    var NOTICE_TTL_MS = 4000


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
        templateHelp: '可用占位符：{{instructions}} {{style}} {{memory}} {{examples}} {{language}} {{detail}} {{maxChars}}。留空使用内置模板；删掉 {{instructions}} 时会自动补回内置约束。',
        templatePlaceholder: '留空 = 使用内置模板',
        templateMemory: '在模板里注入本地画像',
        templateExamples: '注入最近采纳的建议作为示例',
        memoryTitle: '记忆与隐私',
        memoryHelp: '画像只保存在本机插件存储里：采纳率、平均长度、语言与常用开头词，不含对话正文。',
        learn: '持续学习我的使用习惯',
        allowRemote: '允许把上下文发送到非本机端点',
        allowRemoteHelp: '默认关闭：只把上下文发给 loopback（本机）地址。打开后会把最近一轮对话（已脱敏）发给远端模型。',
        on: '开启'
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
        templateHelp: 'Placeholders: {{instructions}} {{style}} {{memory}} {{examples}} {{language}} {{detail}} {{maxChars}}. Empty uses the built-in template; dropping {{instructions}} re-adds the built-in constraints.',
        templatePlaceholder: 'Empty = built-in template',
        templateMemory: 'Inject the local profile',
        templateExamples: 'Inject recently accepted suggestions',
        memoryTitle: 'Memory and privacy',
        memoryHelp: 'The profile stays on this machine: acceptance rate, average length, language and leading words. No conversation text is stored.',
        learn: 'Keep learning my habits',
        allowRemote: 'Allow sending context to non-loopback endpoints',
        allowRemoteHelp: 'Off by default: context only goes to loopback. Turning it on sends the last turn (redacted) to a remote model.',
        on: 'On'
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

    /** 校验一条建议的形状。 */
    function isSuggestion(value) {
      if (value === null || typeof value !== 'object') return false
      return typeof value.text === 'string' && value.text.trim() !== ''
        && Number.isSafeInteger(value.turn) && value.turn >= 0
        && typeof value.truncated === 'boolean'
    }

    /** 读宿主存好的建议；任何失败都回答 null。 */
    async function fetchSuggestion(sessionId, signal) {
      try {
        var response = await fetch(GET_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId }),
          signal: signal,
          cache: 'no-store'
        })
        if (response.ok !== true) return null
        var body = await response.json()
        if (body === null || typeof body !== 'object' || !('suggestion' in body)) return null
        return isSuggestion(body.suggestion) ? body.suggestion : null
      } catch (error) {
        warnOnce('input-suggest: read failed (' + String(error) + ')')
        return null
      }
    }

    /** 显式请求一次重新生成。 */
    async function requestGeneration(sessionId, signal) {
    /**
     * 把「用户实际发出的文本」报给宿主做隐式学习。
     * 静默失败：学习永远不该干扰发消息。
     */
    async function reportFeedback(sessionId, text, rejected) {
      try {
        await fetch(FEEDBACK_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, text: text, rejected: rejected === true }),
          cache: 'no-store',
        })
      } catch {
        // 学习是尽力而为。
      }
    }

      try {
        var response = await fetch(GENERATE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId }),
          signal: signal,
          cache: 'no-store'
        })
        var body = await response.json()
        if (body === null || typeof body !== 'object' || !('status' in body)) return { status: 'error', suggestion: null }
        if (body.status === 'generated' && isSuggestion(body.suggestion)) return { status: 'generated', suggestion: body.suggestion }
        if (body.status === 'empty' || body.status === 'no-context' || body.status === 'busy') return { status: body.status, suggestion: null }
        return { status: 'error', suggestion: null }
      } catch (error) {
        return { status: 'error', suggestion: null }
      }
    }

    /** 两条建议是否等价。 */
    function sameSuggestion(left, right) {
      if (left === null || right === null) return left === right
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

    function sourceOf(sessionId) {
      var existing = sources.get(sessionId)
      if (existing !== undefined) return existing
      var source = {
        sessionId: sessionId,
        value: null,
        listeners: [],
        pending: false,
        timer: undefined,
        controller: new AbortController()
      }
      sources.set(sessionId, source)
      var read = function () {
        if (source.pending) return
        source.pending = true
        void fetchSuggestion(sessionId, source.controller.signal).then(function (next) {
          source.pending = false
          if (source.value !== null && sameSuggestion(source.value, next)) return
          source.value = next
          var listeners = source.listeners.slice()
          for (var index = 0; index < listeners.length; index += 1) listeners[index]()
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
      source.controller.abort()
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
      return {
        suggestion: suggestion,
        refresh: function () {
          if (source === null) return
          if (source.value !== null) return
          setVersion(function (count) { return count + 1 })
        },
        remember: function (next) {
          if (source === null) return
          source.value = next
          setVersion(function (count) { return count + 1 })
        }
      }
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
      var draft = useInput(function (state) { return state.draft })
      var phase = useInput(function (state) { return state.phase })

      var suggestion = source.suggestion
      var text = phase === undefined || phase === 'plain'
        ? currentSuggestion(suggestion, running, draft)
        : undefined

      var acceptSpec = suggestion !== null && suggestion !== undefined && typeof suggestion.acceptKey === 'string'
        ? suggestion.acceptKey
        : 'Tab'
      var matcher = react.useMemo(function () { return parseAcceptKey(acceptSpec) }, [acceptSpec])

      useGhostStyles()

      // 采纳：只在输入框里、且正在显示建议时拦截；否则按键保持原生行为。
      react.useEffect(function () {
        if (text === undefined) return undefined
        var onKeyDown = function (event) {
          if (event.isComposing === true) return
          if (matcher === undefined) return
          if (matcher(event) !== true) return
          if (isComposerFocused() !== true) return
          event.preventDefault()
          inputActions.setDraft(text)
        }
        window.addEventListener('keydown', onKeyDown)
        return function () { window.removeEventListener('keydown', onKeyDown) }
      }, [text, matcher, inputActions])

      // 隐式学习：上一条建议还在展示时，用户自己把草稿写成了一段话，
      // 说明他放弃了建议（或者自己写得更好）。报一次后停止观察这一条。
      var pending = react.useRef(null)
      react.useEffect(function () {
        if (suggestion !== null && suggestion !== undefined) pending.current = suggestion.text
      }, [suggestion])
      react.useEffect(function () {
        if (typeof draft !== 'string' || draft.trim() === '') return
        var open = pending.current
        if (open === null || open === undefined) return
        pending.current = null
        void reportFeedback(sessionId, draft.trim(), false)
      }, [draft, sessionId])

      if (text === undefined) return null
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
      var busy = result !== null && result.sessionId === sessionId && result.busy === true
      var notice = result !== null && result.sessionId === sessionId ? result.notice : null

      /** 采纳：只写草稿，绝不提交。 */
      var accept = function () {
        if (suggestion === null || suggestion === undefined) return
        if (editable !== true) return
        inputActions.setDraft(suggestion.text)
      }

      /** 重随：显式再生成一次。 */
      var reroll = function () {
        if (busy === true || request.current !== null) return
        if (typeof AbortController !== 'function') return
        var controller = new AbortController()
        request.current = controller
        setResult({ sessionId: sessionId, busy: true, notice: null })
        var timer = setTimeout(function () { controller.abort() }, REQUEST_TIMEOUT_MS)
        void requestGeneration(sessionId, controller.signal).then(function (response) {
          if (request.current !== controller) return
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
                  : t.failed
          })
        }).finally(function () {
          clearTimeout(timer)
          if (request.current === controller) request.current = null
        })
      }

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
      children.push(react.createElement('button', {
        key: 'reroll',
        type: 'button',
        className: 'dsh-input-suggest-action',
        title: busy === true ? t.generating : t.regenerate,
        'aria-label': busy === true ? t.generating : t.regenerate,
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
      link: { padding: 0, border: 'none', background: 'none', color: 'inherit', opacity: 0.7, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }
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
      var scopes = props.scopes

      var main = useSection(
        scopes.main,
        function (value) {
          var source = value !== null && value !== undefined ? value : {}
          return {
            enabled: source.enabled !== false,
            provider: str(source.provider),
            model: str(source.model),
            reasoningEffort: str(source.reasoningEffort),
            acceptKey: str(source.acceptKey) || 'Tab',
            maxSuggestionChars: String(source.maxSuggestionChars !== undefined ? source.maxSuggestionChars : 240),
            style: str(source.style),
            detailLevel: str(source.detailLevel) || 'standard',
            template: str(source.template),
            useMemory: source.useMemory !== false,
            useExamples: source.useExamples !== false,
            learn: source.learn !== false,
            allowRemote: source.allowRemote === true
          }
        },
        function (draft, live) {
          var ops = []
          if (draft.enabled !== live.enabled) ops.push({ op: 'set', path: ['enabled'], value: draft.enabled === true })
          var flags = ['useMemory', 'useExamples', 'learn', 'allowRemote']
          for (var flagIndex = 0; flagIndex < flags.length; flagIndex += 1) {
            var flag = flags[flagIndex]
            if (draft[flag] !== live[flag]) ops.push({ op: 'set', path: [flag], value: draft[flag] === true })
          }
          if (draft.detailLevel !== live.detailLevel) ops.push({ op: 'set', path: ['detailLevel'], value: draft.detailLevel })
          var textFields = ['provider', 'model', 'reasoningEffort', 'style', 'template']
          for (var index = 0; index < textFields.length; index += 1) {
            var field = textFields[index]
            if (draft[field] === live[field]) continue
            ops.push(draft[field] === '' ? { op: 'unset', path: [field] } : { op: 'set', path: [field], value: draft[field] })
          }
          if (draft.acceptKey !== live.acceptKey && draft.acceptKey !== '') {
            ops.push({ op: 'set', path: ['acceptKey'], value: draft.acceptKey })
          }
          if (draft.maxSuggestionChars !== live.maxSuggestionChars) {
            var chars = Number(draft.maxSuggestionChars)
            if (Number.isSafeInteger(chars) && chars >= 1) ops.push({ op: 'set', path: ['maxSuggestionChars'], value: chars })
          }
          return ops
        }
      )

      var setField = function (field, value) {
        var patch = {}
        patch[field] = value
        main.edit(patch)
      }

      var reset = function () {
        main.reset(main.current)
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
          })
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
          react.createElement('div', { style: styles.help }, t.allowRemoteHelp)
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
      currentSuggestion: currentSuggestion
    }
    return module.exports
  }
})

