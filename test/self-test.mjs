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

async function check(label, fn) {
  try {
    await fn()
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
/** 记录 fetch 调用：传输契约的断言全部看这里。 */
const fetchCalls = []
let fetchImpl = async () => new Response(JSON.stringify({ suggestion: null }), { status: 200 })

globalThis.fetch = async (path, init) => {
  const call = { path, init, body: init?.body !== undefined ? JSON.parse(String(init.body)) : undefined }
  fetchCalls.push(call)
  return fetchImpl(path, call)
}
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      loaded = definition
    },
  },
  addEventListener(type, fn) { windowListeners.push({ type, fn }) },
  removeEventListener(type, fn) {
    const at = windowListeners.findIndex((entry) => entry.type === type && entry.fn === fn)
    if (at >= 0) windowListeners.splice(at, 1)
  },
}
const windowListeners = []
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  head: { appendChild: (tag) => styleTags.push(tag) },
  getElementById: (id) => styleTags.find((tag) => tag.id === id) ?? null,
  createElement: (type) => ({ type, id: '', textContent: '' }),
  activeElement: null,
  visibilityState: 'visible',
}
globalThis.HTMLElement = class HTMLElement {}
globalThis.HTMLTextAreaElement = class HTMLTextAreaElement extends globalThis.HTMLElement {}
globalThis.location = { hostname: '127.0.0.1' }

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

await check('exports the documented surface', () => {
  assert.equal(exportsObject.NS, 'dsh-input-suggest')
  assert.equal(exportsObject.SETTINGS_NS, 'input-suggest')
  assert.equal(typeof exportsObject.apply, 'function')
  // 设置页要读模型目录与配置表单，两者都必须进顶层 inject。
  assert.deepEqual(exportsObject.inject, ['slots', 'configForms', 'remote', 'remote.session'])
})


await check('parseAcceptKey defaults to Tab without modifiers', () => {
  const matcher = exportsObject.__internals.parseAcceptKey('Tab')
  assert.equal(matcher({ code: 'Tab', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }), true)
  assert.equal(matcher({ code: 'Tab', altKey: false, ctrlKey: false, metaKey: false, shiftKey: true }), false)
  assert.equal(matcher({ code: 'Enter', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }), false)
})

await check('parseAcceptKey handles modifier combinations and aliases', () => {
  const altSlash = exportsObject.__internals.parseAcceptKey('Alt+/')
  assert.equal(altSlash({ code: 'Slash', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }), true)
  assert.equal(altSlash({ code: 'Slash', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }), false)
  const ctrlAltX = exportsObject.__internals.parseAcceptKey('ctrl+alt+x')
  assert.equal(ctrlAltX({ code: 'KeyX', altKey: true, ctrlKey: true, metaKey: false, shiftKey: false }), true)
  assert.equal(exportsObject.__internals.parseAcceptKey('nonsense'), undefined)
})

await check('encodeKey round-trips through parseAcceptKey', () => {
  const spec = exportsObject.__internals.encodeKey('Slash', { alt: true })
  assert.equal(spec, 'Alt+Slash')
  const matcher = exportsObject.__internals.parseAcceptKey(spec)
  assert.equal(matcher({ code: 'Slash', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }), true)
  assert.equal(exportsObject.__internals.encodeKey('ShiftLeft', { shift: true }), undefined)
})

