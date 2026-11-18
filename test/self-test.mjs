/**
 * dsh-input-suggest 自检：不开浏览器、不连 Host。
 *
 *   1. 浏览器半区：模块形状、插槽注册、快捷键解析、幽灵文字条件。
 *   2. 宿主半区：配置归一、脱敏、清洗、语义过滤、提示词拼装、路由解析、存储往返。
 *
 * 用法：node test/self-test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

let passed = 0
const failures = []

function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log('  ok   ' + label)
  } catch (error) {
    failures.push(label)
    console.log('  FAIL ' + label + '\n       ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 浏览器半区

let loaded
const styleTags = []
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      loaded = definition
    },
  },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  head: { appendChild: (tag) => styleTags.push(tag) },
  getElementById: (id) => styleTags.find((tag) => tag.id === id) ?? null,
  createElement: (type) => ({ type, id: '', textContent: '' }),
  activeElement: null,
}
globalThis.HTMLElement = class HTMLElement {}
globalThis.HTMLTextAreaElement = class HTMLTextAreaElement extends globalThis.HTMLElement {}

const clientSource = readFileSync(join(root, 'client.js'), 'utf8')
new Function(clientSource)()

assert.equal(loaded?.id, 'dsh-input-suggest', 'client module id')

/** 收集每次渲染注册的清理函数，测试结束统一执行，避免定时器把进程挂住。 */
const effectCleanups = []

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  // 真实 React 会执行 effect 并保留返回的清理函数；桩也要这样做，否则
  // 组件里的定时器/订阅永远不会被释放（测试进程会挂住）。
  useEffect: (effect) => {
    const cleanup = effect()
    if (typeof cleanup === 'function') effectCleanups.push(cleanup)
  },
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
}
const requireStub = (id) => {
  if (id === 'react') return reactStub
  throw new Error('unexpected require: ' + id)
}
const exportsObject = loaded.factory(requireStub)

check('exports the documented surface', () => {
  assert.equal(exportsObject.NS, 'dsh-input-suggest')
  assert.equal(exportsObject.SETTINGS_NS, 'input-suggest')
  assert.equal(typeof exportsObject.apply, 'function')
  // 设置页要读模型目录与配置表单，两者都必须进顶层 inject。
  assert.deepEqual(exportsObject.inject, ['slots', 'configForms', 'remote', 'remote.session'])
})


check('parseAcceptKey defaults to Tab without modifiers', () => {
  const matcher = exportsObject.__internals.parseAcceptKey('Tab')
  assert.equal(matcher({ code: 'Tab', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }), true)
  assert.equal(matcher({ code: 'Tab', altKey: false, ctrlKey: false, metaKey: false, shiftKey: true }), false)
  assert.equal(matcher({ code: 'Enter', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }), false)
})

check('parseAcceptKey handles modifier combinations and aliases', () => {
  const altSlash = exportsObject.__internals.parseAcceptKey('Alt+/')
  assert.equal(altSlash({ code: 'Slash', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }), true)
  assert.equal(altSlash({ code: 'Slash', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }), false)
  const ctrlAltX = exportsObject.__internals.parseAcceptKey('ctrl+alt+x')
  assert.equal(ctrlAltX({ code: 'KeyX', altKey: true, ctrlKey: true, metaKey: false, shiftKey: false }), true)
  assert.equal(exportsObject.__internals.parseAcceptKey('nonsense'), undefined)
})

check('encodeKey round-trips through parseAcceptKey', () => {
  const spec = exportsObject.__internals.encodeKey('Slash', { alt: true })
  assert.equal(spec, 'Alt+Slash')
  const matcher = exportsObject.__internals.parseAcceptKey(spec)
  assert.equal(matcher({ code: 'Slash', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }), true)
  assert.equal(exportsObject.__internals.encodeKey('ShiftLeft', { shift: true }), undefined)
})

check('publishing a new suggestion notifies every subscriber', () => {
  // 回归：输入框与工具栏各有一份独立订阅。早先 remember() 只更新调用者自己的
  // React state，另一方停在旧建议上 —— 用户点重随后看到的画面没有变化。
  const internals = exportsObject.__internals
  const source = internals.sourceOf('s-share-' + String(Math.random()))
  let overlayHits = 0
  let actionsHits = 0
  source.listeners.push(() => { overlayHits += 1 })
  source.listeners.push(() => { actionsHits += 1 })
  source.value = { turn: 2, text: 'new', truncated: false, acceptKey: 'Tab' }
  internals.publishSource(source)
  assert.equal(overlayHits, 1, 'the ghost overlay must be notified')
  assert.equal(actionsHits, 1, 'the toolbar must be notified too')
  assert.equal(source.value.text, 'new')
  // 清理轮询，避免测试进程挂住。
  for (const listener of source.listeners.slice()) source.listeners.pop()
  source.controller.abort()
  clearInterval(source.timer)
  internals.releaseSource?.(source)
})

