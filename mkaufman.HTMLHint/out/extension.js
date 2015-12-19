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
        documentSelector: ['html', 'htm'],
        synchronize: {
            configurationSection: 'htmlhint',
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/.htmlhintrc')
        }
    };
    var forceDebug = false;
    var client = new vscode_languageclient_1.LanguageClient('HTML-hint', serverOptions, clientOptions, forceDebug);
    context.subscriptions.push(new vscode_languageclient_1.SettingMonitor(client, 'htmlhint.enable').start());
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map