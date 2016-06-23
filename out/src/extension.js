'use strict';
var vscode = require('vscode');
var vscodeftp = require('./ftpclient');
var fs = require('fs');
var client = null;
function activate(context) {
    client = new vscodeftp.FtpClient(vscode.workspace.rootPath);
    var disposable = vscode.commands.registerCommand('extension.uploadFile', function () {
        vscodeFtpUploadFile();
    });
    var reloadDisposable = vscode.commands.registerCommand('extension.reloadSettings', function () {
        vscodeFtpReloadSettings();
    });
    var createDisposable = vscode.commands.registerCommand('extension.createSettings', function () {
        vscodeFtpCreateSettings();
    });
    var pathDisposable = vscode.commands.registerCommand("extension.uploadPath", function () {
        vscodeFtpUploadPath();
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
// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
function vscodeFtpUploadPath() {
    if (client.clientsettings != null) {
        var options = {
            prompt: "Enter the path to the file or folder you want to upload (relative to this project)",
            placeHolder: "ex.: src/images/logo.jpg"
        };
        var path = null;
        var pathThenable = vscode.window.showInputBox(options);
        pathThenable.then(function (value) {
            if (value !== undefined) {
                path = vscode.workspace.rootPath + "/" + value;
                fs.access(path, fs.F_OK, function (err) {
                    if (err) {
                        vscode.window.showErrorMessage("Could not find file/directory: " + path);
                    }
                    else {
                        //check if this is a file or directory
                        fs.lstat(path, function (err, stats) {
                            if (stats.isDirectory()) {
                                vscode.window.showInformationMessage("VSCodeFTP does not yet support directory uploads");
                            }
                            else {
                                if (stats.isFile()) {
                                    client.uploadFile(path);
                                }
                            }
                        });
                    }
                });
            }
        });
    }
}
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
    client = new vscodeftp.FtpClient(vscode.workspace.rootPath);
}
//# sourceMappingURL=extension.js.map