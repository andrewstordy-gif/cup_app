const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');

// Run the actual local ES modules under Node with explicit native adapters.
module.exports = function projectLoader(root, mocks = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    });
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    const nativeRequire = mod.require.bind(mod);
    mod.require = request => {
      if (Object.hasOwn(mocks, request)) return mocks[request];
      if (request.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), request);
        if (fs.existsSync(`${target}.js`)) return load(`${target}.js`);
      }
      return nativeRequire(request);
    };
    cache.set(filename, mod);
    mod._compile(code, filename);
    return mod.exports;
  }
  return load;
};
