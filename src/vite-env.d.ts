/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ID do Meta Pixel (público, aparece no código da página). */
  readonly VITE_META_PIXEL_ID?: string
  /** Chave PÚBLICA do widget Turnstile (opcional). */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
