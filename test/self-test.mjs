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

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
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
  assert.deepEqual(exportsObject.inject, ['slots'])
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
  const ctx = {
    effect: (fn) => fn(),
    inject: () => {},
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
  assert.deepEqual(names, ['conversation.input.overlay', 'conversation.input.right'])
})

check('the ghost overlay renders nothing while the session is running', () => {
  let registered
  const ctx = {
    effect: (fn) => fn(),
    inject: () => {},
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

check('apply registers the settings page when configForms is present', () => {
  const registered = []
  const ctx = {
    effect: (fn) => fn(),
    inject: (services, child) => {
      assert.deepEqual(services, ['configForms'])
      child({
        effect: (fn) => fn(),
        slots: {
          inject: (name, fn) => fn(),
          register: (spec, component) => {
            registered.push({ spec, component })
            return () => {}
          },
        },
        configForms: { get: (ns) => ({ ns }) },
      })
    },
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

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

