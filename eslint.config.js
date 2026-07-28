import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', '.tdd-swarm/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ARCHITECTURE.md §4.1 / §8: src/engine/ is PURE TypeScript.
  // No React imports, no Math.random() — every draw goes through the seeded PRNG.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'react-native',
                'react-native-*',
                'expo',
                'expo-*',
                '@react-native*',
              ],
              message:
                'src/engine/ is pure TypeScript (ARCHITECTURE.md §8). No React/RN/Expo imports — the engine must run headless.',
            },
            {
              group: ['firebase', 'firebase/*', '@firebase/*'],
              message: 'src/engine/ must not reach the network or backend. Keep Firebase in src/services/.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random() is banned in src/engine/ (ARCHITECTURE.md §4.1). Use the seeded mulberry32 PRNG so tests and duel replay are deterministic.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'Wall-clock time in the engine breaks deterministic replay. Pass elapsedMs in as a parameter.',
        },
      ],
    },
  },

  // No debug logging in shipped source (local gate: "No debug logging").
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },

  // Tests may use console and looser typing for fixtures.
  {
    files: ['__tests__/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