check('the composer exposes a manual summon control next to reroll', () => {
  const { SuggestionActions } = exportsObject
  const scope = { getSnapshot: () => ({ status: 'ready', value: {}, writable: true, revision: 1 }), subscribe: () => () => {}, mutate: async () => {} }
  const tree = SuggestionActions({
    sessionId: 's-manual',
    useSession: (select) => select({ running: false }),
    useInput: (select) => select({ draft: '', phase: 'plain' }),
    inputActions: { setDraft: () => {} },
  })
  // createElement('span', ..., children, notice) 会把整个数组作为第一个子节点，
  // 断言前先展平。
  const flat = tree.children.flat(2).filter((child) => child !== null && child !== undefined)
  const props = flat.map((child) => (child !== null && typeof child === 'object' ? child.props ?? {} : {}))
  assert.ok(props.some((p) => p['data-input-suggest-summon'] !== undefined), 'expected a summon button')
  assert.ok(props.some((p) => p['data-input-suggest-reroll'] !== undefined), 'expected the reroll button')
})

check('the summon control disappears while the session is running', () => {
  const { SuggestionActions } = exportsObject
  const tree = SuggestionActions({
    sessionId: 's-busy',
    useSession: (select) => select({ running: true }),
    useInput: (select) => select({ draft: '', phase: 'plain' }),
    inputActions: { setDraft: () => {} },
  })
  const flat = tree.children.flat(2).filter((c) => c !== null && c !== undefined)
  const props = flat.map((c) => (c !== null && typeof c === 'object' ? c.props ?? {} : {}))
  assert.equal(props.some((p) => p['data-input-suggest-summon'] !== undefined), false)
})

check('ghost text requires an idle session and an empty draft', () => {
  const currentSuggestion = exportsObject.__internals.currentSuggestion
  const suggestion = { turn: 3, text: 'run the tests', truncated: false }
  assert.equal(currentSuggestion(suggestion, false, ''), 'run the tests')
  assert.equal(currentSuggestion(suggestion, true, ''), undefined)
  assert.equal(currentSuggestion(suggestion, false, 'typed'), undefined)
  assert.equal(currentSuggestion(null, false, ''), undefined)
})

check('apply registers the ghost overlay and the composer actions', () => {
  const registered = []
  const scope = { getSnapshot: () => ({ status: 'ready', value: {}, writable: true, revision: 1 }), subscribe: () => () => {}, mutate: async () => {} }
  const ctx = {
    effect: (fn) => fn(),
    configForms: { get: () => scope },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [] } }) }, $on: () => () => {} },
    slots: {
      inject: (name, fn) => fn(),
      register: (spec, component) => {
        registered.push({ spec, component })
        return () => {}
      },
    },
  }
  exportsObject.apply(ctx)
  const names = registered.map((entry) => entry.spec.name)
  assert.deepEqual(names, [
    'conversation.input.overlay',
    'conversation.input.right',
    'settings.section',
  ])
})

check('the ghost overlay renders nothing while the session is running', () => {
  let registered
  const scope = { getSnapshot: () => ({ status: 'ready', value: {}, writable: true, revision: 1 }), subscribe: () => () => {}, mutate: async () => {} }
  const ctx = {
    effect: (fn) => fn(),
    configForms: { get: () => scope },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [] } }) }, $on: () => () => {} },
    slots: {
      inject: (name, fn) => fn(),
      register: (spec, component) => {
        if (spec.name === 'conversation.input.overlay') registered = component
        return () => {}
      },
    },
  }
  exportsObject.apply(ctx)
  // 直接调用组件：会话运行中 / 草稿非空都必须渲染 null。
  const element = registered({
    sessionId: 's-1',
    useSession: (select) => select({ running: true }),
    useInput: (select) => select({ draft: '', phase: 'plain' }),
    inputActions: { setDraft: () => {} },
  })
  assert.equal(element, null)
})