await check('publishing a new suggestion notifies every subscriber', () => {
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

await check('the composer exposes a manual summon control next to reroll', () => {
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

await check('the summon control disappears while the session is running', () => {
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

await check('ghost text requires an idle session and an empty draft', () => {
  const currentSuggestion = exportsObject.__internals.currentSuggestion
  const suggestion = { turn: 3, text: 'run the tests', truncated: false }
  assert.equal(currentSuggestion(suggestion, false, ''), 'run the tests')
  assert.equal(currentSuggestion(suggestion, true, ''), undefined)
  assert.equal(currentSuggestion(suggestion, false, 'typed'), undefined)
  assert.equal(currentSuggestion(null, false, ''), undefined)
})

await check('apply registers the ghost overlay and the composer actions', () => {
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

await check('the ghost overlay renders nothing while the session is running', () => {
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

await check('the settings page renders even when the config scope is unavailable', () => {
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

await check('the settings page survives a context without remote', () => {
  const Page = exportsObject.InputSuggestSettingsPage
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: { enabled: true } }), subscribe: () => () => {}, mutate: async () => {} }
  const tree = Page({ ctx: { configForms: { get: () => scope } }, scopes: { main: scope } })
  assert.equal(tree.type, 'div')
  assert.ok(tree.children.length > 0)
})

await check('preset labels follow the interface language and never render empty', () => {
  const internals = exportsObject.__internals
  const label = { zh: '方案 / 步骤', en: 'Plan / steps' }
  assert.equal(internals.presetText(label), '方案 / 步骤')
  assert.equal(internals.presetText('plain'), 'plain')
  assert.equal(internals.presetText(undefined), '')
  assert.equal(internals.presetText({ en: 'only english' }), 'only english')
})

await check('the settings page renders without a preset catalog', () => {
  // 预设路由读不到时（宿主行未加载、旧版本），页面必须退化成只显示风格文本框。
  const Page = exportsObject.InputSuggestSettingsPage
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: {} }), subscribe: () => () => {}, mutate: async () => {} }
  const tree = Page({ ctx: { configForms: { get: () => scope } }, scopes: { main: scope } })
  assert.equal(tree.type, 'div')
  assert.ok(tree.children.filter((child) => child !== null).length >= 6, 'six sections expected')
})

await check('the client declares the services the settings page reads', () => {
  // 早期只声明 slots，设置页在渲染期读 remote 时抛错，表现为导航项在、内容空白。
  assert.deepEqual(exportsObject.inject, ['slots', 'configForms', 'remote', 'remote.session'])
})

await check('the settings page offers the style preset control', () => {
  // 预设必须出现在设置页上，否则用户只能改模板 —— 那对「想要方案类输入」的人太贵。
  const Page = exportsObject.InputSuggestSettingsPage
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: { stylePreset: 'plan' } }), subscribe: () => () => {}, mutate: async () => {} }
  const tree = Page({ ctx: { configForms: { get: () => scope } }, scopes: { main: scope } })
  const texts = []
  const walk = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
    if (Array.isArray(node)) { for (const child of node) walk(child); return }
    if (typeof node === 'object') { walk(node.children); return }
  }
  walk(tree)
  const copy = exportsObject.__internals.copy()
  assert.ok(texts.includes(copy.presetTitle), 'the preset section must be rendered')
  assert.ok(texts.includes(copy.presetHint), 'the plan / theory hint must be shown')
})

await check('apply registers the settings page when configForms is present', () => {
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



// 浏览器半区：反馈、采纳、单实例幽灵文字

const internals = exportsObject.__internals
const NUL = String.fromCharCode(0)

/** 每条用例前清空传输记录。 */
async function resetFetch(handler) {
  await internals.flushFeedback()
  fetchCalls.length = 0
  fetchImpl = handler ?? (async (path) => {
    if (path.endsWith('/usage')) {
      return new Response(JSON.stringify({ usage: { calls: 0 }, feedback: { shown: 0 } }), { status: 200 })
    }
    return new Response(JSON.stringify({ suggestion: null }), { status: 200 })
  })
}

function feedbackEvents() {
  return fetchCalls
    .filter((call) => call.path.endsWith('/feedback'))
    .map((call) => call.body.event)
}

function suggestionOf(id, text) {
  return { id, turn: 4, text, truncated: false, acceptKey: 'Tab' }
}

await check('suggestion identity prefers the host id and stays stable without one', () => {
  assert.equal(internals.suggestionIdentity({ id: 'host-1', turn: 3, text: 'a', truncated: false }), 'host-1')
  const first = internals.suggestionIdentity({ turn: 3, text: 'run the tests', truncated: false })
  const second = internals.suggestionIdentity({ turn: 3, text: 'run the tests', truncated: false })
  assert.equal(first, second)
  assert.notEqual(first, internals.suggestionIdentity({ turn: 3, text: 'run tests', truncated: false }))
  assert.equal(internals.suggestionIdentity(null), '')
})

await check('a suggestion carrying an empty id is rejected as malformed', () => {
  assert.equal(internals.isSuggestion({ id: '', turn: 1, text: 'x', truncated: false }), false)
  assert.equal(internals.isSuggestion({ turn: 1, text: 'x', truncated: false }), true)
  assert.equal(internals.isSuggestion({ id: 'a', turn: 1, text: 'x', truncated: false }), true)
})

await check('accept inserts through the revision-guarded span', async () => {
  await internals.flushFeedback()
  const calls = []
  const actions = {
    captureInsertion: () => ({ draftRev: 7 }),
    insertText: (text, span) => { calls.push({ text, span }); return true },
    setDraft: () => { throw new Error('setDraft must not replace the guarded insert') },
  }
  assert.equal(internals.insertSuggestionText(actions, 'run the tests', 7), true)
  assert.deepEqual(calls, [{ text: 'run the tests', span: { draftRev: 7 } }])
})

await check('a draft revision that moved past the render rejects the insertion', () => {
  // 用户在两次渲染之间敲了字：实时修订号已经是 9，而界面还停在 7。
  const stale = {
    captureInsertion: () => ({ draftRev: 9 }),
    insertText: () => { throw new Error('must not insert on a stale render') },
    setDraft: () => { throw new Error('must not clobber the draft') },
  }
  assert.equal(internals.insertSuggestionText(stale, 'run the tests', 7), false)
  // 编辑器自己的 CAS 也要挡住：span 与渲染一致，但插入返回 false。
  const raced = {
    captureInsertion: () => ({ draftRev: 7 }),
    insertText: () => false,
    setDraft: () => { throw new Error('must not clobber the draft') },
  }
  assert.equal(internals.insertSuggestionText(raced, 'run the tests', 7), false)
})

await check('insertion falls back to setDraft only when the host has no span API', () => {
  const written = []
  const actions = { setDraft: (text) => written.push(text) }
  assert.equal(internals.insertSuggestionText(actions, 'commit it', 3), true)
  assert.deepEqual(written, ['commit it'])
  assert.equal(internals.insertSuggestionText({}, 'commit it', 3), false)
})

await check('accepting reports accepted once and mutes the ghost locally', async () => {
  await resetFetch()
  internals.resetFeedbackCapability()
  const sessionId = 's-accept-fb-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-2', 'check the failing test')
  source.value = suggestion
  const writes = []
  const actions = {
    captureInsertion: () => ({ draftRev: 1 }),
    insertText: (text) => { writes.push(text); return true },
  }
  assert.equal(internals.acceptSuggestion(sessionId, source, suggestion, actions, 1), true)
  assert.equal(internals.acceptSuggestion(sessionId, source, suggestion, actions, 1), true)
  assert.deepEqual(writes, ['check the failing test', 'check the failing test'])
  assert.equal(source.value, null, 'the accepted suggestion must disappear at once')
  // 两个视图各按一次，只上报一次 accepted。
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-2' + NUL + 'accepted'), true)
  await internals.reportOnce(sessionId, 'sg-2', 'shown')
  const events = fetchCalls.filter((call) => call.path.endsWith('/feedback')).map((call) => call.body.event)
  assert.deepEqual(events, ['accepted', 'shown'], 'the accepted event must reach an event-aware host')
  const sent = fetchCalls.filter((call) => call.path.endsWith('/feedback')).map((call) => call.body)
  assert.ok(sent.every((body) => !('text' in body)), 'the draft is never transmitted')
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a rejected insertion never reports acceptance', async () => {
  await resetFetch()
  const sessionId = 's-accept-blocked-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-3', 'refactor the loader')
  const actions = { captureInsertion: () => ({ draftRev: 2 }), insertText: () => false }
  assert.equal(internals.acceptSuggestion(sessionId, source, suggestion, actions, 2), false)
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-3' + NUL + 'accepted'), undefined)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('dismissing reports dismissed once and hides the line', async () => {
  await resetFetch()
  const sessionId = 's-dismiss-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-4', 'update the changelog')
  source.value = suggestion
  internals.dismissSuggestion(sessionId, source, suggestion)
  internals.dismissSuggestion(sessionId, source, suggestion)
  assert.equal(source.value, null)
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-4' + NUL + 'dismissed'), true)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a failed read keeps the suggestion instead of blanking it', async () => {
  await resetFetch(async () => { throw new Error('offline') })
  const sessionId = 's-stale-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  source.value = suggestionOf('sg-5', 'keep me')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(source.value.text, 'keep me')
  clearInterval(source.timer)
  source.controller.abort()
})

await check('an in-flight GET cannot overwrite a newer generation', async () => {
  const sessionId = 's-race-' + String(Math.random())
  let releaseRead = () => {}
  const readGate = new Promise((resolve) => { releaseRead = resolve })
  await resetFetch(async (path) => {
    if (path.endsWith('/get')) {
      // 让这次 GET 悬在半空，模拟「请求发出后宿主才返回新建议」。
      await readGate
      return new Response(JSON.stringify({ suggestion: suggestionOf('sg-old', 'stale line') }), { status: 200 })
    }
    return new Response(JSON.stringify({ usage: { calls: 0 }, feedback: { shown: 0 } }), { status: 200 })
  })
  const source = internals.sourceOf(sessionId)
  // 轮询已经发出（被闸住），此时重随拿到一条新建议并写进共享值。
  internals.rememberSuggestion(source, sessionId, suggestionOf('sg-new', 'fresh line'))
  releaseRead()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(source.value.id, 'sg-new', 'the newer generation must survive the stale read')
  clearInterval(source.timer)
  source.controller.abort()
})

await check('generation carries the trigger and the displayed id', async () => {
  await resetFetch(async () => new Response(JSON.stringify({ suggestion: null }), { status: 200 }))
  await internals.requestGeneration('s-gen', undefined, { trigger: 'manual', suggestionId: 'sg-6' })
  await internals.requestGeneration('s-gen', undefined, { trigger: 'idle' })
  await internals.requestGeneration('s-gen', undefined)
  const payloads = fetchCalls.filter((call) => call.path.endsWith('/generate')).map((call) => call.body)
  assert.deepEqual(payloads[0], { sessionId: 's-gen', trigger: 'manual', suggestionId: 'sg-6' })
  assert.deepEqual(payloads[1], { sessionId: 's-gen', trigger: 'idle' })
  // 旧调用方不带 options：默认按手动处理，保持原有行为。
  assert.deepEqual(payloads[2], { sessionId: 's-gen', trigger: 'manual' })
})

await check('the new statuses reach the caller instead of becoming an error', async () => {
  for (const status of ['limited', 'skipped', 'busy', 'empty', 'no-context']) {
    await resetFetch(async () => new Response(JSON.stringify({ status }), { status: 200 }))
    const result = await internals.requestGeneration('s-status', undefined, { trigger: 'manual' })
    assert.equal(result.status, status)
    assert.equal(result.suggestion, null)
  }
  await resetFetch(async () => new Response(JSON.stringify({ status: 'weird' }), { status: 200 }))
  assert.equal((await internals.requestGeneration('s-status', undefined, {})).status, 'error')
})

await check('feedback is skipped when the host has no event feedback', async () => {
  internals.resetFeedbackCapability()
  await resetFetch(async (path) => {
    if (path.endsWith('/usage')) return new Response(JSON.stringify({ usage: { calls: 3 } }), { status: 200 })
    return new Response(null, { status: 204 })
  })
  const sessionId = 's-legacy-' + String(Math.random())
  await internals.reportFeedbackEvent(sessionId, 'sg-7', 'accepted')
  assert.deepEqual(feedbackEvents(), [], 'an old host would misread the event as a rejection')
})

await check('feedback capability is detected at the top level and under usage', async () => {
  for (const body of [
    { usage: { calls: 1 }, feedback: { shown: 2, accepted: 1 } },
    { usage: { calls: 1, feedback: { shown: 2, accepted: 1 } } },
  ]) {
    await resetFetch(async () => new Response(JSON.stringify(body), { status: 200 }))
    internals.resetFeedbackCapability()
    await internals.reportFeedbackEvent('s-detect-' + String(Math.random()), 'sg-21', 'shown')
    assert.deepEqual(feedbackEvents(), ['shown'], 'an event-aware host must receive the event')
  }
})

await check('the settings page reads the top-level feedback block', async () => {
  const Page = exportsObject.InputSuggestSettingsPage
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: {} }), subscribe: () => () => {}, mutate: async () => {} }
  const saved = globalThis.fetch
  globalThis.fetch = async (path) => {
    if (String(path).endsWith('/usage')) {
      return new Response(JSON.stringify({
        usage: { calls: 4, totalTokens: 900 },
        feedback: { shown: 9, accepted: 4, sent: 2, edited: 1, dismissed: 3, regenerated: 2, acceptRate: 0.4444, sendRate: 0.5, avgEditRatio: 0.125, duplicateRate: 0.2, avgResponseMs: 1500, tokensPerSent: 450 },
      }), { status: 200 })
    }
    return new Response(JSON.stringify({ presets: [] }), { status: 200 })
  }
  try {
    const tree = Page({ ctx: { configForms: { get: () => scope } }, scopes: { main: scope } })
    assert.equal(tree.type, 'div')
    // 顶层块会被 useUsage 收进 topFeedback；这里只验证页面在两种形状下都能渲染。
    const texts = []
    const walk = (node) => {
      if (node === null || node === undefined || typeof node === 'boolean') return
      if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
      if (Array.isArray(node)) { for (const child of node) walk(child); return }
      if (typeof node === 'object') { walk(node.props?.label); walk(node.children) }
    }
    walk(tree)
    assert.ok(texts.includes(internals.copy().feedbackTitle))
  } finally {
    globalThis.fetch = saved
  }
})

