let path = require("path");

let utils = require("rollup-pluginutils");

let postcss = require("postcss");
let postcssExports = require("postcss-exports");

let headerPart = `function getClass(classData) {
	return function (...mods) {
		return [classData.base, ...mods.map(function (mod) {
			return classData.mods && classData.mods[mod];
		})].filter(function (className) {
			return className;
		}).join(" ");
	}
};`;

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
		return source;
	};

	let takeCss = (typeof options.takeCss == "function") ? options.takeCss : function () {};

	let cssMap = {};

	return {
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
				processor.process(preprocess(source) || source, {from: id, to: id}).then(function (result) {
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
		},

		onwrite() {
			takeCss(Object.values(cssMap).join("\n"));
			cssMap = {};
		}
	}
};
