import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Nada de console en código de la app (el build además lo elimina).
      'no-console': 'error',
      // Prohibido exponer cosas en window (AGENTS.md, ADR-0006).
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'localStorage',
          message: 'No guardar rol ni sesión en localStorage (ADR-0006).',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'No guardar rol ni sesión en localStorage (ADR-0006).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'axios', message: 'ADR-0004: usar el cliente fetch propio (src/api).' }],
        },
      ],
    },
  },
  {
    // Componentes shadcn y la tabla de rutas (declara componentes lazy) no necesitan fast refresh.
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/app/buildRoutes.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
