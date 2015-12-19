/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
/// <reference path="typings/node/node.d.ts" />
/// <reference path="typings/htmlhint/htmlhint.d.ts" />
var path = require('path');
var server = require('vscode-languageserver');
var htmlhint = require('htmlhint');
var fs = require('fs');
var stripJsonComments = require('strip-json-comments');
var settings = null;
var linter = null;
/**
 * This variable is used to cache loaded htmlhintrc objects.  It is a dictionary from path -> config object.
 * A value of null means a .htmlhintrc object didn't exist at the given path.
 * A value of undefined means the file at this path hasn't been loaded yet, or should be reloaded because it changed
 */
var htmlhintrcOptions = {};
/**
 * Given an htmlhint Error object, approximate the text range highlight
 */
function getRange(error, lines) {
    var line = lines[error.line - 1];
    var isWhitespace = false;
    var curr = error.col;
    while (curr < line.length && !isWhitespace) {
        var char = line[curr];
        isWhitespace = (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '<');
        ++curr;
    }
    if (isWhitespace) {
        --curr;
    }
    return {
        start: {
            line: error.line - 1,
            character: error.col - 1
        },
        end: {
            line: error.line - 1,
            character: curr
        }
    };
}
/**
 * Given an htmlhint.Error type return a VS Code server Diagnostic object
 */
function makeDiagnostic(problem, lines) {
    return {
        severity: server.DiagnosticSeverity.Warning,
        message: problem.message,
        range: getRange(problem, lines),
        code: problem.rule.id
    };
}
/**
 * Get the html-hint configuration settings for the given html file.  This method will take care of whether to use
 * VS Code settings, or to use a .htmlhintrc file.
 */
function getConfiguration(filePath) {
    var options;
    if (settings.htmlhint && settings.htmlhint.options && Object.keys(settings.htmlhint.options).length > 0) {
        options = settings.htmlhint.options;
    }
    else {
        options = findConfigForHtmlFile(filePath);
    }
    options = options || {};
    return options;
}
/**
 * Given the path of an html file, this function will look in current directory & parent directories
 * to find a .htmlhintrc file to use as the linter configuration.  The settings are
 */
function findConfigForHtmlFile(base) {
    var options;
    if (fs.existsSync(base)) {
        // find default config file in parent directory
        if (fs.statSync(base).isDirectory() === false) {
            base = path.dirname(base);
        }
        while (base && !options) {
            var tmpConfigFile = path.resolve(base + path.sep, '.htmlhintrc');
            // undefined means we haven't tried to load the config file at this path, so try to load it.
            if (htmlhintrcOptions[tmpConfigFile] === undefined) {
                htmlhintrcOptions[tmpConfigFile] = loadConfigurationFile(tmpConfigFile);
            }
            // defined, non-null value means we found a config file at the given path, so use it.
            if (htmlhintrcOptions[tmpConfigFile]) {
                options = htmlhintrcOptions[tmpConfigFile];
                break;
            }
            base = base.substring(0, base.lastIndexOf(path.sep));
        }
    }
    return options;
}
/**
 * Given a path to a .htmlhintrc file, load it into a javascript object and return it.
 */
function loadConfigurationFile(configFile) {
    var ruleset = null;
    if (fs.existsSync(configFile)) {
        var config = fs.readFileSync(configFile, 'utf-8');
        try {
            ruleset = JSON.parse(stripJsonComments(config));
        }
        catch (e) { }
    }
    return ruleset;
}
function getErrorMessage(err, document) {
    var result = null;
    if (typeof err.message === 'string' || err.message instanceof String) {
        result = err.message;
    }
    else {
        result = "An unknown error occured while validating file: " + server.Files.uriToFilePath(document.uri);
    }
    return result;
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
    linter = htmlhint.HTMLHint;
    var result = { capabilities: { textDocumentSync: documents.syncKind } };
    return result;
});
function doValidate(connection, document) {
    try {
        var uri = document.uri;
        var fsPath = server.Files.uriToFilePath(uri);
        var contents = document.getText();
        var lines = contents.split('\n');
        var config = getConfiguration(fsPath);
        var errors = linter.verify(contents, config);
        var diagnostics = [];
        if (errors.length > 0) {
            errors.forEach(function (each) {
                diagnostics.push(makeDiagnostic(each, lines));
            });
        }
        connection.sendDiagnostics({ uri: uri, diagnostics: diagnostics });
    }
    catch (err) {
        var message = null;
        if (typeof err.message === 'string' || err.message instanceof String) {
            message = err.message;
            throw new Error(message);
        }
        throw err;
    }
}
// A text document has changed. Validate the document.
documents.onDidChangeContent(function (event) {
    // the contents of a text document has changed
    validateTextDocument(connection, event.document);
});
// The VS Code htmlhint settings have changed. Revalidate all documents.
connection.onDidChangeConfiguration(function (params) {
    settings = params.settings;
    validateAllTextDocuments(connection, documents.all());
});
// The watched .htmlhintrc has changed. Clear out the last loaded config, and revalidate all documents.
connection.onDidChangeWatchedFiles(function (params) {
    for (var i = 0; i < params.changes.length; i++) {
        htmlhintrcOptions[server.Files.uriToFilePath(params.changes[i].uri)] = undefined;
    }
    validateAllTextDocuments(connection, documents.all());
});
connection.listen();
//# sourceMappingURL=server.js.map