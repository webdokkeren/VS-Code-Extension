var editorconfig = require('editorconfig');
var fs = require('fs');
var vscode_1 = require('vscode');
function activate(disposables) {
    var documentWatcher = new DocumentWatcher();
    var textEditorWatcher = new TextEditorWatcher(documentWatcher);
    disposables.push(documentWatcher);
    disposables.push(textEditorWatcher);
    // register a command handler to generatoe a .editorconfig file
    vscode_1.commands.registerCommand('vscode.generateeditorconfig', generateEditorConfig);
}
exports.activate = activate;
/**
 * Listens to vscode document open and maintains a map (Document => editor config settings)
 */
var DocumentWatcher = (function () {
    function DocumentWatcher() {
        var _this = this;
        var subscriptions = [];
        // Listen for new documents being openend
        vscode_1.workspace.onDidOpenTextDocument(this._onDidOpenDocument, this, subscriptions);
        // Listen for saves to ".editorconfig" files and rebuild the map
        vscode_1.workspace.onDidSaveTextDocument(function (savedDocument) {
            if (/\.editorconfig$/.test(savedDocument.getPath())) {
                // Saved an .editorconfig file => rebuild map entirely
                _this._rebuildConfigMap();
            }
        }, undefined, subscriptions);
        // dispose event subscriptons upon disposal
        this._disposable = vscode_1.Disposable.of.apply(vscode_1.Disposable, subscriptions);
        // Build the map (cover the case that documents were opened before my activation)
        this._rebuildConfigMap();
    }
    DocumentWatcher.prototype.dispose = function () {
        this._disposable.dispose();
    };
    DocumentWatcher.prototype.getSettingsForDocument = function (document) {
        return this._documentToConfigMap[document.getPath()];
    };
    DocumentWatcher.prototype._rebuildConfigMap = function () {
        var _this = this;
        this._documentToConfigMap = {};
        vscode_1.workspace.getTextDocuments().forEach(function (document) { return _this._onDidOpenDocument(document); });
    };
    DocumentWatcher.prototype._onDidOpenDocument = function (document) {
        var _this = this;
        if (document.isUntitled()) {
            // Does not have a fs path
            return;
        }
        var path = document.getPath();
        editorconfig.parse(path).then(function (config) {
            _this._documentToConfigMap[path] = config;
        });
    };
    return DocumentWatcher;
})();
/**
 * Listens to active text editor and applies editor config settings
 */
var TextEditorWatcher = (function () {
    function TextEditorWatcher(documentWatcher) {
        var _this = this;
        this._documentWatcher = documentWatcher;
        this._disposable = vscode_1.window.onDidChangeActiveTextEditor(function (textEditor) {
            if (!textEditor) {
                // No more open editors
                return;
            }
            var doc = textEditor.getTextDocument();
            var config = _this._documentWatcher.getSettingsForDocument(doc);
            if (!config) {
                // no configuration found for this file
                return;
            }
            // get current settings
            var currentSettings = textEditor.getOptions();
            // convert editorsettings values to vscode editor options
            var opts = {
                insertSpaces: config.indent_style ? (config.indent_style === 'tab' ? false : true) : currentSettings.insertSpaces,
                tabSize: config.indent_size ? config.indent_size : currentSettings.tabSize
            };
            vscode_1.window.setStatusBarMessage('EditorConfig: ' + config.indent_style + ' ' + config.indent_size, 1500);
            textEditor.setOptions(opts);
        });
    }
    TextEditorWatcher.prototype.dispose = function () {
        this._disposable.dispose();
    };
    return TextEditorWatcher;
})();
function generateEditorConfig() {
    // generate a .editorconfig file in the root of the workspace
    // based on the current editor settings and buffer properties
    // WANTS
    // cycle through all open *documents* and create a section for each type
    // pull editor settings directly, because i dont know what 'auto' actuall is
    // would like to open .editorconfig if created OR if one exists in workspace already
    var configFile = vscode_1.workspace.getPath();
    if (configFile === null) {
        vscode_1.window.showInformationMessage("Please open a folder before generating an .editorconfig file");
        return;
    }
    else {
        configFile = configFile + '/.editorconfig';
    }
    vscode_1.extensions.getConfigurationMemento('editor').getValues({}).then(function (value) {
        var indent_style = 'tab';
        var indent_size = '4';
        switch (value.insertSpaces) {
            case true:
                indent_style = 'space';
                break;
            case false:
                indent_style = 'tab';
                break;
            case 'auto':
                // this is wrong!!
                indent_style = 'space';
                break;
            default:
                break;
        }
        if (value.tabSize === 'auto') {
            indent_size = '4'; // this is wrong!
        }
        else {
            indent_size = value.tabSize;
        }
        var fileContents = "root = true\n\n[*]\nindent_style = " + indent_style + "\nindent_size = " + indent_size + "\n";
        fs.exists(configFile, function (exists) {
            if (exists) {
                vscode_1.window.showInformationMessage('An .editorconfig file already exists in your workspace.');
                return;
            }
            fs.writeFile(configFile, fileContents, function (err) {
                if (err) {
                    vscode_1.window.showErrorMessage(err.toString());
                    return;
                }
            });
        });
    }, function (reason) {
        console.log('editorConfig error: ' + reason);
    });
}
//# sourceMappingURL=editorConfigMain.js.map