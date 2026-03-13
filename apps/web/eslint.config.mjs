import nextCoreVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  ...nextCoreVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'public/**', 'next-env.d.ts'],
  },
];
