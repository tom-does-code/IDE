const vscode=require('vscode');const path=require('path');const prettier=require('prettier');
const languages=['php','javascript','javascriptreact','typescript','typescriptreact','json','jsonc','html','css','scss','less','markdown','yaml'];
exports.activate=context=>{
  const provider={async provideDocumentFormattingEdits(document,options,token){
    if(document.uri.scheme!=='file'||token.isCancellationRequested)return [];
    const root=vscode.workspace.getWorkspaceFolder(document.uri);
    const info=await prettier.getFileInfo(document.uri.fsPath,{ignorePath:root?path.join(root.uri.fsPath,'.prettierignore'):undefined,withNodeModules:false});if(info.ignored)return [];
    const config=vscode.workspace.isTrusted?await prettier.resolveConfig(document.uri.fsPath,{editorconfig:true}):null;
    const plugins=(config?.plugins||[]).map(plugin=>{if(typeof plugin!=='string')return plugin;try{return require.resolve(plugin,{paths:[path.dirname(document.uri.fsPath),root?.uri.fsPath||process.cwd(),__dirname]});}catch{return plugin;}});if(document.languageId==='php')plugins.push(require.resolve('@prettier/plugin-php'));
    const parsers={php:'php',javascript:'babel',javascriptreact:'babel',typescript:'typescript',typescriptreact:'typescript',json:'json',jsonc:'jsonc',html:'html',css:'css',scss:'scss',less:'less',markdown:'markdown',yaml:'yaml'};
    try{const formatted=await prettier.format(document.getText(),{tabWidth:document.languageId==='php'?4:2,useTabs:!options.insertSpaces,...config,plugins,filepath:document.uri.fsPath,parser:parsers[document.languageId],...(document.languageId==='php'?{phpVersion:vscode.workspace.getConfiguration('intelephense').get('environment.phpVersion','8.4').split('.').slice(0,2).join('.')}: {})});if(token.isCancellationRequested||formatted===document.getText())return [];return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),formatted)];}
    catch(error){vscode.window.showWarningMessage('Prettier could not format this file: '+error.message.split('\n')[0]);return [];}
  }};
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(languages.map(language=>({language,scheme:'file'})),provider));return provider;
};
