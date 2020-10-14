import typescript from '@rollup/plugin-typescript';

export default [
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'cjs',
      sourcemap: true,
    },
    external: [
      '@birchill/json-equalish',
      '@birchill/normal-jp',
      'idb/with-async-ittr',
    ],
    plugins: [typescript()],
  },
];
