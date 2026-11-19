/**
 * 安装形态守卫：插件必须能从它的安装位置解析依赖。
 *
 * 背景：profile 里的 link: 依赖是 junction，Node 会先解析到本包真实路径，
 * 再按真实路径向上找 node_modules。本包目录里缺 node_modules 时，宿主半区
 * 的 @deepseek-ai/* 与 zod 全部解析失败，插件行启动失败 —— 界面上的表现是
 * 「设置页没有这一项、输入框也没有建议」。这个测试直接 fork 一个干净的 Node
 * 进程去 import 真实入口，避免被当前进程的模块缓存掩盖。
 *
 * 用法：node test/install-shape.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

/** 用干净进程 import 真入口；带上宿主解析钩子，模拟 DSH Loader 的依赖解析。 */
function cleanImport() {
  const target = 'file:///' + join(root, 'lib', 'index.js').replace(/\\/g, '/')
  const hook = 'file:///' + join(root, 'test', 'resolve-host.mjs').replace(/\\/g, '/')
  try {
    const out = execFileSync(process.execPath, ['--import', hook, '--input-type=module', '-e',
      'import(' + JSON.stringify(target) + ').then(m => console.log("OK:" + m.name))',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: out.includes('OK:'), out: out.trim() }
  } catch (error) {
    return { ok: false, out: String(error.stderr ?? error.message).split('\n')[0] }
  }
}

check('the manifest declares a web client bundle', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.dsh?.client?.platform, 'web')
  assert.equal(typeof manifest.exports?.['./client'], 'string')
  assert.ok(existsSync(join(root, manifest.exports['./client'])), 'client bundle must exist on disk')
  assert.ok(existsSync(join(root, manifest.main)), 'host entry must exist on disk')
})

check('the host entry resolves its dependencies from the install location', () => {
  const result = cleanImport()
  assert.ok(result.ok, 'clean import failed: ' + result.out)
})

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

