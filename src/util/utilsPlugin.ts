import { path, Router, toml, colors, z } from "@src/mod.ts";
import * as util from "@src/util/util.ts";
import { Hooks, Endpoint } from "@src/util/types.ts";
import * as utilsSend from "@src/util/utilsSend.ts";
import * as utilsPod from "@src/util/utilsPod.ts";

export async function getPodHooks(dir: string, pluginType: string) {
	const pluginName =
		"Pod" + pluginType[0].toLocaleUpperCase() + pluginType.slice(1);

	try {
		const { onCreate, onRemove } = (await import(
			`../../../common/plugins/Core/${pluginName}/api.ts`
		)) as Hooks;

		return {
			onCreate,
			onRemove,
		};
	} catch {
		await Deno.remove(path.dirname(dir), { recursive: true });
		throw new Error(`PluginPod ${pluginName} not found`);
	}
}

export async function loadPodRoutes(router: Router) {
	const parentDir = "./common/plugins/Core";
	for await (const podDir of await Deno.readDir(parentDir)) {
		if (!podDir.name.startsWith("Pod")) continue;

		console.info(`${colors.bold("Loading:")} ${podDir.name}`);

		const tomlFile = path.join(
			Deno.cwd(),
			parentDir,
			podDir.name,
			"plugin.toml"
		);
		const endpointFile = path.join(
			Deno.cwd(),
			parentDir,
			podDir.name,
			"server-deno/endpoints.ts"
		);

		const tomlText = await Deno.readTextFile(tomlFile);
		const tomlObj = toml.parse(tomlText);
		if (!tomlObj.type) {
			console.warn(
				`Skipping plugin ${podDir.name} because its missing a 'type' property from its 'plugin.toml'`
			);
			continue;
		}

		const randomSchema = {
			req: z.object({}),
			res: z.object({}),
		};

		const subrouter = new Router();
		subrouter.get("/", utilsSend.success);

		const module = await import(endpointFile);
		for (const exprt in module) {
			if (!Object.hasOwn(module, exprt)) continue;

			const endpoint: Endpoint<typeof randomSchema> = module[exprt];

			console.info(`/pod/plugin/${tomlObj.type}${endpoint.route}`);

			subrouter.post(endpoint.route, async (ctx) => {
				const data = await util.unwrap<z.infer<typeof endpoint.schema["req"]>>(
					ctx,
					endpoint.schema.req
				);

				// TODO: better checking
				const pod = {
					type: tomlObj.type as string,
					uuid: data.uuid as string,
					dir: utilsPod.podFromUuid(data.uuid),
				};

				const result = await endpoint.api(pod, data);
				return utilsSend.json(ctx, result);
			});

			router.use(`/pod/plugin/${tomlObj.type}`, subrouter.routes());
		}
	}
}

export async function getPluginList() {
	const plugins: { name: string; type: string }[] = [];

	const dir = "./common/plugins/Core";
	for await (const file of await Deno.readDir(dir)) {
		if (file.name.startsWith("Pod")) {
			const tomlFile = path.join(dir, file.name, "plugin.toml");
			const tomlText = await Deno.readTextFile(tomlFile);
			const tomlObj = toml.parse(tomlText);

			// TODO: error handling
			plugins.push({ name: file.name, type: tomlObj.type });
		}
	}

	return plugins;
}