check('the settings page renders even when the config scope is unavailable', () => {
  const Page = exportsObject.InputSuggestSettingsPage
  const cases = [
    { label: 'loading scope', scope: { getSnapshot: () => ({ status: 'loading', value: undefined, writable: false }), subscribe: () => () => {} } },
    { label: 'throwing getSnapshot', scope: { getSnapshot: () => { throw new Error('boom') }, subscribe: () => () => {} } },
    { label: 'missing scope', scope: undefined },
  ]
  for (const entry of cases) {
    const tree = Page({ ctx: { configForms: { get: () => entry.scope } }, scopes: { main: entry.scope } })
    assert.equal(tree.type, 'div', entry.label + ' must still render a root element')
    assert.ok(tree.children.length > 0, entry.label + ' must render content')
  }
})

check('the settings page survives a context without remote', () => {
  const Page = exportsObject.InputSuggestSettingsPage
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: { enabled: true } }), subscribe: () => () => {}, mutate: async () => {} }
  const tree = Page({ ctx: { configForms: { get: () => scope } }, scopes: { main: scope } })
  assert.equal(tree.type, 'div')
  assert.ok(tree.children.length > 0)
})

check('the client declares the services the settings page reads', () => {

check('preset labels follow the interface language and never render empty', () => {
  const internals = exportsObject.__internals
  const label = { zh: '方案 / 步骤', en: 'Plan / steps' }
  assert.equal(internals.presetText(label), '方案 / 步骤')
  assert.equal(internals.presetText('plain'), 'plain')
  assert.equal(internals.presetText(undefined), '')
  assert.equal(internals.presetText({ en: 'only english' }), 'only english')
})

check('the settings page renders without a preset catalog', () => {
  // 预设路由读不到时（宿主行未加载、旧版本），页面必须退化成只显示风格文本框。
  const Page = exportsObject.InputSuggestSettingsPage
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: {} }), subscribe: () => () => {}, mutate: async () => {} }
  const tree = Page({ ctx: { configForms: { get: () => scope } }, scopes: { main: scope } })
  assert.equal(tree.type, 'div')
  assert.ok(tree.children.filter((child) => child !== null).length >= 6, 'six sections expected')
})
  // 早期只声明 slots，设置页在渲染期读 remote 时抛错，表现为导航项在、内容空白。
  assert.deepEqual(exportsObject.inject, ['slots', 'configForms', 'remote', 'remote.session'])
})

check('apply registers the settings page when configForms is present', () => {
  const registered = []
  const scope = { getSnapshot: () => ({ status: 'ready', value: {}, writable: true, revision: 1 }), subscribe: () => () => {}, mutate: async () => {} }
  const ctx = {
    effect: (fn) => fn(),
    configForms: { get: (ns) => ({ ...scope, ns }) },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [] } }) }, $on: () => () => {} },
    slots: {
      inject: (name, fn) => fn(),
      register: (spec, component) => {
        registered.push({ spec, component })
        return () => {}
      },
    },
  }
  exportsObject.apply(ctx)
  const settings = registered.find((entry) => entry.spec.name === 'settings.section')
  assert.ok(settings !== undefined, 'expected settings.section')
  assert.equal(settings.spec.id, 'input-suggest')
})


// 宿主半区

// 绝对路径导入宿主半区：宿主包由 DSH 安装提供，workspace 里不需要 node_modules。
const host = await import('file:///E:/DeepseekHarness/dsh-input-suggest/lib/index.js')

check('host exports the plugin identity and services', () => {
  assert.equal(host.name, 'input-suggest')
  assert.deepEqual(host.inject, ['llm', 'sessions', 'connection'])
  assert.equal(typeof host.apply, 'function')
})

check('resolveConfig unwraps volatile references and clamps numbers', () => {
  const resolved = host.resolveConfig({
    enabled: { get: () => false },
    provider: { get: () => ' opencodex ' },
    model: { get: () => 'glm-5.3' },
    reasoningEffort: { get: () => '' },
    style: { get: () => '' },
    acceptKey: { get: () => '' },
    maxSuggestionChars: { get: () => 0 },
    maxOutputTokens: 256,
    timeoutMs: 500,
    maxRecentTurns: 2,
    maxTranscriptChars: 900,
  })
  assert.equal(resolved.enabled, false)
  assert.equal(resolved.provider, 'opencodex')
  assert.equal(resolved.acceptKey, 'Tab')
  assert.equal(resolved.maxSuggestionChars, 240)
  assert.equal(resolved.timeoutMs, 60000)
})

check('redactSecrets masks credential shapes', () => {
  const redacted = host.redactSecrets('key sk-abcdefghijklmnopqrstuvwx and AKIAABCDEFGHIJKLMNOP end')
  assert.match(redacted, /<secret-token>/)
  assert.match(redacted, /<aws-access-key-id>/)
  assert.doesNotMatch(redacted, /sk-abcdefghijklmnopqrstuvwx/)
})

