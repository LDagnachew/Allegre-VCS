import { execFile } from 'node:child_process'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { DiffResult } from '../../shared/types'

const execFileAsync = promisify(execFile)

export class DiffEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiffEngineError'
  }
}

function diffEngineBinaryName(): string {
  return process.platform === 'win32' ? 'allegrevcs-diff.exe' : 'allegrevcs-diff'
}

function bundledDiffEnginePath(): string | null {
  const bundled = path.join(
    process.resourcesPath,
    'diff-engine',
    diffEngineBinaryName(),
  )
  return fs.existsSync(bundled) ? bundled : null
}

/**
 * Resolve the allegrevcs-diff CLI.
 * Packaged apps use the PyInstaller binary in Resources/diff-engine.
 * Dev uses the monorepo venv under packages/diff-engine.
 */
export function resolveDiffEngineCommand(
  desktopRoot = process.cwd(),
): { command: string; argsPrefix: string[] } {
  if (app.isPackaged) {
    const bundled = bundledDiffEnginePath()
    if (bundled) {
      return { command: bundled, argsPrefix: [] }
    }
    throw new DiffEngineError(
      'Bundled diff engine not found. Reinstall AllegreVCS or rebuild with npm run dist.',
    )
  }

  const repoRoot = path.resolve(desktopRoot, '../..')
  const venvCli = path.join(
    repoRoot,
    'packages/diff-engine/.venv/bin/allegrevcs-diff',
  )
  if (fs.existsSync(venvCli)) {
    return { command: venvCli, argsPrefix: [] }
  }

  const packaged = path.join(
    desktopRoot,
    'resources/diff-engine',
    diffEngineBinaryName(),
  )
  if (fs.existsSync(packaged)) {
    return { command: packaged, argsPrefix: [] }
  }

  const venvPython = path.join(repoRoot, 'packages/diff-engine/.venv/bin/python')
  if (fs.existsSync(venvPython)) {
    return {
      command: venvPython,
      argsPrefix: ['-m', 'allegrevcs_diff.cli'],
    }
  }

  throw new DiffEngineError(
    'Diff engine not found. Run: cd packages/diff-engine && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"',
  )
}

export async function runDiff(
  baselinePath: string,
  modifiedPath: string,
  desktopRoot?: string,
): Promise<DiffResult> {
  const { command, argsPrefix } = resolveDiffEngineCommand(desktopRoot)
  const args = [...argsPrefix, baselinePath, modifiedPath, '--indent', '0']

  try {
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    })
    return JSON.parse(stdout) as DiffResult
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new DiffEngineError(`Diff engine failed: ${message}`)
  }
}

export async function runDiffStrings(
  baselineXml: string,
  modifiedXml: string,
  tmpDir: string,
  desktopRoot?: string,
): Promise<DiffResult> {
  fs.mkdirSync(tmpDir, { recursive: true })
  const a = path.join(tmpDir, `baseline-${Date.now()}.musicxml`)
  const b = path.join(tmpDir, `modified-${Date.now()}.musicxml`)
  fs.writeFileSync(a, baselineXml, 'utf8')
  fs.writeFileSync(b, modifiedXml, 'utf8')
  try {
    return await runDiff(a, b, desktopRoot)
  } finally {
    fs.rmSync(a, { force: true })
    fs.rmSync(b, { force: true })
  }
}
