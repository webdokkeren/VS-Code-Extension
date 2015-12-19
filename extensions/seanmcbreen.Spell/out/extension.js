var vscode_1 = require('vscode');
var t = require('teacher');
var fs = require('fs');
// GLOBALS ///////////////////
var settings;
var problems = [];
var CONFIGFILE = vscode_1.workspace.rootPath + "/.vscode/spell.json";
// Activate the extension
function activate(disposables) {
    console.log("Spell and Grammar checker active...");
    // TODO [p2] Currently the only way to refresh is to reload window add a wacher
    settings = readSettings();
    vscode_1.commands.registerCommand('Spell.suggestFix', suggestFix);
    vscode_1.commands.registerCommand('Spell.changeLanguage', changeLanguage);
    // Link into the two critical lifecycle events
    vscode_1.workspace.onDidChangeTextDocument(function (event) {
        CreateDiagnostics(event.document);
    }, undefined, disposables);
    vscode_1.workspace.onDidOpenTextDocument(function (event) {
        CreateDiagnostics(event);
    }, undefined, disposables);
}
exports.activate = activate;
// Itterate through the errors and populate the diagnostics
function CreateDiagnostics(document) {
    var diagnostics = [];
    var spellingErrors = vscode_1.languages.createDiagnosticCollection("spelling");
    var docToCheck = document.getText();
    // clear existing problems
    problems = [];
    // the spell checker ignores a lot of chars so removing them aids in problem matching
    docToCheck = docToCheck.replace(/[`\"!#$%&()*+,.\/:;<=>?@\[\]\\^_{|}]/g, " ");
    if (settings.languageIDs.indexOf(document.languageId) !== -1) {
        spellcheckDocument(docToCheck, function (problems) {
            for (var x = 0; x < problems.length; x++) {
                var problem = problems[x];
                var lineRange = new vscode_1.Range(problem.startLine, problem.startChar, problem.endLine, problem.endChar);
                var loc = new vscode_1.Location(document.uri, lineRange);
                var diag = new vscode_1.Diagnostic(lineRange, problem.message, convertSeverity(problem.type));
                diagnostics.push(diag);
            }
            spellingErrors.set(document.uri, diagnostics);
        });
    }
}
// when on an error suggest fixes
// TODO: [p2] This should really use a quickfix/lighbulb and not a QuickPick
function suggestFix() {
    var opts = { matchOnDescription: true, placeHolder: "Here's a suggestion or two for..." };
    var items = [];
    var e = vscode_1.window.activeTextEditor;
    var d = e.document;
    var sel = e.selection;
    if (settings.languageIDs.indexOf(d.languageId) !== -1) {
        // TODO [p1] need to actually use the error context i.e. diagnostic start and end in the current location
        // The issue is that some grammar errors will be multiple words currently I just ignore them
        var wordRange = d.getWordRangeAtPosition(sel.active);
        var word = d.getText(wordRange);
        // find the key data for the specific issue
        var problem = problems.filter(function (obj) {
            return obj.error === word;
        })[0];
        if (problem !== undefined) {
            if (problem.suggestions.length > 0) {
                for (var i = 0; i < problem.suggestions.length; i++) {
                    items.push({ label: problem.suggestions[i], description: "Replace [" + word + "] with [" + problem.suggestions[i] + "]" });
                }
            }
            else {
                items.push({ label: null, description: "No suggestions available sorry..." });
            }
        }
        else {
            items.push({ label: null, description: "No suggestions available sorry..." });
        }
        items.push({ label: "ADD TO IGNORE LIST", description: "Add [" + word + "] to ignore list." });
        // replace the text with the selection
        vscode_1.window.showQuickPick(items).then(function (selection) {
            if (!selection)
                return;
            if (selection.label === "ADD TO IGNORE LIST") {
                settings.ignoreWordsList.push(word);
                updateSettings();
                CreateDiagnostics(vscode_1.window.activeTextEditor.document);
            }
            else {
                if (selection.label !== null) {
                    e.edit(function (edit) {
                        edit.replace(wordRange, selection.label);
                    });
                }
            }
        });
    }
    else {
        vscode_1.window.showInformationMessage("LanguageID: " + d.languageId + " not suported for spell checking.");
    }
}
// HELPER Get options from the settings file if one exists, otherwise use defaults
function readSettings() {
    var cfg = readJsonFile(CONFIGFILE);
    function readJsonFile(file) {
        try {
            cfg = JSON.parse(fs.readFileSync(file).toString());
        }
        catch (err) {
            cfg = JSON.parse('{\
                                "version": "0.1.0", \
                                "language": "en", \
                                "ignoreWordsList": [], \
                                "mistakeTypeToStatus": { \
                                    "Spelling": "Error", \
                                    "Passive Voice": "Warning", \
                                    "Complex Expression": "Warning",\
                                    "Hyphen Required": "Error"\
                                    },\
                                "languageIDs": ["markdown","text"]\
                              }');
        }
        //gracefully handle new fields
        if (cfg.languageIDs === undefined)
            cfg.languageIDs = ["markdown"];
        if (cfg.language === undefined)
            cfg.language = "en";
        return cfg;
    }
    return {
        language: cfg.language,
        ignoreWordsList: cfg.ignoreWordsList,
        mistakeTypeToStatus: cfg.mistakeTypeToStatus,
        languageIDs: cfg.languageIDs
    };
}
function updateSettings() {
    fs.writeFileSync(CONFIGFILE, JSON.stringify(settings));
}
// HELPER Map the mistake types to VS Code Diagnostic severity settings
function convertSeverity(mistakeType) {
    var mistakeTypeToStatus = settings.mistakeTypeToStatus;
    switch (mistakeTypeToStatus[mistakeType]) {
        case "Warning":
            return vscode_1.DiagnosticSeverity.Warning;
            break;
        case "Information":
            return vscode_1.DiagnosticSeverity.Information;
            break;
        case "Error":
            return vscode_1.DiagnosticSeverity.Error;
            break;
        case "Hint":
            return vscode_1.DiagnosticSeverity.Hint;
            break;
        default:
            return vscode_1.DiagnosticSeverity.Information;
            break;
    }
}
// Take in a text doc and produce the set of problems for both the editor action and actions
// teacher does not return a line number and results are not in order - so a lot of the code is about 'guessing' a line number
function spellcheckDocument(content, cb) {
    var problemMessage;
    var detectedErrors = {};
    var teach = new t.Teacher(settings.language);
    teach.check(content, function (err, docProblems) {
        if (docProblems != null) {
            for (var i = 0; i < docProblems.length; i++) {
                if (settings.ignoreWordsList.indexOf(docProblems[i].string) === -1) {
                    var problem = docProblems[i];
                    var problemTXT = problem.string;
                    var problemPreContext = (typeof problem.precontext !== "object") ? problem.precontext + " " : "";
                    var problemWithPreContent = problemPreContext + problemTXT;
                    var problemSuggestions = [];
                    var startPosInFile = -1;
                    // Check to see if this error has been seen before use the full context for improved uniqueness
                    // This is required as the same error can show up multiple times in a single doc - catch em all
                    if (detectedErrors[problemWithPreContent] > 0) {
                        startPosInFile = nthOccurrence(content, problemTXT, problemPreContext, detectedErrors[problemWithPreContent] + 1);
                    }
                    else {
                        startPosInFile = nthOccurrence(content, problemTXT, problemPreContext, 1);
                    }
                    if (startPosInFile !== -1) {
                        var linesToMistake = content.substring(0, startPosInFile).split('\n');
                        var numberOfLinesToMistake = linesToMistake.length - 1;
                        if (!detectedErrors[problemWithPreContent])
                            detectedErrors[problemWithPreContent] = 1;
                        else
                            ++detectedErrors[problemWithPreContent];
                        // make the suggestions an array even if only one is returned
                        if (String(problem.suggestions) !== "undefined") {
                            if (Array.isArray(problem.suggestions.option))
                                problemSuggestions = problem.suggestions.option;
                            else
                                problemSuggestions = [problem.suggestions.option];
                        }
                        problems.push({
                            error: problemTXT,
                            preContext: problemPreContext,
                            startLine: numberOfLinesToMistake,
                            startChar: linesToMistake[numberOfLinesToMistake].length,
                            endLine: numberOfLinesToMistake,
                            endChar: linesToMistake[numberOfLinesToMistake].length + problemTXT.length,
                            type: problem.description,
                            message: problem.description + " [" + problemTXT + "] - suggest [" + problemSuggestions.join(", ") + "]",
                            suggestions: problemSuggestions
                        });
                    }
                }
            }
            cb(problems);
        }
    });
}
// HELPER recursive function to find the nth occurance of a string in an array
function nthOccurrence(content, problem, preContext, occuranceNo) {
    var firstIndex = -1;
    var regex = new RegExp(preContext + "[ ]*" + problem, "g");
    var m = regex.exec(content);
    if (m !== null) {
        var matchTXT = m[0];
        // adjust for any precontent and padding
        firstIndex = m.index + m[0].match(/^\s*/)[0].length;
        if (preContext !== "") {
            var regex2 = new RegExp(preContext + "[ ]*", "g");
            var m2 = regex2.exec(matchTXT);
            firstIndex += m2[0].length;
        }
    }
    var lengthUpToFirstIndex = firstIndex + 1;
    if (occuranceNo == 1) {
        return firstIndex;
    }
    else {
        var stringAfterFirstOccurrence = content.slice(lengthUpToFirstIndex);
        var nextOccurrence = nthOccurrence(stringAfterFirstOccurrence, problem, preContext, occuranceNo - 1);
        if (nextOccurrence === -1) {
            return -1;
        }
        else {
            return lengthUpToFirstIndex + nextOccurrence;
        }
    }
}
function getLanguageDescription(initial) {
    switch (initial) {
        case "en":
            return "English";
            break;
        case "fr":
            return "French";
            break;
        case "de":
            return "German";
            break;
        case "pt":
            return "Portuguese";
            break;
        case "es":
            return "Spanish";
            break;
        default:
            return "English";
            break;
    }
}
function changeLanguage() {
    var items = [];
    items.push({ label: getLanguageDescription("en"), description: "en" });
    items.push({ label: getLanguageDescription("fr"), description: "fr" });
    items.push({ label: getLanguageDescription("de"), description: "de" });
    items.push({ label: getLanguageDescription("pt"), description: "pt" });
    items.push({ label: getLanguageDescription("es"), description: "es" });
    var index;
    for (var i = 0; i < items.length; i++) {
        var element = items[i];
        if (element.description == settings.language) {
            index = i;
            break;
        }
    }
    items.splice(index, 1);
    // replace the text with the selection
    vscode_1.window.showQuickPick(items).then(function (selection) {
        if (!selection)
            return;
        settings.language = selection.description;
        updateSettings();
        CreateDiagnostics(vscode_1.window.activeTextEditor.document);
    });
}
//# sourceMappingURL=extension.js.map