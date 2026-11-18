# dsh-input-suggest

> 给 DeepSeek Harness（DSH）的输入框智能建议插件：每轮回答结束后，用一个**你指定的辅助模型**预测你下一句最可能说的话，以浅色幽灵文字显示在输入框里。

它在本地学习你的使用习惯（采纳率、平均句长、语言、常用开头词），把这份画像注入提示词，并允许你自定义提示词模板与详细度。**画像只留在这台机器上**，外发默认只走 loopback。

## 功能

| 能力 | 说明 |
|---|---|
| 智能输入 | 每轮 `turn/end`（正常完成）后生成一条下一条提示词，渲染成输入框内的灰色幽灵文字；草稿为空且会话空闲时才显示，打字即隐藏 |
| 显式指定模型 | 设置 → 智能建议：供应商 / 模型 / 思考强度，留空则沿用会话路由 |
| 独立「重随」按键 | 输入框工具栏独立按钮，无视「本轮已生成」游标重新生成；有建议时旁边另有采纳按钮（触屏没有 Tab） |
| 非破坏 | 零会话日志写入（建议与画像都存在插件自己的 storage domain），只挂官方插槽与 `/api` 路由，不 patch 任何官方包 |
| 提示词与风格可定制 | 模板支持占位符，风格指令追加到模板；详细度三档（极简 / 标准 / 详细） |
| 独立记忆 | 本地画像记录采纳率、平均句长、语言、常用开头词、最近采纳/被拒样例 |
| 持续学习 | 隐式反馈：宿主建议 B 与你实际发出的 A 比对；点重随算明确拒绝 |

## 隐私与安全

这是本插件的设计重点，不是附注：

1. **不写会话日志。** 建议与画像都存在插件自己的 storage domain（`$DSH_HOME/storages/input_suggest/`），DSH 0.2.0-rc.2 无法给追加事件打 `ignorable` 标记，写自定义事件会让会话冷读失败。
2. **画像只在本机。** 只保存聚合量与少量裁剪后的建议原文（每条 ≤120 字符，各最多 20/10 条），不保存对话正文、工具输出、文件内容、diff。
3. **外发闸门。** `allowRemote` 默认 `false`：只把上下文发给 loopback 端点（`127.0.0.1` / `localhost` / `::1`）。端点明确是远端且未授权时直接放弃本次生成，不是「尽力发送」。
4. **两层脱敏。** 发出前先模式化替换凭据（sk-、gh_、AKIA、JWT、Bearer、Stripe、长哈希）、邮箱、手机号、身份证、绝对路径、内网地址；再做一次高置信度复检，命中就整条放弃。
5. **结构最小化。** 只发最近一轮 user/assistant 文本，只认 `source.kind === 'user'` 的用户消息；工作区指令、运行时快照、技能目录都不外发。
6. **学习可关。** `learn = false` 后只读画像、不再写入；`useMemory` / `useExamples` 可分别关闭注入。

## 安装

```powershell
# 在桌面端已初始化过 profile 之后（默认装 desktop profile）
node tools/desktop-profile.mjs install
```

卸载：

```powershell
node tools/desktop-profile.mjs uninstall
```

装完重启一次桌面端。也可以用 `dsh plugin --profile <name> add <本包路径>`。

## 使用

1. 问一句，等它答完。
2. 输入框里出现浅色文字时，按 **Tab**（或你配置的快捷键）采纳；建议进入草稿后仍可编辑，**不会自动发送**。
3. 不满意就点工具栏的 **重随** 按钮。

没有建议是正常现象：模型判断「下一步不明显」、或输出是套话 / 提问 / 助手口吻 / 多句时，插件静默跳过。

## 配置

设置 → **智能建议**：

| 字段 | 默认 | 说明 |
|---|---|---|
| 启用 | 开 | 关掉后不再自动生成（重随仍可用） |
| 供应商 / 模型 | 空 | 辅助模型路由；空 = 沿用会话最近一次请求的路由 |
| 思考深度 | 空 | 空 = 用模型自己的默认强度 |
| 采纳快捷键 | `Tab` | 点进输入框后直接按组合键即可写入 |
| 详细度 | 标准 | 极简 ≤40 字符 / 标准 ≤120 / 详细 ≤240；与「最长字符数」取小 |
| 建议最长字符数 | 240 | 硬上限 |
| 提示词模板 | 空 | 留空用内置模板；见下 |
| 注入本地画像 | 开 | 把学习到的画像写进 `{{memory}}` |
| 注入采纳示例 | 开 | 把最近采纳的建议写进 `{{examples}}` |
| 持续学习 | 开 | 关掉只读画像、不再写入 |
| 允许远端端点 | 关 | 打开才会把（已脱敏的）上下文发给非本机地址 |

### 模板占位符

`{{instructions}}` `{{style}}` `{{memory}}` `{{examples}}` `{{language}}` `{{detail}}` `{{maxChars}}`

删掉 `{{instructions}}` 时内置刚性约束会自动补回：这是功能红线，避免一次编辑把模型引导成「生成代码」。

## 机制

- **生成**：监听 `session/event`，只认 `turn/end` 且 `reason.kind === 'completed'`；同一回合只跑一次，新回合开始即中断在途请求。
- **上下文**：`session.deriveMessages()` 取最近若干轮的 user/assistant 文本，经脱敏后框架化。
- **调用**：`ctx.llm.stream({ provider, model, system, messages, maxTokens })`，`BlockAssembler` 装配。
- **输出处理**：控制字符清洗 → 引号/围栏剥离 → 语义过滤 → 长度截断（详细度上限与配置上限取小）。
- **学习**：浏览器在草稿从空变成有文本时上报最终文本，宿主与上一条建议做相似度比对（编辑距离 + 包含判据），写入本地画像；重随记一次明确拒绝。
- **存储**：domain `input_suggest`，`per-record` 布局，`backup-and-skip` —— 记录坏了不阻塞启动。
- **传输**：`connection.fetch.register` 挂在 `/api` 网关上（`get` / `generate` / `feedback`），浏览器用普通 `fetch`。

## 文件

```
dsh-input-suggest/
  package.json
  cordis.patch.yml
  lib/index.js          宿主半区（ESM）
  lib/prompt.js         模板渲染与详细度
  lib/memory.js         本地画像与隐式反馈
  lib/privacy.js        脱敏与外发闸门
  client.js             浏览器半区（__ModuleLoader__，手写无构建）
  tools/desktop-profile.mjs
  test/
```

## 自检

```powershell
cd dsh-input-suggest
npm test               # 纯逻辑：模块形状、插槽注册、快捷键、清洗与过滤（20 项）
npm run test:memory    # 画像 / 脱敏 / 模板（18 项）
npm run test:host      # 真实 cordis：挂载、路由、回合行为（9 项）
npm run test:storage   # 真实 storage 家族：建议与画像落盘（5 项）
npm run test:schema    # 配置 schema：volatile 字段与越界拒绝
```

测试通过 `test/resolve-host.mjs` 把宿主包解析到本机 DSH 安装，仓库里不需要 `node_modules`。

## 已知限制

- 建议在每轮正常结束后才生成，首次会有一次辅助模型往返的延迟（取决于所选模型）。
- 客户端每 900ms 轮询一次本机 `/api`，只在本机会话内产生极小开销。
- 端点未知（适配器不暴露 baseURL）时不拦外发；只有「明确是远端」才会被 `allowRemote` 拦住。
- DSH 升级若改动插槽名或 `connection.fetch` 契约，需要按新版本核对。

## 许可证

MIT

