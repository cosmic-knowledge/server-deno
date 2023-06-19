import { Application, Router, fetchRequestHandler } from '@server/mod.ts'

import { validateSystem, initializePlugins, createContext, yieldTrpcRouter, yieldOakRouter } from '@server/init.ts'
import {
	handleErrors,
	handleLogs,
	handleAssets,
	handle404,
} from '@server/helpers/middleware.ts'

await validateSystem()
await initializePlugins()

const app = new Application()
const router = new Router()
const oakRouter = yieldOakRouter()

router.use(handleErrors)
router.use(handleLogs)
router.use(handleAssets)
router.all('/trpc/(.*)', async (ctx) => {
	const res = await fetchRequestHandler({
		endpoint: '/trpc',
		req: new Request(ctx.request.url, {
			headers: ctx.request.headers,
			body:
				ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD'
					? ctx.request.body({ type: 'stream' }).value
					: void 0,
			method: ctx.request.method,
		}),
		router: yieldTrpcRouter(),
		createContext,
		onError({ error }) {
			console.error(error)
		},
	})

	ctx.response.status = res.status
	ctx.response.headers = res.headers
	ctx.response.body = res.body
})
router.use('/api', oakRouter.routes())
router.use('/api', oakRouter.allowedMethods())
router.get('/(.*)', handle404)

app.use(router.routes())
app.use(router.allowedMethods())
app.addEventListener('listen', (ev) => {
	console.info(`Listening on http://localhost:${ev.port}`)
})
await app.listen({ port: 15_800 })
