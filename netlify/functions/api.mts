import type { Context } from '@netlify/functions'
import { handleApi } from '../../server/handler'

// Toda a API passa por aqui. O endereço público /api/* é encaminhado para esta função
// por uma regra de redirecionamento no netlify.toml (a mais específica, antes do fallback do SPA).
// A lógica fica em /server, testável sem a Netlify.
export default async (req: Request, context: Context) => handleApi(req, { ip: context.ip })
