var path = require('path');
var vscode_1 = require('vscode');
var vscode_languageclient_1 = require('vscode-languageclient');
function activate(context) {
    // We need to go one level up since an extension compile the js code into
    // the output folder.
    var serverModulePath = path.join(__dirname, '..', 'server', 'server.js');
    var debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };
    var serverOptions = {
        run: { module: serverModulePath },
        debug: { module: serverModulePath, options: debugOptions }
    };
    var clientOptions = {
        documentSelector: ['typescript', 'typescriptreact'],
        synchronize: {
            configurationSection: 'tslint',
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/tslint.json')
        }
    };
    var client = new vscode_languageclient_1.LanguageClient('TS Linter', serverOptions, clientOptions);
    context.subscriptions.push(new vscode_languageclient_1.SettingMonitor(client, 'tslint.enable').start());
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map