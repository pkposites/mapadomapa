import type { Config, Context } from '@netlify/functions'
import { handleApi } from '../../server/handler'

// Toda a API (/api/*) passa por aqui. A lógica fica em /server (testável sem a Netlify).
export default async (req: Request, context: Context) =>
  handleApi(req, { ip: context.ip })

export const config: Config = { path: '/api/*' }
