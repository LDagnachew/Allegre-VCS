import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const CANDIDATES: Record<string, string[]> = {
  darwin: [
    '/Applications/MuseScore 4.app/Contents/MacOS/mscore',
    '/Applications/MuseScore 3.app/Contents/MacOS/mscore',
    '/Applications/MuseScore.app/Contents/MacOS/mscore',
  ],
  win32: [
    'C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe',
    'C:\\Program Files\\MuseScore 3\\bin\\MuseScore3.exe',
    'C:\\Program Files (x86)\\MuseScore 3\\bin\\MuseScore3.exe',
  ],
  linux: ['mscore4portable', 'mscore4', 'mscore3', 'mscore', 'musescore4', 'musescore'],
}

export class MuseScoreNotFoundError extends Error {
  constructor(message = 'MuseScore CLI not found') {
    super(message)
    this.name = 'MuseScoreNotFoundError'
  }
}

export async function locateMuseScore(
  overridePath?: string | null,
): Promise<string | null> {
  if (overridePath && fs.existsSync(overridePath)) {
    return overridePath
  }

  const platform = process.platform
  const candidates = CANDIDATES[platform] ?? CANDIDATES.linux

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (fs.existsSync(candidate)) return candidate
    } else {
      const which = await findOnPath(candidate)
      if (which) return which
    }
  }

  return null
}

async function findOnPath(bin: string): Promise<string | null> {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(cmd, [bin])
    const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    return first && fs.existsSync(first) ? first : null
  } catch {
    return null
  }
}

export interface ConvertOptions {
  museScorePath: string
  inputPath: string
  outputPath?: string
  /** Extra args; MuseScore 4 uses `-o` for conversion. */
  timeoutMs?: number
}

/**
 * Convert via MuseScore headless CLI: `mscore -o <out> <in>`
 * Works for .mscz → .musicxml and .musicxml → .mscz.
 */
export async function convertWithMuseScore(
  options: ConvertOptions,
): Promise<string> {
  const { museScorePath, inputPath, timeoutMs = 120_000 } = options
  if (!fs.existsSync(museScorePath)) {
    throw new MuseScoreNotFoundError(`MuseScore not found at ${museScorePath}`)
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`)
  }

  const outputPath =
    options.outputPath ??
    path.join(
      os.tmpdir(),
      `allegrevcs-${Date.now()}-${path.basename(inputPath)}.musicxml`,
    )

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  // MuseScore 4 on macOS may need -j 1 and can be noisy on stderr.
  try {
    await execFileAsync(museScorePath, ['-o', outputPath, inputPath], {
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        // Avoid GUI focus issues on some macOS setups
        QT_QPA_PLATFORM:
          process.env.QT_QPA_PLATFORM ??
          (process.platform === 'linux'
            ? 'offscreen'
            : process.env.QT_QPA_PLATFORM),
      },
    })
  } catch (err) {
    // MuseScore often exits 0 with Qt noise on stderr; only fail hard if
    // conversion truly failed (no output) or the process crashed.
    if (!fs.existsSync(outputPath)) {
      throw new Error(formatMuseScoreError(err, museScorePath, inputPath))
    }
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`MuseScore conversion produced no output at ${outputPath}`)
  }

  return outputPath
}

function formatMuseScoreError(
  err: unknown,
  museScorePath: string,
  inputPath: string,
): string {
  const message = err instanceof Error ? err.message : String(err)
  const stderr =
    err && typeof err === 'object' && 'stderr' in err
      ? String((err as { stderr?: unknown }).stderr ?? '')
      : ''
  const cleaned = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('qt.') &&
        !line.includes('QML element name') &&
        !line.includes('Fontconfig error'),
    )
    .slice(0, 6)
    .join(' ')

  if (/ETIMEDOUT|timeout/i.test(message)) {
    return `MuseScore timed out converting ${path.basename(inputPath)}. Try a smaller score or reopen MuseScore once, then retry.`
  }
  if (/ENOENT/i.test(message)) {
    return `MuseScore CLI not runnable at ${museScorePath}. Use Locate MuseScore… in the top bar.`
  }
  return cleaned
    ? `MuseScore could not convert ${path.basename(inputPath)}: ${cleaned}`
    : `MuseScore could not convert ${path.basename(inputPath)}. Check that the score opens in MuseScore, then try again.`
}

export async function msczToMusicXml(
  museScorePath: string,
  msczPath: string,
): Promise<string> {
  const out = path.join(
    os.tmpdir(),
    `allegrevcs-${Date.now()}-${path.parse(msczPath).name}.musicxml`,
  )
  const converted = await convertWithMuseScore({
    museScorePath,
    inputPath: msczPath,
    outputPath: out,
  })
  return fs.readFileSync(converted, 'utf8')
}

export async function musicXmlToMscz(
  museScorePath: string,
  musicXmlPath: string,
  msczPath: string,
): Promise<void> {
  await convertWithMuseScore({
    museScorePath,
    inputPath: musicXmlPath,
    outputPath: msczPath,
  })
}
