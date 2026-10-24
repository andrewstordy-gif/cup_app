// U1 review/test harness only. No app entrypoint imports this file.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const React = require('react');
const NativeWeb = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
const cache = new Map();

function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  }).code;
  const requireForReview = specifier => {
    if (specifier === 'react-native') return NativeWeb;
    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), specifier);
      const resolved = path.extname(target) ? target : target + '.js';
      if (!resolved.startsWith(root + path.sep)) throw new Error('Review import escapes checkout');
      return load(path.relative(root, resolved));
    }
    if (specifier === 'react') return React;
    throw new Error('Unexpected display-component dependency: ' + specifier);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename })(
    requireForReview, module, module.exports
  );
  return module.exports;
}

const { SessionTitleSummary } = load('src/features/cupping/components/SessionTitleSummary.js');
const render = props => renderToStaticMarkup(React.createElement(SessionTitleSummary, props));
module.exports = { render, styles: () => NativeWeb.StyleSheet.getSheet().textContent };
