/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
