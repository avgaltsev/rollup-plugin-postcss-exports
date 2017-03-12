let path = require("path");

let utils = require("rollup-pluginutils");

let postcss = require("postcss");
let postcssExports = require("postcss-exports");

let moduleName = "long-unique-name-for-our-secret-purposes";

let moduleSource = `export default function (classData) {
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
};`;

let headerPart = `import getClass from "${moduleName}";`;

function getPart(scope, name) {
	let classes = Object.entries(scope).map(function ([className, classData]) {
		return `${className}: getClass(${JSON.stringify(classData)})`;
	}).join(",");

	return `export ${name ? `let ${name} =` : "default"} {${classes}};`;
}

module.exports = function (options = {}) {
	let filter = utils.createFilter(options.include, options.exclude);

	let extensions = Array.isArray(options.extensions) ? options.extensions : [];

	let plugins = Array.isArray(options.plugins) ? options.plugins : [];

	let generateName = options.generateName;

	let preprocess = (typeof options.preprocess == "function") ? options.preprocess : function (source) {
		return Promise.resolve(source);
	};

	let takeCss = (typeof options.takeCss == "function") ? options.takeCss : function () {};

	let cssMap = {};

	return {
		resolveId(importee, importer) {
			if (importee === moduleName) {
				return importee;
			}
		},

		load(id) {
			if (id === moduleName) {
				return moduleSource;
			}
		},

		transform(source, id) {
			if (!filter(id) || !extensions.includes(path.extname(id))) {
				return null;
			}

			let exports;

			let processor = postcss([...plugins, postcssExports({
				generateName,

				takeExports(result) {
					exports = result;
				}
			})]);

			return new Promise(function (resolve, reject) {
				preprocess(source).then((output) => {
					return processor.process(output, {from: id, to: id}).then(function (result) {
						cssMap[id] = result;

						let parts = Object.entries(exports.scopes).map(function (name, scope) {
							return getPart(scope, name);
						});

						resolve({
							code: [headerPart, ...parts, getPart(exports.defaultScope)].join("\n"),
							map: {mappings: ""}
						});
					});
				});
			});
		},

		ongenerate(options, bundle) {
			takeCss(Object.values(cssMap).join("\n"));
			cssMap = {};
		}
	}
};
