declare module "rollup-pluginutils" {
	export type Glob = string | string[];

	export interface Filter {
		(id: string): boolean;
	}

	export function createFilter(include: Glob, exclude: Glob): Filter;
}
