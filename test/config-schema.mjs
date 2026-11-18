import z from '@deepseek-ai/schemastery'
import { Config } from 'file:///E:/DeepseekHarness/dsh-input-suggest/lib/index.js'

const resolved = Config({
  enabled: true,
  provider: '',
  model: '',
  reasoningEffort: '',
  style: '',
  acceptKey: 'Tab',
  maxRecentTurns: 1,
  maxTranscriptChars: 12000,
  maxSuggestionChars: 240,
  maxOutputTokens: 512,
  timeoutMs: 60000,
})
const describe = Object.keys(resolved).map((key) => key + '=' + (resolved[key] !== null && typeof resolved[key] === 'object' && typeof resolved[key].get === 'function' ? 'volatile' : JSON.stringify(resolved[key])))
console.log(describe.join('\n'))

// 越界值必须被拒绝，好让 profile 启动时就报错而不是运行时静默。
let rejected = false
try {
  Config({ maxOutputTokens: 0, timeoutMs: 60000, maxTranscriptChars: 1, maxSuggestionChars: 1, maxRecentTurns: 1 })
} catch {
  rejected = true
}
console.log('rejects-out-of-range=' + String(rejected))

