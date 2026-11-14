const fs = require('node:fs');
const path = require('node:path');
const jsonc = require('jsonc-parser');

function validName(name) { return /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name); }
function validClass(name) { return /^[A-Z][A-Za-z0-9]*(?:\\[A-Z][A-Za-z0-9]*)*$/.test(name); }
function mergeJsonc(file, changes) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}\n';
  const errors = [];
  const obj = jsonc.parse(text, errors, { allowTrailingComma: true });
  if (errors.length || !obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`Cannot safely edit ${file}: invalid JSON/JSONC.`);
  for (const [key, value] of Object.entries(changes)) {
    let next = value;
    if (Array.isArray(value)) {
      const old = obj[key] || [];
      if (!Array.isArray(old)) throw new Error(`${key} must be an array in ${file}.`);
      next = [...old];
      for (const item of value) {
        const id = item.label || item.name;
        if (!next.some(x => (x.label || x.name) === id)) next.push(item);
      }
    } else if (Object.hasOwn(obj, key)) continue;
    text = jsonc.applyEdits(text, jsonc.modify(text, [key], next, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function launchConfigurations(php, port = 8080) {
  return [
    { name: 'Forge: Debug CodeIgniter', type: 'php', request: 'launch', runtimeExecutable: php, program: '${workspaceFolder}/spark', args: ['serve', '--host', 'localhost', '--port', String(port)], cwd: '${workspaceFolder}', port: 9003, env: { XDEBUG_MODE: 'debug', XDEBUG_TRIGGER: '1' }, stopOnEntry: false },
    { name: 'Forge: Listen for Xdebug', type: 'php', request: 'launch', hostname: '127.0.0.1', port: 9003 },
    { name: 'Forge: Debug Current PHP File', type: 'php', request: 'launch', runtimeExecutable: php, program: '${file}', cwd: '${fileDirname}', port: 0, env: { XDEBUG_MODE: 'debug', XDEBUG_CONFIG: 'client_port=${port}', XDEBUG_TRIGGER: '1' } },
    { name: 'Forge: Debug PHPUnit', type: 'php', request: 'launch', runtimeExecutable: php, program: '${workspaceFolder}/vendor/phpunit/phpunit/phpunit', cwd: '${workspaceFolder}', port: 0, env: { XDEBUG_MODE: 'debug', XDEBUG_CONFIG: 'client_port=${port}', XDEBUG_TRIGGER: '1' } }
  ];
}
function taskConfigurations(php, composer, port = 8080) {
  const make = (label, args, extra = {}) => ({ label, type: 'process', command: php, args, options: { cwd: '${workspaceFolder}', env: { XDEBUG_MODE: 'off' } }, problemMatcher: [], ...extra });
  return [
    make('Forge: Serve', ['spark','serve','--host','localhost','--port',String(port)]),
    make('Forge: Routes', ['spark','routes']),
    make('Forge: PHPUnit', ['vendor/phpunit/phpunit/phpunit'], { group: { kind: 'test', isDefault: true } }),
    make('Forge: Composer install', [composer,'install']),
    make('Forge: Composer audit', [composer,'audit']),
    make('Forge: Composer validate', [composer,'validate','--strict']),
    make('Forge: Lint current file', ['-l','${file}'], { problemMatcher: { owner: 'php', fileLocation: ['absolute'], pattern: { regexp: '^(?:PHP )?(?:Parse|Fatal) error: (.*) in (.*) on line (\\d+)$', message: 1, file: 2, line: 3 } } })
  ];
}
module.exports = {validName, validClass, mergeJsonc, launchConfigurations, taskConfigurations};
