declare module 'verovio/wasm' {
  export default function createVerovioModule(): Promise<unknown>
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown)
    setOptions(options: Record<string, unknown>): void
    loadData(data: string): boolean
    renderToSVG(page?: number): string
    getPageCount(): number
    getElementAttr(elementId: string): Record<string, string>
  }
}
