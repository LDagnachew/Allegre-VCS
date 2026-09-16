/// <reference types="vite/client" />

import type { AllegreApi } from '../preload/index'

declare global {
  interface Window {
    allegre: AllegreApi
  }
}

export {}
