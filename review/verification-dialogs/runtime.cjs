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
    if (specifier === 'react-native') return { ...NativeWeb, Modal: ({ visible, children }) => visible ? React.createElement(NativeWeb.View, { style: { minHeight: 260 } }, children) : null };
    if (specifier === 'react') return React;
    if (specifier === '@expo/vector-icons/Ionicons') return () => { throw new Error('Unused search icon must not render in this fixture'); };
    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), specifier);
      const resolved = path.extname(target) ? target : target + '.js';
      if (!resolved.startsWith(root + path.sep)) throw new Error('Review import escapes checkout');
      return load(path.relative(root, resolved));
    }
    throw new Error('Unexpected dialog dependency: ' + specifier);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename })(requireForReview, module, module.exports);
  return module.exports;
}
const { CheckSampleScreen } = load('src/features/cupping/components/CheckSampleScreen.js');
module.exports = { component: CheckSampleScreen, render: props => renderToStaticMarkup(React.createElement(CheckSampleScreen, props)), styles: () => NativeWeb.StyleSheet.getSheet().textContent };