await check('feedback carries the event shape and never the draft', async () => {
  await resetFetch()
  internals.resetFeedbackCapability()
  const sessionId = 's-shape-' + String(Math.random())
  await internals.reportFeedbackEvent(sessionId, 'sg-8', 'shown')
  const bodies = fetchCalls.filter((call) => call.path.endsWith('/feedback')).map((call) => call.body)
  assert.deepEqual(bodies, [{ sessionId, suggestionId: 'sg-8', event: 'shown' }])
  assert.equal('text' in bodies[0], false)
})

await check('an unknown feedback event is never transmitted', async () => {
  await resetFetch()
  internals.resetFeedbackCapability()
  await internals.reportFeedbackEvent('s-guard', 'sg-9', 'sent')
  await internals.reportFeedbackEvent('s-guard', 'sg-9', 'bogus')
  assert.deepEqual(feedbackEvents(), [])
})

await check('abandonment fires only after an accepted line is cleared with no send', async () => {
  await resetFetch()
  const sessionId = 's-abandon-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-10', 'rerun the failing case')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  assert.equal(internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined), true)
  // 采纳后草稿真的出现了这段文字。
  internals.observeAcceptance(sessionId, { draft: 'rerun the failing case', phase: 'plain', pendingSubmissions: [] })
  // 用户手动清空。
  internals.observeAcceptance(sessionId, { draft: '', phase: 'plain', pendingSubmissions: [] })
  const record = internals.state.accepted.get(sessionId)
  assert.ok(record !== undefined, 'the acceptance must still be tracked inside the grace window')
  clearTimeout(record.timer)
  internals.settleAcceptance(sessionId, record)
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-10' + NUL + 'abandoned'), true)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a real send is never mistaken for abandonment', async () => {
  await resetFetch()
  const sessionId = 's-send-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-11', 'apply the patch')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'apply the patch', phase: 'plain', pendingSubmissions: [] })
  // 原生发送是乐观的：先登记 pendingSubmissions，再清草稿。
  internals.observeAcceptance(sessionId, {
    draft: '',
    phase: 'plain',
    pendingSubmissions: [{ requestId: 'r-1', text: 'apply the patch' }],
  })
  assert.equal(internals.state.accepted.get(sessionId), undefined)
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-11' + NUL + 'abandoned'), undefined)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a send of the accepted line reports the opaque submission id', async () => {
  await resetFetch()
  const sessionId = 's-submitted-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-18', 'apply the patch')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'apply the patch', phase: 'plain', pendingSubmissions: [] })
  internals.observeAcceptance(sessionId, {
    draft: '',
    phase: 'plain',
    pendingSubmissions: [{ requestId: 'rpc-77', text: 'apply the patch' }],
  })
  await internals.flushFeedback()
  const submitted = fetchCalls
    .filter((call) => call.path.endsWith('/feedback'))
    .map((call) => call.body)
    .filter((body) => body.event === 'submitted')
  assert.deepEqual(submitted, [{ sessionId, suggestionId: 'sg-18', event: 'submitted', requestId: 'rpc-77' }])
  assert.equal('text' in submitted[0], false, 'only the opaque id travels')
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-18' + NUL + 'edited'), undefined)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a rewritten line before sending reports edited and still links the send', async () => {
  await resetFetch()
  const sessionId = 's-submitted-edit-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-19', 'run the unit tests')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'run all tests now', phase: 'plain', pendingSubmissions: [] })
  internals.observeAcceptance(sessionId, {
    draft: '',
    phase: 'plain',
    pendingSubmissions: [{ requestId: 'rpc-78', text: 'run all tests now' }],
  })
  await internals.flushFeedback()
  const bodies = fetchCalls.filter((call) => call.path.endsWith('/feedback')).map((call) => call.body)
  const tracked = bodies.filter((body) => body.event === 'edited' || body.event === 'submitted')
  assert.deepEqual(tracked.map((body) => body.event).sort(), ['edited', 'submitted'])
  const submitted = bodies.find((body) => body.event === 'submitted')
  assert.equal(submitted.requestId, 'rpc-78')
  assert.equal(bodies.some((body) => 'text' in body), false)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('unrelated sends are never bound to the acceptance', async () => {
  await resetFetch()
  const sessionId = 's-ambiguous-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-20', 'check the logs')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'check the logs', phase: 'plain', pendingSubmissions: [] })
  // 两条发送都来自别处（队列 / 子代理）：文本与采纳行、发送前草稿都不吻合。
  internals.observeAcceptance(sessionId, {
    draft: '',
    phase: 'plain',
    pendingSubmissions: [
      { requestId: 'rpc-80', text: 'restart the worker' },
      { requestId: 'rpc-81', text: 'and the metrics' },
    ],
  })
  await internals.flushFeedback()
  const submitted = fetchCalls
    .filter((call) => call.path.endsWith('/feedback'))
    .map((call) => call.body)
    .filter((body) => body.event === 'submitted')
  assert.deepEqual(submitted, [], 'unmatched sends must not be attributed')
  assert.equal(internals.state.accepted.get(sessionId), undefined)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a send recorded before any view snapshot is not claimed', async () => {
  await resetFetch()
  const sessionId = 's-nosnapshot-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-22', 'check the logs')
  // 采纳时输入框还没渲染过，拿不到 view 快照：pendingAtAccept 缺省。
  internals.state.acceptViews.delete(sessionId)
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, {
    draft: '',
    phase: 'plain',
    pendingSubmissions: [{ requestId: 'rpc-90', text: 'check the logs' }],
  })
  await internals.flushFeedback()
  const submitted = fetchCalls
    .filter((call) => call.path.endsWith('/feedback'))
    .map((call) => call.body)
    .filter((body) => body.event === 'submitted')
  assert.deepEqual(submitted, [], 'without a baseline, a queued send is not attributable')
  clearInterval(source.timer)
  source.controller.abort()
})

