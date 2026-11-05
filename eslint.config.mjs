// Kalıcı kod denetimi (npm run lint): tanımsız adlar (bölünen modüllerdeki eksik içe aktarma gibi) ve kullanılmayan değişken/içe aktarmalar.
// Site kodu tarayıcı + worker ortamında; API işlevleri, araçlar ve testler Node'da çalışır.
import globals from 'globals';

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
};
export default [
  { ignores: ['web/lib/**', 'node_modules/**', 'pylib/**', 'web/data/**', 'web/models/**'] },
  { files: ['web/js/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.worker } }, rules },
  { files: ['api/**/*.js', 'web/test/**/*.js', 'web/test/**/*.mjs', '*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } }, rules },
  // araçlar: Node betikleri; Playwright ile çalışanların page.evaluate gövdeleri tarayıcıda koşar
  { files: ['tools/**/*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, rules },
];
