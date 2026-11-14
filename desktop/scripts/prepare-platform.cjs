const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');
const drives=path.join(root,'node_modules/drivelist/js/index.js');
if(!fs.existsSync(drives+'.original'))fs.copyFileSync(drives,drives+'.original');
fs.copyFileSync(path.join(__dirname,'windows-drives.cjs'),drives);
const ffmpeg=path.join(root,'node_modules/@theia/ffmpeg/lib/ffmpeg.js');
let content=fs.readFileSync(ffmpeg,'utf8');
content=content.replace('return _loadFfmpegNativeAddon().codecs(ffmpegPath);', `return JSON.parse(require('child_process').execFileSync('py', ['-3', ${JSON.stringify(path.join(__dirname,'inspect-codecs.py'))}, ffmpegPath], {encoding:'utf8',windowsHide:true,timeout:15000}));`);
fs.writeFileSync(ffmpeg,content);
console.log('Windows drive discovery and real FFmpeg decoder inspection configured.');
// Theia 1.77's completion command incorrectly passes zero-based coordinates to Monaco.
const commandsFile=path.join(root,'node_modules/@theia/plugin-ext-vscode/lib/browser/plugin-vscode-commands-contribution.js');
let commands=fs.readFileSync(commandsFile,'utf8');
commands=commands.replace('{ lineNumber: position.line, column: position.character }','{ lineNumber: position.line + 1, column: position.character + 1 }');
fs.writeFileSync(commandsFile,commands);
