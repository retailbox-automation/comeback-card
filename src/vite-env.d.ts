/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NET?: 'mainnet' | 'chipnet';
  readonly VITE_STAMP_VARIANT?: 'cov' | 'sig';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Contract source shown on the Rules page (Vite `?raw` import). */
declare module '*.cash?raw' {
  const source: string;
  export default source;
}
