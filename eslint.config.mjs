import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginSvelte from 'eslint-plugin-svelte'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/build', '**/.svelte-kit'] },
  tseslint.configs.recommended,
  eslintPluginSvelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  // .svelte.ts (Svelte 5 rune module) 는 일반 TS 파서로 파싱해야 한다
  {
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parser: tseslint.parser
    }
  },
  {
    files: ['**/*.{tsx,svelte}'],
    rules: {
      'svelte/no-unused-svelte-ignore': 'off'
    }
  },
  // 프로젝트 베이스라인에 맞춘 규칙 조정
  {
    rules: {
      // 함수 반환 타입 명시 강제 비활성화 (inference 선호 코드베이스)
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // any 허용 (Fabric.js 이벤트 등 부득이한 케이스 다수)
      '@typescript-eslint/no-explicit-any': 'off',
      // 미사용 변수: _ prefix는 무시 (시그니처 유지용)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // electron-vite 생성 env.d.ts의 호환성
      '@typescript-eslint/triple-slash-reference': 'off',
      // 실수 감지에 유용한 기본 규칙
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
      // switch/case 안의 lexical 선언 허용 (case: { ... } 블록 스타일 사용)
      'no-case-declarations': 'off',
      // Svelte: 권장 수준은 유지하되 warn으로 강등 (CI 차단 방지)
      'svelte/no-useless-children-snippet': 'warn',
      'svelte/require-each-key': 'warn',
      // reactive 대상 아닌 내부 Map/Set은 허용
      'svelte/prefer-svelte-reactivity': 'warn'
    }
  },
  // 테스트 코드는 느슨한 규칙
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  // Svelte 5 `$props()` destructuring requires `let` (reassignable via $bindable / rune reactivity).
  // prefer-const misfires on these patterns — disable for .svelte files specifically.
  {
    files: ['**/*.svelte'],
    rules: {
      'prefer-const': 'off'
    }
  },
  eslintConfigPrettier
)
