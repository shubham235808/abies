import nextConfig from 'eslint-config-next';
import prettierConfig from 'eslint-config-prettier';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'ABIES_Agent_Knowledge_Pack/**'] },
  ...nextConfig,
  prettierConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];

export default config;
