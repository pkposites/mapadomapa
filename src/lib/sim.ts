/**
 * Modo de simulação no navegador. Ligado em desenvolvimento (npm run dev) OU no build do site de
 * HOMOLOGAÇÃO (VITE_STAGING_SIM=true, definido só nesse site). O servidor valida por conta própria
 * (ver server/lib/env.ts): sem a validação lá, este interruptor sozinho não libera nada.
 */
export const STAGING = import.meta.env.VITE_STAGING_SIM === 'true'
export const SIM_MODE = import.meta.env.DEV || STAGING
