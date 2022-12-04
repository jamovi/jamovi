import { defineConfig } from 'vite';
import { resolve } from 'path';

import commonjs from 'vite-plugin-commonjs';
import vitePluginRequire from 'vite-plugin-require';

export default defineConfig(({ command, mode, ssrBuild }) => {
  console.log(command);
  let config = {
    resolve: {
      alias: {
        path: 'rollup-plugin-node-polyfills/polyfills/path',
      }
    },
    plugins: [
      {
        ...vitePluginRequire(),  // transform require()s
        apply: 'serve',
      },
      {
        ...commonjs(),           // transform module.exports
        apply: 'serve',
      }
    ],
    define: {
      'process.env': {},
      'vite': (command === 'serve'),
    },
    build: {
      rollupOptions: {
        plugins: [
          vitePluginRequire(),
          commonjs()
        ],
        input: {
          main: resolve(__dirname, 'index.html'),
          analysisui: resolve(__dirname, 'analysisui.html'),
          resultsview: resolve(__dirname, 'resultsview.html'),
        },
      }
    }
  }

  if (command != 'build')
    // rollup mangles things with this
    config['define']['global'] = 'globalThis';

  return config;
});