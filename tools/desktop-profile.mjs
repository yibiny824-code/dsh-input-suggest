#!/usr/bin/env node
/**
 * 把本包装进一个 DSH profile（默认：Electron 应用的 desktop profile）。
 *
 * 与 pnpm 自己 add <本地路径> 的结果一致：
 *   1. 备份 profile 的 package.json；
 *   2. 在 profile 的 node_modules 里建一个指向本包的 junction（pnpm 的 link: 布局）；
 *   3. 在 package.json 的 dependencies 里写 link:<本包绝对路径>；
 *   4. 把本包名追加到 dsh.profile.bundles。
 *
 * 用法：
 *   node tools/desktop-profile.mjs status
 *   node tools/desktop-profile.mjs install
 *   node tools/desktop-profile.mjs uninstall
 *
 * 选项：
 *   --profile-dir <dir>   profile 目录，默认 %DSH_HOME%/profiles/desktop
 *   --package <dir>       本包目录，默认本文件的上上级目录
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 解析 --flag value 形式的参数。 */
function option(name, fallback) {
  const index = process.argv.indexOf('--' + name)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}

/** 本包名（从 package.json 读）。 */
function readPackageName() {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  if (typeof manifest.name !== 'string' || manifest.name === '') throw new Error('not a named package: ' + packageDir)
  return manifest.name
}

const PACKAGE_NAME = readPackageName()
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = resolve(option('profile-dir', join(home, 'profiles', 'desktop')))
const sourceDir = resolve(option('package', packageDir))
const manifestPath = join(profileDir, 'package.json')
const linkPath = join(profileDir, 'node_modules', PACKAGE_NAME)

function readManifest() {
  if (!existsSync(manifestPath)) throw new Error('profile manifest not found: ' + manifestPath)
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function writeManifest(manifest) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  copyFileSync(manifestPath, manifestPath + '.bak-' + PACKAGE_NAME + '-' + stamp)
  const temporary = manifestPath + '.plugin-tmp'
  writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  renameSync(temporary, manifestPath)
  return manifestPath + '.bak-' + PACKAGE_NAME + '-' + stamp
}

function linkSpec() {
  return 'link:' + sourceDir.replace(/\\/g, '/')
}

/** Windows 上 Node 读不了 junction，所以穿过路径读 package.json 认身份。 */
function linkState() {
  if (!existsSync(linkPath)) return { exists: false, ours: false }
  try {
    const name = JSON.parse(readFileSync(join(linkPath, 'package.json'), 'utf8')).name
    return { exists: true, ours: name === PACKAGE_NAME, name }
  } catch {
    return { exists: true, ours: false, name: undefined }
  }
}

/**
 * 本包自己的依赖解析入口。
 *
 * 关键：profile 里的 link: 依赖是一个 junction，Node 会先解析到本包的真实路径
 * （E:\DeepseekHarness\dsh-input-suggest），再按真实路径向上找 node_modules。
 * 若本包目录里没有 node_modules，宿主半区的 @deepseek-ai/* 与 zod 会全部解析失败，
 * 整个插件行启动失败 —— 表现为「设置页里没有这一项、输入框也没有建议」。
 * 所以安装时必须一并准备这个入口。
 */
const resolveLinkPath = join(sourceDir, 'node_modules')

/** 找一个能提供 @deepseek-ai 的目录作为解析目标。 */
function hostModulesDir() {
  const candidates = [
    join(profileDir, 'node_modules'),
    join(dirname(profileDir), 'node_modules'),
  ]
  for (const candidate of candidates) {
    if (existsSync(join(candidate, '@deepseek-ai'))) return candidate
  }
  return undefined
}

/** 建立（或校验）本包的依赖解析链接。 */
function ensureResolveLink() {
  const host = hostModulesDir()
  if (host === undefined) return 'host-modules-absent'
  if (existsSync(resolveLinkPath)) {
    const target = join(resolveLinkPath, '@deepseek-ai')
    return existsSync(target) ? 'unchanged' : 'occupied'
  }
  try {
    symlinkSync(host, resolveLinkPath, 'junction')
    return 'created'
  } catch (error) {
    return 'failed: ' + error.message
  }
}

