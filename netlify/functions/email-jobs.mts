import type { Config } from '@netlify/functions'
import { runEmailJobs } from '../../server/lib/email-jobs'
export default async ()=>Response.json(await runEmailJobs())
export const config:Config={schedule:'*/10 * * * *'}
