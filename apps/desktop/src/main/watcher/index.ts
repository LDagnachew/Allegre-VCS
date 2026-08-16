import { createHash } from 'node:crypto'
import fs from 'node:fs'
import chokidar, { type FSWatcher } from 'chokidar'

export function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

export class ScoreWatcher {
  private watcher: FSWatcher | null = null
  private filePath: string | null = null

  start(filePath: string, onChange: (hash: string) => void): void {
    this.stop()
    this.filePath = filePath

    this.watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100,
      },
    })

    const emit = (): void => {
      if (!this.filePath || !fs.existsSync(this.filePath)) return
      try {
        onChange(hashFile(this.filePath))
      } catch {
        // File may be mid-write
      }
    }

    this.watcher.on('change', emit)
    this.watcher.on('add', emit)
  }

  stop(): void {
    void this.watcher?.close()
    this.watcher = null
    this.filePath = null
  }

  currentHash(): string | null {
    if (!this.filePath || !fs.existsSync(this.filePath)) return null
    return hashFile(this.filePath)
  }
}
