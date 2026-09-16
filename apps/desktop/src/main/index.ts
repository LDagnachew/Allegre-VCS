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

function createWindow(): BrowserWindow {
  const iconPath = resolveAppIconPath()
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'AllegreVCS',
    backgroundColor: '#f3ddd4',
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
  const iconPath = resolveAppIconPath()
  if (process.platform === 'darwin' && app.dock && iconPath) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath))
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
