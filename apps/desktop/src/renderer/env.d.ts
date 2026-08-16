import type { AllegreApi } from '../preload/index'

declare global {
  interface Window {
    allegre: AllegreApi
  }
}

export {}