await check('retyping before the grace timer cancels abandonment', async () => {
  await resetFetch()
  const sessionId = 's-retype-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-12', 'summarize the diff')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'summarize the diff', phase: 'plain', pendingSubmissions: [] })
  internals.observeAcceptance(sessionId, { draft: '', phase: 'plain', pendingSubmissions: [] })
  // 用户在计时器到期前写回了同样一行：不算放弃。
  internals.observeAcceptance(sessionId, { draft: 'summarize the diff', phase: 'plain', pendingSubmissions: [] })
  assert.equal(internals.state.accepted.get(sessionId)?.clearedAt, 0)
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-12' + NUL + 'abandoned'), undefined)
  internals.cancelAcceptance(sessionId)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a submit-phase clear is a send, not an abandonment', async () => {
  await resetFetch()
  const sessionId = 's-submit-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-13', 'list the changed files')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'list the changed files', phase: 'plain', pendingSubmissions: [] })
  internals.observeAcceptance(sessionId, { draft: '', phase: 'adjudicating', pendingSubmissions: [] })
  const record = internals.state.accepted.get(sessionId)
  assert.equal(record.clearedAt, 0, 'clearing during submission must not start the abandon timer')
  assert.equal(record.sawSubmit, true)
  internals.settleAcceptance(sessionId, record)
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-13' + NUL + 'abandoned'), undefined)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('retyping a different line drops the acceptance without a send', async () => {
  await resetFetch()
  const sessionId = 's-rewrite-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-15', 'open the failing spec')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'open the failing spec', phase: 'plain', pendingSubmissions: [] })
  internals.observeAcceptance(sessionId, { draft: '', phase: 'plain', pendingSubmissions: [] })
  const armed = internals.state.accepted.get(sessionId)
  assert.ok(armed !== undefined && armed.clearedAt !== 0, 'the clear must arm the abandon timer')
  // 清空后敲了完全不同的内容：这是重写，不是放弃，也不该再等放弃计时。
  internals.observeAcceptance(sessionId, { draft: 'summarize yesterday.', phase: 'plain', pendingSubmissions: [] })
  assert.equal(internals.state.accepted.get(sessionId), undefined, 'a different line invalidates the acceptance')
  // 清空后紧接着敲无关内容、且没有任何发送回显：本地直接判定放弃并撤销跟踪，
  // 宿主不必再等第二个宽限期。
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-15' + NUL + 'abandoned'), true)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('rewriting the accepted line reports edited exactly once', async () => {
  await resetFetch()
  const sessionId = 's-edit-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  const suggestion = suggestionOf('sg-14', 'run the unit tests')
  internals.state.acceptViews.set(sessionId, { draft: '', pendingSubmissions: [], phase: 'plain' })
  internals.acceptSuggestion(sessionId, source, suggestion, { setDraft: () => {} }, undefined)
  internals.observeAcceptance(sessionId, { draft: 'run the integration tests instead', phase: 'plain', pendingSubmissions: [] })
  internals.observeAcceptance(sessionId, { draft: 'run the integration tests instead', phase: 'plain', pendingSubmissions: [] })
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-14' + NUL + 'edited'), true)
  internals.cancelAcceptance(sessionId)
  clearInterval(source.timer)
  source.controller.abort()
})

