/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NET?: 'mainnet' | 'chipnet';
  readonly VITE_STAMP_VARIANT?: 'cov' | 'sig';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
