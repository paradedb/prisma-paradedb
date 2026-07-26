import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/exports/codec-types.ts',
    'src/exports/column-types.ts',
    'src/exports/control.ts',
    'src/exports/ddl.ts',
    'src/exports/index-types.ts',
    'src/exports/operation-types.ts',
    'src/exports/pack.ts',
    'src/exports/runtime.ts',
  ],
  dts: {
    enabled: true,
    sourcemap: true,
  },
  exports: {
    enabled: false,
  },
  skipNodeModulesBundle: true,
  sourcemap: true,
  tsconfig: 'tsconfig.prod.json',
});