check('cleanSuggestion strips fences, quotes and control codes', () => {
  assert.equal(host.cleanSuggestion('  "run the tests"\n'.trim()), 'run the tests')
  assert.equal(host.cleanSuggestion('\u001b[31mcommit it\u001b[0m'), 'commit it')
})

check('sanitizeSuggestion truncates on visible characters', () => {
  assert.deepEqual(host.sanitizeSuggestion('abcdef', 3), { text: 'abc', truncated: true })
  assert.deepEqual(host.sanitizeSuggestion('ab', 3), { text: 'ab', truncated: false })
})

check('shouldFilterSuggestion drops pleasantries, questions and multi-sentence text', () => {
  assert.equal(host.shouldFilterSuggestion('thanks'), true)
  assert.equal(host.shouldFilterSuggestion('looks good'), true)
  assert.equal(host.shouldFilterSuggestion('Let me check'), true)
  assert.equal(host.shouldFilterSuggestion('what about the tests?'), true)
  assert.equal(host.shouldFilterSuggestion('run tests. then commit.'), true)
  assert.equal(host.shouldFilterSuggestion('run the tests'), false)
})

check('buildSystemPrompt appends the custom style block', () => {
  const plain = host.buildSystemPrompt(240, 'English')
  assert.doesNotMatch(plain, /USER STYLE/)
  const styled = host.buildSystemPrompt(240, 'English', 'prefer short imperative English')
  assert.match(styled, /USER STYLE \/ PREFERENCES/)
  assert.match(styled, /prefer short imperative English/)
  assert.match(styled, /At most 240 visible characters/)
})

check('buildPairs keeps only human user messages and the newest window', () => {
  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'workspace instructions' }], source: { kind: 'agent-instructions' } },
    { role: 'user', content: [{ type: 'text', text: 'fix the bug' }], source: { kind: 'user' } },
    { role: 'assistant', content: [{ type: 'text', text: 'fixed it' }], source: { kind: 'model' } },
    { role: 'user', content: [{ type: 'text', text: 'run tests' }], source: { kind: 'user' } },
    { role: 'assistant', content: [{ type: 'text', text: 'tests pass' }], source: { kind: 'model' } },
  ]
  const pairs = host.buildPairs(messages, 1, 1000)
  assert.deepEqual(pairs.map((pair) => pair.role), ['user', 'assistant'])
  assert.equal(pairs[0].text, 'run tests')
})

check('buildPairs respects the character budget', () => {
  const long = 'x'.repeat(500)
  const messages = [
    { role: 'user', content: [{ type: 'text', text: long }], source: { kind: 'user' } },
    { role: 'assistant', content: [{ type: 'text', text: long }], source: { kind: 'model' } },
  ]
  const pairs = host.buildPairs(messages, 2, 100)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].role, 'assistant')
})

check('suggestionLanguage follows the latest user message', () => {
  assert.equal(host.suggestionLanguage([{ role: 'user', text: 'please fix this' }]), 'English')
  assert.equal(host.suggestionLanguage([{ role: 'user', text: '\u5e2e\u6211\u4fee\u590d\u8fd9\u4e2a\u95ee\u9898' }]), '\u7b80\u4f53\u4e2d\u6587')
})

check('routeOf prefers configured values and falls back to the session route', () => {
  const config = { provider: '', model: '' }
  assert.deepEqual(host.routeOf({ config: { provider: 'opencodex', model: 'glm-5.3' } }, config), { provider: 'opencodex', model: 'glm-5.3' })
  assert.deepEqual(
    host.routeOf({ config: { provider: 'opencodex', model: 'glm-5.3' } }, { provider: 'other', model: '' }),
    { provider: 'other', model: 'glm-5.3' },
  )
  assert.equal(host.routeOf(undefined, config), undefined)
})

check('stored records round-trip through the domain schema', () => {
  const suggestion = { turn: 2, text: 'commit it', truncated: false, acceptKey: 'Tab', route: { provider: 'p', model: 'm' }, style: 'brief' }
  const record = host.toStoredRecord(suggestion)
  assert.deepEqual(host.toSuggestion(record), suggestion)
  assert.equal(host.toSuggestion({ version: 1, turn: 1, text: '', truncated: false, acceptKey: 'Tab' }), undefined)
})

/** 渲染期间注册的定时器可能真实存在；统一清理，保证测试进程能退出。 */
for (const cleanup of effectCleanups) {
  try {
    cleanup()
  } catch {
    // 清理失败不影响断言结果。
  }
}

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

