var editorconfig = require('editorconfig');
var fs = require('fs');
var vscode_1 = require('vscode');
function activate(ctx) {
    var documentWatcher = new DocumentWatcher();
    ctx.subscriptions.push(documentWatcher);
    ctx.subscriptions.push(vscode_1.window.onDidChangeActiveTextEditor(function (textEditor) {
        applyEditorConfigToTextEditor(textEditor, documentWatcher);
    }));
    applyEditorConfigToTextEditor(vscode_1.window.activeTextEditor, documentWatcher);
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
        subscriptions.push(vscode_1.workspace.onDidOpenTextDocument(function (doc) { return _this._onDidOpenDocument(doc); }));
        // Listen for saves to ".editorconfig" files and rebuild the map
        subscriptions.push(vscode_1.workspace.onDidSaveTextDocument(function (savedDocument) {
            if (/\.editorconfig$/.test(savedDocument.fileName)) {
                // Saved an .editorconfig file => rebuild map entirely
                _this._rebuildConfigMap();
            }
        }));
        // dispose event subscriptons upon disposal
        this._disposable = vscode_1.Disposable.from.apply(vscode_1.Disposable, subscriptions);
        // Build the map (cover the case that documents were opened before my activation)
        this._rebuildConfigMap();
    }
    DocumentWatcher.prototype.dispose = function () {
        this._disposable.dispose();
    };
    DocumentWatcher.prototype.getSettingsForDocument = function (document) {
        return this._documentToConfigMap[document.fileName];
    };
    DocumentWatcher.prototype._rebuildConfigMap = function () {
        var _this = this;
        this._documentToConfigMap = {};
        vscode_1.workspace.textDocuments.forEach(function (document) { return _this._onDidOpenDocument(document); });
    };
    DocumentWatcher.prototype._onDidOpenDocument = function (document) {
        var _this = this;
        if (document.isUntitled) {
            // Does not have a fs path
            return;
        }
        var path = document.fileName;
        editorconfig.parse(path).then(function (config) {
            // workaround for the fact that sometimes indent_size is set to "tab":
            // see https://github.com/editorconfig/editorconfig-core-js/blob/b2e00d96fcf3be242d4bf748829b8e3a778fd6e2/editorconfig.js#L56
            if (config.indent_size === 'tab') {
                delete config.indent_size;
            }
            // console.log('storing ' + path + ' to ' + JSON.stringify(config, null, '\t'));
            _this._documentToConfigMap[path] = config;
            applyEditorConfigToTextEditor(vscode_1.window.activeTextEditor, _this);
        });
    };
    return DocumentWatcher;
})();
function applyEditorConfigToTextEditor(textEditor, provider) {
    if (!textEditor) {
        // No more open editors
        return;
    }
    var doc = textEditor.document;
    var editorconfig = provider.getSettingsForDocument(doc);
    if (!editorconfig) {
        // no configuration found for this file
        return;
    }
    var newOptions = Utils.fromEditorConfig(editorconfig, textEditor.options.insertSpaces, textEditor.options.tabSize);
    // console.log('setting ' + textEditor.document.fileName + ' to ' + JSON.stringify(newOptions, null, '\t'));
    vscode_1.window.setStatusBarMessage('EditorConfig: ' + (newOptions.insertSpaces ? "Spaces:" : "Tabs:") + ' ' + newOptions.tabSize, 1500);
    textEditor.options = newOptions;
}
/**
 * Generate an .editorconfig file in the root of the workspace based on the current vscode settings.
 */
function generateEditorConfig() {
    if (!vscode_1.workspace.rootPath) {
        vscode_1.window.showInformationMessage("Please open a folder before generating an .editorconfig file");
        return;
    }
    var editorConfigurationNode = vscode_1.workspace.getConfiguration('editor');
    var _a = Utils.toEditorConfig(editorConfigurationNode.get('insertSpaces'), editorConfigurationNode.get('tabSize')), indent_style = _a.indent_style, indent_size = _a.indent_size;
    var fileContents = "root = true\n\n[*]\nindent_style = " + indent_style + "\nindent_size = " + indent_size + "\n";
    var editorconfigFile = vscode_1.workspace.rootPath + '/.editorconfig';
    fs.exists(editorconfigFile, function (exists) {
        if (exists) {
            vscode_1.window.showInformationMessage('An .editorconfig file already exists in your workspace.');
            return;
        }
        fs.writeFile(editorconfigFile, fileContents, function (err) {
            if (err) {
                vscode_1.window.showErrorMessage(err.toString());
                return;
            }
        });
    });
}
var Utils = (function () {
    function Utils() {
    }
    /**
     * Convert .editorsconfig values to vscode editor options
     */
    Utils.fromEditorConfig = function (config, defaultInsertSpaces, defaultTabSize) {
        return {
            insertSpaces: config.indent_style ? (config.indent_style === 'tab' ? false : true) : defaultInsertSpaces,
            tabSize: config.indent_size ? config.indent_size : defaultTabSize
        };
    };
    /**
     * Convert vscode editor options to .editorsconfig values
     */
    Utils.toEditorConfig = function (configuredInsertSpaces, configuredTabSize) {
        var indent_style = 'tab';
        var indent_size = '4';
        switch (configuredInsertSpaces) {
            case true:
                indent_style = 'space';
                break;
            case false:
                indent_style = 'tab';
                break;
            case 'auto':
                indent_style = 'tab';
                break;
        }
        if (configuredTabSize !== 'auto') {
            indent_size = String(configuredTabSize);
        }
        return {
            indent_style: indent_style,
            indent_size: indent_size
        };
    };
    return Utils;
})();
exports.Utils = Utils;
//# sourceMappingURL=editorConfigMain.js.map