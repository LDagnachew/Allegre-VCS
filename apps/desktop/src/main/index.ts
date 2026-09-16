import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AllegreApp } from './app-service'

const allegre = new AllegreApp()

function resolveAppIconPath(): string | null {
  const candidates = [
    join(process.resourcesPath, 'icons', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icons', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

/**
 * `dock.setIcon()` bypasses macOS app-icon sizing. Full-bleed PNGs look oversized
 * in dev. Shrink + pad so Dock weight matches other apps. Packaged builds should
 * rely on the .icns in the .app bundle instead of calling setIcon.
 */
function dockIconFromPath(iconPath: string) {
  const source = nativeImage.createFromPath(iconPath)
  if (source.isEmpty()) return null

  const size = 128
  const content = Math.round(size * 0.78)
  const resized = source.resize({
    width: content,
    height: content,
    quality: 'best',
  })

  try {
    const { width, height } = resized.getSize()
    const buf = resized.toBitmap()
    const out = Buffer.alloc(size * size * 4, 0)
    const ox = Math.floor((size - width) / 2)
    const oy = Math.floor((size - height) / 2)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4
        const di = ((y + oy) * size + (x + ox)) * 4
        out[di] = buf[si]
        out[di + 1] = buf[si + 1]
        out[di + 2] = buf[si + 2]
        out[di + 3] = buf[si + 3]
      }
    }
    return nativeImage.createFromBitmap(out, { width: size, height: size })
  } catch {
    return resized
  }
}

function createWindow(): BrowserWindow {
  const iconPath = resolveAppIconPath()
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'AllegreVCS',
    backgroundColor: '#f3ddd4',
    // Window icon matters on Windows/Linux; macOS Dock uses .icns / dock.setIcon.
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  // Only override Dock in unpackaged/dev. Packaged macOS apps already get correct
  // sizing from build/icon.icns — dock.setIcon() with a full-bleed PNG looks huge.
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    const iconPath = resolveAppIconPath()
    if (iconPath) {
      const dockIcon = dockIconFromPath(iconPath)
      if (dockIcon && !dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon)
      }
    }
  }

  const win = createWindow()
  await allegre.init(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createWindow()
      void allegre.init(next)
    }
  })
})

app.on('window-all-closed', () => {
  allegre.dispose()
  if (process.platform !== 'darwin') app.quit()
})
