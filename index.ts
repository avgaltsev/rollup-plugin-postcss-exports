import * as path from "path";

import {Plugin} from "rollup";
import {Glob, createFilter} from "rollup-pluginutils";

import * as postcss from "postcss";
import {AcceptedPlugin} from "postcss";

import postcssExports from "postcss-exports";
import {NameGenerator, Scope} from "postcss-exports";

import * as packageJson from "./package.json";

const PLUGIN_NAME: string = packageJson.name;

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

const getExportPart = (scope: Scope) => {
	const classes = Object.entries(scope).map(([className, classData]) => {
		return `${className}: getClass(${JSON.stringify(classData)})`;
	}).join(",");

	return `export default {${classes}};`;
};

const dontTakeCss: CssTaker = (css) => {};

export default (pluginOptions: PluginOptions): Plugin => {
	const filter = createFilter(pluginOptions.include, pluginOptions.exclude);

	const extensions = Array.isArray(pluginOptions.extensions) ? pluginOptions.extensions : [];
	const plugins = Array.isArray(pluginOptions.plugins) ? pluginOptions.plugins : [];

	const generateName = pluginOptions.generateName;
	const takeCss = (typeof pluginOptions.takeCss === "function") ? pluginOptions.takeCss : dontTakeCss;
	const preprocess = (source: string) => Promise.resolve((typeof pluginOptions.preprocess === "function") ? pluginOptions.preprocess(source) : source);

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
			if (!filter(id) || !extensions.includes(path.extname(id))) {
				return null;
			}

			let scope: Scope;

			const processor = postcss(...plugins, postcssExports({
				generateName,

				takeScope(result) {
					scope = result;
				},
			}));

			const preprocessed = await preprocess(source);
			const processed = await processor.process(preprocessed, {from: id, to: id});

			cssMap.set(id, processed);

			return {
				code: [HEADER_PART, getExportPart(scope)].join("\n"),
			};
		},

		ongenerate() {
			takeCss(Array.from(cssMap.values()).join("\n"));
			cssMap.clear();
		},
	};
};