await check('plain whitespace and punctuation changes are not rewrites', () => {
  assert.equal(internals.normalizeDraftText('  Run  the tests. '), 'run the tests')
  assert.equal(internals.normalizeDraftText('a\n\nb'), 'a\nb')
  assert.equal(internals.normalizeDraftText(undefined), '')
})

await check('only one ghost instance renders per session', () => {
  const sessionId = 's-single-' + String(Math.random())
  const hits = []
  const releaseA = internals.claimGhostView(sessionId, 101, () => hits.push('a'))
  assert.equal(internals.ghostOwner(sessionId), 101)
  const releaseB = internals.claimGhostView(sessionId, 102, () => hits.push('b'))
  assert.equal(internals.ghostOwner(sessionId), 102, 'the newly mounted view takes over')
  releaseB()
  assert.equal(internals.ghostOwner(sessionId), 101, 'the surviving view regains the ghost')
  releaseA()
  assert.equal(internals.ghostOwner(sessionId), 0)
  assert.ok(hits.length >= 3)
})

await check('the ghost visibility guard reads live tab state', () => {
  const visibility = document.visibilityState
  document.visibilityState = 'hidden'
  assert.equal(internals.viewVisible(), false)
  document.visibilityState = 'visible'
  assert.equal(internals.viewVisible(), true)
  document.visibilityState = visibility
})

