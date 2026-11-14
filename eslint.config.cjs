const js = require('@eslint/js');
const globals = require('globals');
module.exports = [
 { ignores: ['**/node_modules/**','**/lib/backend/**'] },
 js.configs.recommended,
 { files:['**/*.js','**/*.cjs'], languageOptions:{ecmaVersion:2023,sourceType:'commonjs',globals:{...globals.node,...globals.browser}},rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_',caughtErrors:'none'}]} }
];
