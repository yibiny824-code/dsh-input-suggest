/**
 * 测试用解析钩子：把插件依赖的宿主包解析到正在运行的 DSH 安装。
 *
 * 插件在部署里由 DSH 的 Loader 解析依赖（落到宿主自己的 node_modules），
 * 但本地直接 node test/... 不经过那层解析。与其在 workspace 里造 node_modules
 * 软链（会污染工作区，也可能让 pnpm 误判布局），这里只在测试进程里注册 import hook：
 * 用 DSH 自己的入口做 createRequire，让 Node 按宿主的真实依赖树解析。
 *
 * 用法：node --import ./test/resolve-host.mjs test/self-test.mjs
 * 覆盖 DSH 入口：设置 DSH_BIN 指向 dsh 的 lib/bin.js。
 */
import { createRequire } from 'node:module'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const dshBin = process.env.DSH_BIN
  ?? 'E:/chatgptWork/npm-roaming/node_modules/@deepseek-ai/dsh/lib/bin.js'

const hostRequire = createRequire(dshBin)

const source = [
  'import { createRequire } from \'node:module\'',
  'import { pathToFileURL } from \'node:url\'',
  'const hostRequire = createRequire(' + JSON.stringify(dshBin) + ')',
  'export async function resolve(specifier, context, next) {',
  '  if (!specifier.startsWith("@deepseek-ai/") && specifier !== "zod") return next(specifier, context)',
  '  try {',
  '    return { url: pathToFileURL(hostRequire.resolve(specifier)).href, shortCircuit: true }',
  '  } catch {',
  '    return next(specifier, context)',
  '  }',
  '}',
].join('\n')

register('data:text/javascript,' + encodeURIComponent(source), { parentURL: import.meta.url })

// 测试文件也可以 import 本模块：用 hostRequire 把宿主包解析成 file URL。
export { hostRequire }

/** 把一个宿主包的入口解析成 file:// URL；解析根由 DSH_BIN 决定。 */
export function hostModuleUrl(name) {
  return pathToFileURL(hostRequire.resolve(name)).href
}

