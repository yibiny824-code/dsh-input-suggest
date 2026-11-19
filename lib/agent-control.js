/**
 * dsh-input-suggest / agent-control — Agent 自然语言配置的宿主接入层。
 *
 * 注册一个原生 Agent 工具（input_suggest_config），让 DSH 会话里的 Agent
 * 能按用户口头指令直接修改智能建议的风格、格式、详细度与模式。
 *
 * 工具只做结构化操作（inspect / list-presets / preview / apply / reset /
 * restore / inspect-effective）；自然语言 → 结构化意图的映射由 Agent 完成。
 * 本模块不做文本解析配置 —— 那是提示词注入（systemPrompt.section）的职责。
 *
 * 权限边界：
 *   - 只有 Agent 工具调用能触发本模块（工具本身就是宿主授予的权限面）；
 *   - 字段白名单在 suggestion-config.js 里硬编码，安全语义字段
 *     （enabled / allowRemote / localPolicy 等）不进白名单，工具改不了；
 *   - agentConfig=false 时整个工具直接拒绝操作。
 *
 * @module dsh-input-suggest/agent-control
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { AGENT_FIELDS, FIELD_DESCRIPTIONS } from './suggestion-config.js'

/** 系统提示词注入：教 Agent 何时以及怎么调这个工具。 */
export const AGENT_CONFIG_PROMPT = [
  'Input Suggest configuration: the user can ask you, in natural language, to change how the input-suggestion plugin writes its suggestions (style, format, detail level, length, mode).',
  'When the user asks (e.g. "把智能建议改成研究型风格", "以后建议写得详细些", "换成目标/步骤/验收的格式", "恢复上次的配置"), call the input_suggest_config tool with a structured action instead of editing files:',
  '- To read current settings: action=inspect (profile) or action=inspect-effective with sessionId (session-level final config).',
  '- To see available presets/formats: action=list-presets.',
  '- To preview a change without applying: action=preview with a patch object.',
  '- To apply: action=apply with scope=profile (persistent, default) or scope=session (this session only, requires sessionId), and a patch with only the fields to change.',
  '- To reset fields to defaults: action=reset with scope and fields (omit fields = all).',
  '- To restore the last valid configuration: action=restore.',
  'Configurable fields: ' + AGENT_FIELDS.join(', ') + '.',
  'Scope semantics: "这一轮 / 当前会话" → scope=session; "以后 / 默认 / 保存" → scope=profile. When the user does not specify, prefer scope=profile.',
  'After applying, state the actual scope and the resulting values. Never edit plugin files or settings documents directly.',
].join('\n')

/**
 * 注册 Agent 工具与系统提示词 section。
 *
 * @param {object} ctx - Cordis 上下文（tools / systemPrompt / agents 服务）。
 * @param {object} handlers - 由 index.js 提供的操作实现 { agentConfigAction }。
 * @param {object} options - { order: 系统提示词排序 }。
 */
export function installAgentControl(ctx, handlers, options = {}) {
  const dispose = []
  // 用 ctx.get 而非属性访问：本插件不把 tools/systemPrompt 写进 inject，
  // 缺这些服务时 agentConfig 静默降级，不影响建议主功能。
  const tools = ctx.get('tools')
  const systemPrompt = ctx.get('systemPrompt')
  if (tools === undefined || systemPrompt === undefined) return () => undefined

  dispose.push(tools.register(defineTool({
    name: 'input_suggest_config',
    description: 'Read or change how the input-suggestion plugin writes its suggestions (style preset, output format, detail level, character cap, mode, prompt template). Use this when the user asks in natural language to adjust the suggestions (e.g. "make suggestions research-oriented", "use goal/steps/acceptance format", "switch to prediction-only mode", "restore the previous config"). Actions: inspect, list-presets, preview, apply, reset, restore, inspect-effective.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['inspect', 'list-presets', 'preview', 'apply', 'reset', 'restore', 'inspect-effective'],
        description: 'inspect: read profile config. list-presets: available style presets and formats. preview: show what a patch would change. apply: apply a patch (scope=profile persistent or scope=session for this session). reset: reset fields to defaults. restore: roll back to the last valid configuration. inspect-effective: the final config for one session after its overrides.',
      },
      scope: {
        type: 'string',
        enum: ['profile', 'session'],
        description: 'Where the change applies: profile (persistent across restarts, default) or session (this session only). apply and reset only.',
      },
      sessionId: {
        type: 'string',
        description: 'Required when scope=session: the target session id.',
      },
      patch: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(AGENT_FIELDS.map((field) => [field, {
          type: typeof FIELD_DESCRIPTIONS[field] === 'string' && (field === 'maxSuggestionChars') ? 'integer' : 'string',
          description: FIELD_DESCRIPTIONS[field],
        }])),
        description: 'Fields to change (apply/preview only). Only these fields are configurable; everything else is rejected.',
      },
      fields: {
        type: 'array',
        items: { type: 'string', enum: [...AGENT_FIELDS] },
        description: 'Fields to reset (reset only). Omit to reset all configurable fields.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok === true
          ? 'Input-suggest configuration updated. ' + JSON.stringify(value.changes ?? value.config ?? {}, null, 2)
          : 'Input-suggest configuration rejected: ' + String(value.problems?.join('; ')),
      }],
    },
    async execute(args, exec) {
      // 会话级操作默认绑定调用者的会话（Agent 已知自己在哪个会话里）。
      const merged = { ...args }
      if ((merged.scope === 'session' || merged.action === 'inspect-effective')
        && (merged.sessionId === undefined || merged.sessionId === '')) {
        const sessionId = exec?.agent?.session?.id
        if (typeof sessionId === 'string' && sessionId !== '') merged.sessionId = sessionId
      }
      const result = await handlers.agentConfigAction(merged.action, merged)
      return result
    },
  })))

  // 系统提示词注入：让 Agent 知道这个工具存在、何时用、怎么选 scope。
  dispose.push(systemPrompt.section({
    name: 'input-suggest:agent-config',
    order: options.order ?? 118,
    text: AGENT_CONFIG_PROMPT,
  }))

  return () => { for (const d of dispose) d() }
}
