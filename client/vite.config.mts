
import { defineConfig } from 'vite';
import { resolve } from 'path';

import vuejsPlugin from '@vitejs/plugin-vue';

export default defineConfig(({ command, mode, ssrBuild }) => {
  let config = {
    resolve: {
      alias: {
        path: 'rollup-plugin-node-polyfills/polyfills/path',
      }
    },
    plugins: [
      vuejsPlugin()
    ],
    define: {
      'process.env': {},
      'vite': (command === 'serve'),
    },
    build: {
      rollupOptions: {
        plugins: [

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
