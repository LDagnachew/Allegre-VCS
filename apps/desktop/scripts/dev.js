#!/usr/bin/env node
/**
 * Cursor (and some CI) set ELECTRON_RUN_AS_NODE=1, which makes
 * require('electron') return a binary path string instead of the API.
 */
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('node:child_process')
const path = require('node:path')

const bin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite',
)

const child = spawn(bin, ['dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

child.on('exit', (code) => process.exit(code ?? 0))