await check('the ghost reports shown only after it is actually mounted', async () => {
  await resetFetch()
  internals.resetFeedbackCapability()
  const sessionId = 's-shown-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  source.value = suggestionOf('sg-16', 'check the new route')
  const { GhostSuggestion } = exportsObject
  const element = GhostSuggestion({
    sessionId,
    useSession: (select) => select({ running: false, pendingSubmissions: [], awaitingFirstTurn: false }),
    useInput: (select) => select({ draft: '', phase: 'plain', draftRev: 1 }),
    inputActions: { setDraft: () => {} },
  })
  assert.equal(element?.props?.['data-input-suggest-ghost'], '', 'the ghost must render')
  // effect 里报 shown；等一轮微任务让串行队列走完。
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-16' + NUL + 'shown'), true)
  assert.deepEqual(feedbackEvents(), ['shown'])
  clearInterval(source.timer)
  source.controller.abort()
})

await check('a hidden tab withholds shown until the tab becomes visible', async () => {
  await resetFetch()
  internals.resetFeedbackCapability()
  const sessionId = 's-hidden-' + String(Math.random())
  const source = internals.sourceOf(sessionId)
  source.value = suggestionOf('sg-17', 'inspect the render tree')
  const listeners = []
  const originalAdd = document.addEventListener
  const originalRemove = document.removeEventListener
  document.addEventListener = (type, fn) => listeners.push({ type, fn })
  document.removeEventListener = (type, fn) => {
    const at = listeners.findIndex((entry) => entry.type === type && entry.fn === fn)
    if (at >= 0) listeners.splice(at, 1)
  }
  document.visibilityState = 'hidden'
  const { GhostSuggestion } = exportsObject
  GhostSuggestion({
    sessionId,
    useSession: (select) => select({ running: false, pendingSubmissions: [], awaitingFirstTurn: false }),
    useInput: (select) => select({ draft: '', phase: 'plain', draftRev: 1 }),
    inputActions: { setDraft: () => {} },
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(internals.state.reported.get(sessionId + NUL + 'sg-17' + NUL + 'shown'), undefined)
  assert.equal(listeners.length, 1, 'a visibility listener must be armed')
  document.visibilityState = 'visible'
  listeners[0].fn()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(feedbackEvents(), ['shown'])
  document.visibilityState = 'visible'
  document.addEventListener = originalAdd
  document.removeEventListener = originalRemove
  clearInterval(source.timer)
  source.controller.abort()
})

await check('keys outside the composer never accept the suggestion', () => {
  const inside = { target: { closest: (selector) => (selector === '[data-composer-card]' ? {} : null) } }
  const outside = { target: { closest: () => null } }
  document.activeElement = null
  assert.equal(internals.isComposerEvent(inside), true)
  assert.equal(internals.isComposerEvent(outside), false)
})

await check('the settings draft exposes the new strategy fields', () => {
  const draft = internals.normalizeSettings({})
  assert.equal(draft.mode, 'hybrid')
  assert.equal(draft.contextLevel, 'task')
  assert.equal(draft.taskAwareness, true)
  assert.equal(draft.taskMemoryMinutes, '30')
  assert.equal(draft.draftCompletion, false)
  assert.equal(draft.localPolicy, 'loopback-gateway')
  assert.equal(draft.trustedLocalProvider, '')
  const custom = internals.normalizeSettings({
    mode: 'predict', contextLevel: 'extended', taskAwareness: false,
    taskMemoryMinutes: 0, draftCompletion: true, localPolicy: 'strict-local',
    trustedLocalProvider: 'opencodex', trustedLocalModel: 'llama',
  })
  assert.equal(custom.mode, 'predict')
  assert.equal(custom.contextLevel, 'extended')
  assert.equal(custom.taskAwareness, false)
  assert.equal(custom.taskMemoryMinutes, '0')
  assert.equal(custom.draftCompletion, true)
  assert.equal(custom.localPolicy, 'strict-local')
  assert.equal(custom.trustedLocalModel, 'llama')
  // 未知值回落到默认，避免下拉框空白。
  const unknown = internals.normalizeSettings({ mode: 'auto', contextLevel: 'whole', localPolicy: 'x' })
  assert.equal(unknown.mode, 'hybrid')
  assert.equal(unknown.contextLevel, 'task')
  assert.equal(unknown.localPolicy, 'loopback-gateway')
})

await check('saving writes only the changed strategy fields', () => {
  const live = internals.normalizeSettings({})
  assert.deepEqual(internals.settingsOps(live, live), [])
  const draft = Object.assign({}, live, { mode: 'next-action', localPolicy: 'strict-local', trustedLocalModel: 'llama' })
  assert.deepEqual(internals.settingsOps(draft, live), [
    { op: 'set', path: ['mode'], value: 'next-action' },
    { op: 'set', path: ['localPolicy'], value: 'strict-local' },
    { op: 'set', path: ['trustedLocalModel'], value: 'llama' },
  ])
  // 越界的分钟数与合法的 0 都按边界处理。
  assert.deepEqual(internals.settingsOps(Object.assign({}, live, { taskMemoryMinutes: '500' }), live), [])
  assert.deepEqual(internals.settingsOps(Object.assign({}, live, { taskMemoryMinutes: '0' }), live), [
    { op: 'set', path: ['taskMemoryMinutes'], value: 0 },
  ])
  const cleared = internals.settingsOps(
    Object.assign({}, live, { trustedLocalProvider: '' }),
    Object.assign({}, live, { trustedLocalProvider: 'x' }),
  )
  assert.deepEqual(cleared, [{ op: 'unset', path: ['trustedLocalProvider'] }])
})

await check('rates and durations render without inventing a zero', () => {
  assert.equal(internals.formatRate(null), '—')
  assert.equal(internals.formatRate(0), '0%')
  assert.equal(internals.formatRate(0.456), '46%')
  assert.equal(internals.formatMilliseconds(null), '—')
  assert.equal(internals.formatMilliseconds(240), '240ms')
  assert.equal(internals.formatMilliseconds(2500), '2.5s')
  assert.equal(internals.formatMilliseconds(90000), '1.5min')
})

await check('the settings page shows the strategy and feedback sections', () => {
  const Page = exportsObject.InputSuggestSettingsPage
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: {} }), subscribe: () => () => {}, mutate: async () => {} }
  const tree = Page({ ctx: { configForms: { get: () => scope } }, scopes: { main: scope } })
  const texts = []
  const walk = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
    if (Array.isArray(node)) { for (const child of node) walk(child); return }
    if (typeof node === 'object') {
      // Row 把标签放在 props.label 里，只走 children 会漏掉所有行标签。
      walk(node.props?.label)
      walk(node.children)
    }
  }
  walk(tree)
  const copy = internals.copy()
  assert.ok(texts.includes(copy.strategyTitle), 'the strategy section must be rendered')
  assert.ok(texts.includes(copy.feedbackTitle), 'the feedback section must be rendered')
  assert.ok(texts.includes(copy.localPolicy), 'the local route policy control must be rendered')
})


