/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
var server = require('vscode-languageserver');
var fs = require('fs');
var settings = null;
var linter = null;
var tslintNotFound = "Failed to load tslint library. Please install tslint in your workspace\nfolder using 'npm install tslint' or 'npm install -g tslint' and then press Retry.";
// Options passed to tslint
var options = {
    formatter: "json",
    configuration: {},
    rulesDirectory: undefined,
    formattersDirectory: undefined
};
var configFile = null;
var configFileWatcher = null;
var configCache = {
    filePath: null,
    configuration: null
};
function makeDiagnostic(problem) {
    return {
        severity: server.DiagnosticSeverity.Warning,
        message: problem.failure,
        range: {
            start: {
                line: problem.startPosition.line,
                character: problem.startPosition.character
            },
            end: {
                line: problem.endPosition.line,
                character: problem.endPosition.character
            },
        },
        code: problem.ruleName,
        source: 'tslint'
    };
}
function getConfiguration(filePath, configFileName) {
    if (configCache.configuration && configCache.filePath === filePath) {
        return configCache.configuration;
    }
    configCache = {
        filePath: filePath,
        configuration: linter.findConfiguration(configFileName, filePath)
    };
    return configCache.configuration;
}
function flushConfigCache() {
    configCache = {
        filePath: null,
        configuration: null
    };
}
function getErrorMessage(err, document) {
    var errorMessage = "unknown error";
    if (typeof err.message === 'string' || err.message instanceof String) {
        errorMessage = err.message;
    }
    var fsPath = server.Files.uriToFilePath(document.uri);
    var message = "vscode-tslint: '" + errorMessage + "' while validating: " + fsPath + " stacktrace: " + err.stack;
    return message;
}
function showConfigurationFailure(conn, err) {
    var errorMessage = "unknown error";
    if (typeof err.message === 'string' || err.message instanceof String) {
        errorMessage = err.message;
    }
    var message = "vscode-tslint: Cannot read tslint configuration - '" + errorMessage + "'";
    conn.window.showInformationMessage(message);
}
function validateAllTextDocuments(connection, documents) {
    var tracker = new server.ErrorMessageTracker();
    documents.forEach(function (document) {
        try {
            validateTextDocument(connection, document);
        }
        catch (err) {
            tracker.add(getErrorMessage(err, document));
        }
    });
    tracker.sendErrors(connection);
}
function validateTextDocument(connection, document) {
    try {
        doValidate(connection, document);
    }
    catch (err) {
        connection.window.showErrorMessage(getErrorMessage(err, document));
    }
}
var connection = server.createConnection(process.stdin, process.stdout);
var documents = new server.TextDocuments();
documents.listen(connection);
connection.onInitialize(function (params) {
    var rootFolder = params.rootPath;
    return server.Files.resolveModule(rootFolder, 'tslint').
        then(function (value) {
        linter = value;
        var result = { capabilities: { textDocumentSync: documents.syncKind } };
        return result;
    }, function (error) {
        return Promise.reject(new server.ResponseError(99, tslintNotFound, { retry: true }));
    });
});
function doValidate(conn, document) {
    var uri = document.uri;
    var fsPath = server.Files.uriToFilePath(uri);
    if (!fsPath) {
        return;
    }
    var contents = document.getText();
    try {
        options.configuration = getConfiguration(fsPath, configFile);
    }
    catch (err) {
        showConfigurationFailure(conn, err);
        return;
    }
    var result;
    try {
        var tslint = new linter(fsPath, contents, options);
        result = tslint.lint();
    }
    catch (err) {
        // TO DO show an indication in the workbench
        conn.console.error(getErrorMessage(err, document));
    }
    var diagnostics = [];
    if (result.failureCount > 0) {
        var problems = JSON.parse(result.output);
        problems.forEach(function (each) {
            diagnostics.push(makeDiagnostic(each));
        });
    }
    conn.sendDiagnostics({ uri: uri, diagnostics: diagnostics });
}
// A text document has changed. Validate the document.
documents.onDidChangeContent(function (event) {
    // the contents of a text document has changed
    validateTextDocument(connection, event.document);
});
function tslintConfigurationValid() {
    try {
        documents.all().forEach(function (each) {
            var fsPath = server.Files.uriToFilePath(each.uri);
            if (fsPath) {
                getConfiguration(fsPath, configFile);
            }
        });
    }
    catch (err) {
        return false;
    }
    return true;
}
// The VS Code tslint settings have changed. Revalidate all documents.
connection.onDidChangeConfiguration(function (params) {
    flushConfigCache();
    settings = params.settings;
    if (settings.tslint) {
        options.rulesDirectory = settings.tslint.rulesDirectory || null;
        var newConfigFile = settings.tslint.configFile || null;
        if (configFile !== newConfigFile) {
            if (configFileWatcher) {
                configFileWatcher.close();
                configFileWatcher = null;
            }
            if (!fs.existsSync(newConfigFile)) {
                connection.window.showWarningMessage("The file " + newConfigFile + " refered to by 'tslint.configFile' does not exist");
                configFile = null;
                return;
            }
            configFile = newConfigFile;
            if (configFile) {
                configFileWatcher = fs.watch(configFile, { persistent: false }, function (event, fileName) {
                    validateAllTextDocuments(connection, documents.all());
                });
            }
        }
    }
    validateAllTextDocuments(connection, documents.all());
});
// The watched tslint.json has changed. Revalidate all documents, IF the configuration is valid.
connection.onDidChangeWatchedFiles(function (params) {
    flushConfigCache();
    if (tslintConfigurationValid()) {
        validateAllTextDocuments(connection, documents.all());
    }
});
connection.listen();
//# sourceMappingURL=server.js.map