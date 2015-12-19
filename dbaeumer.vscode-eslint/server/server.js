/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
var vscode_languageserver_1 = require('vscode-languageserver');
function makeDiagnostic(problem) {
    return {
        message: problem.message + " (" + problem.ruleId + ")",
        severity: convertSeverity(problem.severity),
        range: {
            start: { line: problem.line - 1, character: problem.column - 1 },
            end: { line: problem.line - 1, character: problem.column - 1 }
        }
    };
}
function convertSeverity(severity) {
    switch (severity) {
        // Eslint 1 is warning
        case 1:
            return vscode_languageserver_1.DiagnosticSeverity.Warning;
        case 2:
            return vscode_languageserver_1.DiagnosticSeverity.Error;
        default:
            return vscode_languageserver_1.DiagnosticSeverity.Error;
    }
}
var connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
var lib = null;
var settings = null;
var options = null;
var documents = new vscode_languageserver_1.TextDocuments();
// The documents manager listen for text document create, change
// and close on the connection
documents.listen(connection);
// A text document has changed. Validate the document.
documents.onDidChangeContent(function (event) {
    validateSingle(event.document);
});
connection.onInitialize(function (params) {
    var rootPath = params.rootPath;
    return vscode_languageserver_1.Files.resolveModule(rootPath, 'eslint').then(function (value) {
        if (!value.CLIEngine) {
            return new vscode_languageserver_1.ResponseError(99, 'The eslint library doesn\'t export a CLIEngine. You need at least eslint@1.0.0', { retry: false });
        }
        lib = value;
        var result = { capabilities: { textDocumentSync: documents.syncKind } };
        return result;
    }, function (error) {
        return Promise.reject(new vscode_languageserver_1.ResponseError(99, 'Failed to load eslint library. Please install eslint in your workspace folder using \'npm install eslint\' or globally using \'npm install -g eslint\' and then press Retry.', { retry: true }));
    });
});
function getMessage(err, document) {
    var result = null;
    if (typeof err.message === 'string' || err.message instanceof String) {
        result = err.message;
        result = result.replace(/\r?\n/g, ' ');
        if (/^CLI: /.test(result)) {
            result = result.substr(5);
        }
    }
    else {
        result = "An unknown error occured while validating file: " + vscode_languageserver_1.Files.uriToFilePath(document.uri);
    }
    return result;
}
function validate(document) {
    var CLIEngine = lib.CLIEngine;
    var cli = new CLIEngine(options);
    var content = document.getText();
    var uri = document.uri;
    var report = cli.executeOnText(content, vscode_languageserver_1.Files.uriToFilePath(uri));
    var diagnostics = [];
    if (report && report.results && Array.isArray(report.results) && report.results.length > 0) {
        var docReport = report.results[0];
        if (docReport.messages && Array.isArray(docReport.messages)) {
            docReport.messages.forEach(function (problem) {
                if (problem) {
                    diagnostics.push(makeDiagnostic(problem));
                }
            });
        }
    }
    // Publish the diagnostics
    return connection.sendDiagnostics({ uri: uri, diagnostics: diagnostics });
}
function validateSingle(document) {
    try {
        validate(document);
    }
    catch (err) {
        connection.window.showErrorMessage(getMessage(err, document));
    }
}
function validateMany(documents) {
    var tracker = new vscode_languageserver_1.ErrorMessageTracker();
    documents.forEach(function (document) {
        try {
            validate(document);
        }
        catch (err) {
            tracker.add(getMessage(err, document));
        }
    });
    tracker.sendErrors(connection);
}
connection.onDidChangeConfiguration(function (params) {
    settings = params.settings;
    if (settings.eslint) {
        options = settings.eslint.options || {};
    }
    // Settings have changed. Revalidate all documents.
    validateMany(documents.all());
});
connection.onDidChangeWatchedFiles(function (params) {
    // A .eslintrc has change. No smartness here.
    // Simply revalidate all file.
    validateMany(documents.all());
});
connection.listen();
//# sourceMappingURL=server.js.map