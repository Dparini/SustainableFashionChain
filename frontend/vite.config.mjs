import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['REACT_APP_', 'API_']);
  return {
    plugins: [{
      name: 'jsx-in-js',
      enforce: 'pre',
      async transform(code, id) {
        if (/\/src\/.*\.js$/.test(id)) {
          return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
        }
      },
    }],
    define: {
      'process.env.REACT_APP_API_URL': JSON.stringify(env.REACT_APP_API_URL || ''),
    },
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
    server: { proxy: { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:3001' } },
    build: {
      outDir: 'build',
      rollupOptions: {
        onwarn(warning, warn) {
          // This is a client-only SPA: React server-component boundaries have no effect.
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
          warn(warning);
        },
      },
    },
    test: { environment: 'jsdom', globals: true },
  };
});