// 宿主半区

// 相对路径导入宿主半区：宿主包由 resolve-host 的 import 钩子解析到本机 DSH 安装。
const host = await import('../lib/index.js')

await check('host exports the plugin identity and services', () => {
  assert.equal(host.name, 'input-suggest')
  assert.deepEqual(host.inject, ['llm', 'sessions', 'connection'])
  assert.equal(typeof host.apply, 'function')
})

await check('resolveConfig unwraps volatile references and clamps numbers', () => {
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

await check('redactSecrets masks credential shapes', () => {
  const redacted = host.redactSecrets('key sk-abcdefghijklmnopqrstuvwx and AKIAABCDEFGHIJKLMNOP end')
  assert.match(redacted, /<secret-token>/)
  assert.match(redacted, /<aws-access-key-id>/)
  assert.doesNotMatch(redacted, /sk-abcdefghijklmnopqrstuvwx/)
})

await check('cleanSuggestion strips fences, quotes and control codes', () => {
  assert.equal(host.cleanSuggestion('  "run the tests"\n'.trim()), 'run the tests')
  assert.equal(host.cleanSuggestion('\u001b[31mcommit it\u001b[0m'), 'commit it')
})

await check('sanitizeSuggestion truncates on visible characters', () => {
  assert.deepEqual(host.sanitizeSuggestion('abcdef', 3), { text: 'abc', truncated: true })
  assert.deepEqual(host.sanitizeSuggestion('ab', 3), { text: 'ab', truncated: false })
})

await check('shouldFilterSuggestion drops pleasantries, questions and multi-sentence text', () => {
  assert.equal(host.shouldFilterSuggestion('thanks'), true)
  assert.equal(host.shouldFilterSuggestion('looks good'), true)
  assert.equal(host.shouldFilterSuggestion('Let me check'), true)
  assert.equal(host.shouldFilterSuggestion('what about the tests?'), true)
  assert.equal(host.shouldFilterSuggestion('run tests. then commit.'), true)
  assert.equal(host.shouldFilterSuggestion('run the tests'), false)
})

await check('buildSystemPrompt appends the custom style block', () => {
  const plain = host.buildSystemPrompt(240, 'English')
  assert.doesNotMatch(plain, /USER STYLE/)
  const styled = host.buildSystemPrompt(240, 'English', 'prefer short imperative English')
  assert.match(styled, /USER STYLE \/ PREFERENCES/)
  assert.match(styled, /prefer short imperative English/)
  assert.match(styled, /At most 240 visible characters/)
})

await check('buildPairs keeps only human user messages and the newest window', () => {
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

await check('buildPairs respects the character budget', () => {
  // 长串的 'x' 会被脱敏成 <opaque-secret>，这里用普通词保证测的是预算而不是脱敏。
  const long = 'please review the failing test '.repeat(20)
  const messages = [
    { role: 'user', content: [{ type: 'text', text: long }], source: { kind: 'user' } },
    { role: 'assistant', content: [{ type: 'text', text: long }], source: { kind: 'model' } },
  ]
  const pairs = host.buildPairs(messages, 2, 100)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].role, 'assistant')
  assert.ok(pairs[0].text.length <= 100)
})

await check('suggestionLanguage follows the latest user message', () => {
  assert.equal(host.suggestionLanguage([{ role: 'user', text: 'please fix this' }]), 'English')
  assert.equal(host.suggestionLanguage([{ role: 'user', text: '\u5e2e\u6211\u4fee\u590d\u8fd9\u4e2a\u95ee\u9898' }]), '\u7b80\u4f53\u4e2d\u6587')
})

await check('routeOf prefers configured values and falls back to the session route', () => {
  const config = { provider: '', model: '' }
  assert.deepEqual(host.routeOf({ config: { provider: 'opencodex', model: 'glm-5.3' } }, config), { provider: 'opencodex', model: 'glm-5.3' })
  assert.deepEqual(
    host.routeOf({ config: { provider: 'opencodex', model: 'glm-5.3' } }, { provider: 'other', model: '' }),
    { provider: 'other', model: 'glm-5.3' },
  )
  assert.equal(host.routeOf(undefined, config), undefined)
})

await check('stored records round-trip through the domain schema', () => {
  const suggestion = { turn: 2, text: 'commit it', truncated: false, acceptKey: 'Tab', route: { provider: 'p', model: 'm' }, style: 'brief' }
  const record = host.toStoredRecord(suggestion)
  assert.deepEqual(host.toSuggestion(record), suggestion)
  assert.equal(host.toSuggestion({ version: 1, turn: 1, text: '', truncated: false, acceptKey: 'Tab' }), undefined)
})

/** 渲染期间注册的定时器与轮询可能真实存在；统一清理，保证测试进程能退出。 */
for (const cleanup of effectCleanups) {
  try {
    cleanup()
  } catch {
    // 清理失败不影响断言结果。
  }
}
try {
  await exportsObject.__internals.flushFeedback()
} catch {
  // 队列已结算。
}
exportsObject.__internals.disposeAll()

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1
