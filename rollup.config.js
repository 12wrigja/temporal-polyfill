import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import { env } from 'process';
import pkg from './package.json';

const isPlaygroundBuild = !!env.TEMPORAL_PLAYGROUND;
const isTest262Build = !!env.TEST262;
const isProduction = env.NODE_ENV === 'production' && !isTest262Build;
const libName = 'temporal';

function withPlugins(
  options = {
    babelConfig: undefined,
    optimize: false,
    debugBuild: true
  }
) {
  const basePlugins = [
    replace({ exclude: 'node_modules/**', 'globalThis.__debug__': options.debugBuild, preventAssignment: true }),
    commonjs(),
    nodeResolve({ preferBuiltins: false })
  ];
  if (options.babelConfig) {
    basePlugins.push(babel(options.babelConfig));
  }
  if (options.optimize) {
    basePlugins.push(terser());
  }
  return basePlugins;
}

const input = 'tsc-out/index.js';

const external = [
  // Some dependencies (e.g. es-abstract) are imported using sub-paths, so the
  // regex below will match these imports too
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {})
].map((dep) => new RegExp(dep + '*'));

function outputEntry(file, format) {
  return {
    name: libName,
    file,
    format,
    exports: 'named',
    sourcemap: true
  };
}

const es5BundleBabelConfig = {
  babelHelpers: 'bundled',
  presets: [
    [
      '@babel/preset-env',
      {
        targets: '> 0.25%, not dead, ie 11'
      }
    ]
  ]
};

let builds = [];

if (isTest262Build) {
  builds = [
    {
      input: 'tsc-out/init.js',
      output: {
        name: libName,
        file: 'dist/script.js',
        format: 'iife',
        sourcemap: true
      },
      plugins: withPlugins({
        debugBuild: false, // Test262 tests don't pass in debug builds
        babelConfig: es5BundleBabelConfig
      })
    }
  ];
} else if (isPlaygroundBuild) {
  builds = [
    {
      input: 'tsc-out/init.js',
      output: {
        name: libName,
        file: 'dist/playground.cjs',
        format: 'cjs',
        exports: 'named',
        sourcemap: true
      },
      plugins: withPlugins({
        debugBuild: true
      })
    }
  ];
} else {
  // Production / production-like builds

  // - an ES2020 CJS bundle for "main"
  // - an ES2020 ESM bundle for "module"
  // Note that all dependencies are marked as external and won't be included in
  // these bundles.
  const modernBuildDef = {
    input,
    external,
    output: [
      // ESM bundle
      outputEntry(pkg.module, 'es'),
      // CJS bundle.
      // Note that because package.json specifies "type":"module", the name of
      // this file MUST end in ".cjs" in order to be treated as a CommonJS file.
      outputEntry(pkg.main, 'cjs')
    ],
    plugins: withPlugins({
      debugBuild: !isProduction,
      optimize: isProduction
      // Here is where we could insert the JSBI -> native BigInt plugin if we
      // could find a way to provide a separate bundle for modern browsers
      // that can use native BigInt.
      // Maybe use node's exports + a user-defined condition?
      // https://nodejs.org/api/packages.html#resolving-user-conditions
    })
  };
  // A legacy build that
  // - bundles all our dependencies (big-integer) into this file
  // - transpiles down to ES5
  const legacyUMDBuildDef = {
    input,
    // UMD bundle for using in script tags, etc
    // Note that some build systems don't like reading UMD files if they end in
    // '.cjs', so this entry in package.json should end in a .js file extension.
    output: [outputEntry(pkg.browser, 'umd')],
    plugins: withPlugins({
      debugBuild: !isProduction,
      optimize: isProduction,
      babelConfig: es5BundleBabelConfig
    })
  };
  builds = [modernBuildDef, legacyUMDBuildDef];
}

export default builds;
