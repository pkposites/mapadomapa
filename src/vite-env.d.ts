/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** ID do Meta Pixel (público, aparece no código da página). */
  readonly VITE_META_PIXEL_ID?: string
  /** Só no build de HOMOLOGAÇÃO: liga os simuladores (SMS, CAPTCHA, Pixel). Nunca definir em produção. */
  readonly VITE_STAGING_SIM?: string
  /** Chave PÚBLICA do widget Turnstile (opcional). */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