function ensureLink() {
  const state = linkState()
  if (state.ours) return 'unchanged'
  if (state.exists) throw new Error(linkPath + ' already exists and is not ' + PACKAGE_NAME + '; refusing to overwrite')
  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(sourceDir, linkPath, 'junction')
  return 'created'
}

function removeLink() {
  const state = linkState()
  if (!state.exists) return 'absent'
  if (!state.ours) throw new Error(linkPath + ' is not a mount of ' + PACKAGE_NAME + '; refusing to delete')
  try {
    rmdirSync(linkPath)
  } catch {
    unlinkSync(linkPath)
  }
  if (!existsSync(join(sourceDir, 'package.json'))) throw new Error('the package itself disappeared: ' + sourceDir)
  return 'removed'
}

function report(manifest) {
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const link = linkState()
  console.log([
    'package        : ' + PACKAGE_NAME + ' (' + sourceDir + ')',
    'profile        : ' + profileDir,
    'dependency     : ' + (manifest.dependencies?.[PACKAGE_NAME] ?? '(absent)'),
    'resolution     : ' + (existsSync(join(resolveLinkPath, '@deepseek-ai')) ? 'linked' : 'MISSING (plugin will fail to load)'),
    'bundle         : ' + (bundles.includes(PACKAGE_NAME) ? 'selected' : '(absent)'),
    'node_modules   : ' + (link.exists ? (link.ours ? 'mounted' : 'occupied by ' + (link.name ?? 'an unreadable entry')) : '(absent)'),
  ].join('\n'))
}

const command = process.argv[2] ?? 'status'

if (command === 'status') {
  report(readManifest())
} else if (command === 'install') {
  const manifest = readManifest()
  const before = JSON.stringify(manifest)
  manifest.dependencies = { ...(manifest.dependencies ?? {}), [PACKAGE_NAME]: linkSpec() }
  manifest.dsh = { ...(manifest.dsh ?? {}) }
  manifest.dsh.profile = { ...(manifest.dsh.profile ?? {}) }
  const bundles = [...(manifest.dsh.profile.bundles ?? [])]
  if (!bundles.includes(PACKAGE_NAME)) bundles.push(PACKAGE_NAME)
  manifest.dsh.profile.bundles = bundles
  const changed = JSON.stringify(manifest) !== before
  const backup = changed ? writeManifest(manifest) : undefined
  const link = ensureLink()
  console.log('install: manifest ' + (changed ? 'updated' : 'already current') + (backup === undefined ? '' : ' (backup: ' + backup + ')') + ', junction ' + link)
  // 依赖解析链接：没有它，宿主半区在真实路径下解析不到 @deepseek-ai/* 与 zod。
  const resolveLink = ensureResolveLink()
  console.log('dependencies : ' + resolveLink + (resolveLink === 'created' ? ' (linked ' + hostModulesDir() + ')' : ''))
  if (resolveLink === 'host-modules-absent' || resolveLink === 'occupied' || resolveLink.startsWith('failed')) {
    console.log('注意：依赖解析链接未建立，插件会在启动时报 ERR_MODULE_NOT_FOUND（设置页不会出现）。')
  }
  report(JSON.parse(readFileSync(manifestPath, 'utf8')))
  console.log('\n下一步：重启一次桌面端，然后刷新界面。')
} else if (command === 'uninstall') {
  const manifest = readManifest()
  delete manifest.dependencies?.[PACKAGE_NAME]
  if (Array.isArray(manifest.dsh?.profile?.bundles)) {
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((entry) => entry !== PACKAGE_NAME)
  }
  const backup = writeManifest(manifest)
  const link = removeLink()
  console.log('uninstall: manifest updated (backup: ' + backup + '), junction ' + link)
} else {
  throw new Error('unknown command: ' + command + ' (expected status | install | uninstall)')
}

