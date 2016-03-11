"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var vscodeftp = require('./vscodeftp');
var fs = require('fs');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
var client = null;
function activate(context) {
    client = new vscodeftp.VSCodeFTP(vscode.workspace.rootPath);
    var disposable = vscode.commands.registerCommand('extension.uploadFile', function () {
        vscodeFtpUploadFile();
    });
    var reloadDisposable = vscode.commands.registerCommand('extension.reloadSettings', function () {
        vscodeFtpReloadSettings();
    });
    var createDisposable = vscode.commands.registerCommand('extension.createSettings', function () {
        vscodeFtpCreateSettings();
    });
    var onSaveListener = function (event) {
        //Check if file is ignored
        if (!client.checkIgnoredFiles(event.fileName)) {
            client.uploadFile(event.fileName);
        }
    };
    var onSaveDisposable = vscode.workspace.onDidSaveTextDocument(onSaveListener);
    context.subscriptions.push(disposable);
    context.subscriptions.push(reloadDisposable);
    context.subscriptions.push(onSaveDisposable);
}
exports.activate = activate;
function deactivate() {
    console.log("..deactivating...");
}
exports.deactivate = deactivate;
function vscodeFtpUploadFile() {
    if (client.projsettings != null) {
        client.uploadFile(vscode.window.activeTextEditor.document.fileName);
    }
    else {
        vscodeFtpReloadSettings();
    }
}
function vscodeFtpCreateSettings() {
    var options = {
        prompt: "Enter the hostname for the FTP server",
        placeHolder: "ex.: x.x.x.x"
    };
    var ftpdetails = {
        hostname: "",
        username: "",
        password: "",
        target: "",
        port: 21,
        mode: "",
        ignore: Array(),
        watch: Array(),
        autoUploadOnSave: true
    };
    var hostnameThenable = vscode.window.showInputBox(options);
    hostnameThenable.then(function (value) {
        ftpdetails.hostname = value;
        var usernameThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
            prompt: "Enter the FTP username"
        });
        usernameThenable.then(function (value) {
            ftpdetails.username = value;
            var passwordThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
                prompt: "Enter the FTP password",
                password: true
            });
            passwordThenable.then(function (value) {
                ftpdetails.password = value;
                var portThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
                    prompt: "Enter the port number",
                    value: "21"
                });
                portThenable.then(function (value) {
                    ftpdetails.port = parseInt(value);
                    var remotepathThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
                        prompt: "Enter the remote path to the project directory"
                    });
                    remotepathThenable.then(function (value) {
                        ftpdetails.target = value;
                        var modeThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
                            prompt: "Enter the protocol (ftp or sftp)"
                        });
                        modeThenable.then(function (value) {
                            ftpdetails.mode = value;
                            //Add some default ignores
                            ftpdetails.ignore.push("!node_modules/**");
                            ftpdetails.ignore.push("!.ftpconfig.json");
                            ftpdetails.ignore.push("!.remote-sync.json");
                            //Create the json file
                            console.log(ftpdetails);
                            fs.writeFile(vscode.workspace.rootPath + "/.ftpconfig.json", JSON.stringify(ftpdetails, null, 4), function () {
                                vscodeFtpReloadSettings();
                                vscode.window.showInformationMessage("FTP Settings file created successfully.");
                            });
                        });
                    });
                });
            });
        });
    });
}
function vscodeFtpReloadSettings() {
    client = null;
    client = new vscodeftp.VSCodeFTP(vscode.workspace.rootPath);
}
//# sourceMappingURL=extension.js.map