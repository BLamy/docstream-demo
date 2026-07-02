declare module "*.data" {
  const data: Blob
  export default data
}

declare module "*.wasm" {
  const wasm: WebAssembly.Module
  export default wasm
}
