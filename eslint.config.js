import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // .tdd-swarm/ is process documentation and shell scripts, but the guard policy that
    // lives there is executable code protecting the Iron Law — it gets linted like any
    // other hook (LESSONS.md L-007).
    // `.worktrees/**` holds other agents' live checkouts. Each worktree runs this same config on
    // itself, so linting them from the root only re-lints copies whose paths no longer match the
    // patterns below — and reports other agents' in-progress work as this unit's failure.
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      '.worktrees/**',
      '.tdd-swarm/**',
      '!.tdd-swarm/**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Swarm guard hooks are CommonJS Node scripts, not app source. They are still linted —
  // a broken hook fails OPEN and silently stops protecting frozen tests (LESSONS.md L-007) —
  // but they need Node globals and the CommonJS module system.
  {
    files: ['.claude/hooks/**/*.cjs', '.cursor/hooks/**/*.cjs', '.tdd-swarm/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ARCHITECTURE.md §4.1 / §8: src/engine/ is PURE TypeScript.
  // No React imports, no Math.random() — every draw goes through the seeded PRNG.
  {
    files: ['src/engine/**/*.ts', 'src/content/**/*.ts'],
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
                'src/engine/ and src/content/ are pure TypeScript (ARCHITECTURE.md §8). No React/RN/Expo imports — this layer must run headless.',
            },
            {
              group: ['firebase', 'firebase/*', '@firebase/*'],
              message:
                'The engine/content layer must not reach the network or backend. Keep Firebase in src/services/.',
            },
          ],
        },
      ],

      // ARCHITECTURE.md §4.1: constraints and answer expressions are evaluated by a
      // small purpose-built parser, never by the JS engine. These are NOT in
      // js.configs.recommended — verified by probe, so they are declared explicitly.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // These three catch only the bindings literally named `eval` and `Function` — measured
      // 3 of 8 spellings in the T-002 test-design review. The rules below close two more
      // routes (aliasing `Function`, and `Reflect.construct(Function, …)`). Neither lint can
      // catch computed access like globalThis['ev'+'al'], so the AUTHORITATIVE guard is the
      // behavioural trap in T-002 AC-21, which poisons every route before import.
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'Wall-clock time in the engine breaks deterministic replay. Pass elapsedMs in as a parameter.',
        },
        {
          name: 'Function',
          message:
            'Referencing the Function constructor is dynamic code construction. The engine parses expressions; it never compiles them.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random() is banned in src/engine/ and src/content/ (ARCHITECTURE.md §4.1). Use the seeded mulberry32 PRNG so tests and duel replay are deterministic.',
        },
        {
          object: 'Reflect',
          property: 'construct',
          message:
            'Reflect.construct can reach the Function constructor and build code at runtime. Not permitted in the engine/content layer.',
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
