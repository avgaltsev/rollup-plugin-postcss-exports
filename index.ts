import * as path from "path";

import {Plugin} from "rollup";
import {Glob, createFilter} from "rollup-pluginutils";

import * as postcss from "postcss";
import {AcceptedPlugin} from "postcss";

import postcssExports from "postcss-exports";
import {NameGenerator, Scope, Exports} from "postcss-exports";

import * as packageJson from "./package.json";

const PLUGIN_NAME: string = packageJson.name;

export interface CssTaker {
	(css: string): void;
}

export interface Preprocessor {
	(source: string): string | Promise<string>;
}

export interface PluginOptions {
	include?: Glob;
	exclude?: Glob;
	extensions?: string[];
	plugins?: AcceptedPlugin[];
	takeCss?: CssTaker;
	preprocess?: Preprocessor;
	generateName?: NameGenerator;
}

const MODULE_NAME = "rollup-plugin-postcss-exports-module-name";

const MODULE_SOURCE = `export default function (classData) {
	return function () {
		var mods = [];

		for (var a = 0; a < arguments.length; a++) {
			var mod = classData.mods && classData.mods[arguments[a]];

			if (mod) {
				mods.push(mod);
			}
		}

		return (classData.base ? [classData.base] : []).concat(mods).join(" ");
	}
};
`;

const HEADER_PART = `import getClass from "${MODULE_NAME}";`;

const getPart = (scope: Scope, name?: string) => {
	const classes = Object.entries(scope).map(([className, classData]) => {
		return `${className}: getClass(${JSON.stringify(classData)})`;
	}).join(",");

	return `export ${name ? `let ${name} =` : "default"} {${classes}};`;
};

const dontTakeCss: CssTaker = (css) => {};

export default (pluginOptions: PluginOptions): Plugin => {
	const filter = createFilter(pluginOptions.include, pluginOptions.exclude);

	const extensions = Array.isArray(pluginOptions.extensions) ? pluginOptions.extensions : [];
	const plugins = Array.isArray(pluginOptions.plugins) ? pluginOptions.plugins : [];
	const generateName = pluginOptions.generateName;
	const preprocess = (source: string) => Promise.resolve((typeof pluginOptions.preprocess === "function") ? pluginOptions.preprocess(source) : source);
	const takeCss = (typeof pluginOptions.takeCss === "function") ? pluginOptions.takeCss : dontTakeCss;

	const cssMap = new Map();

	return {
		name: PLUGIN_NAME,

		load(id) {
			if (id === MODULE_NAME) {
				return MODULE_SOURCE;
			}
		},

		resolveId(id) {
			if (id === MODULE_NAME) {
				return id;
			}
		},

		async transform(source, id) {
			if (!filter(id as string) || !extensions.includes(path.extname(id as string))) {
				return null;
			}

			let exports: Exports;

			const processor = postcss([...plugins, postcssExports({
				generateName,

				takeExports(result) {
					exports = result;
				},
			})]);

			const preprocessed = await preprocess(source);
			const processed = await processor.process(preprocessed, {from: id as string, to: id as string});

			cssMap.set(id, processed);

			const parts = Object.entries(exports.scopes).map(([name, scope]) => getPart(scope, name));

			return {
				code: [HEADER_PART, ...parts, getPart(exports.defaultScope)].join("\n"),
			};
		},

		ongenerate() {
			takeCss(Array.from(cssMap.values()).join("\n"));
			cssMap.clear();
		},
	};
};
