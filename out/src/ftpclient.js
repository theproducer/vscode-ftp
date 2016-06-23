"use strict";
var vscode = require('vscode');
var fs = require('fs');
var Gaze = require('gaze').Gaze;
var Glob = require('glob');
var Globule = require('globule');
var ftpclient = require('ftp');
var sftpclient = require('ssh2').Client;
var ClientSettings = (function () {
    function ClientSettings() {
    }
    return ClientSettings;
}());
var FtpClient = (function () {
    function FtpClient(projectpath) {
        this.projectdir = projectpath;
        this.queuedelay = 1000;
        var settings = new ClientSettings();
        var settingsfile = Glob.sync(this.projectdir + "/.ftpconfig.json");
        if (settingsfile[0] == null) {
            settingsfile = Glob.sync(this.projectdir + "/.remote-sync.json");
        }
        var parsedsettings = null;
        try {
            parsedsettings = JSON.parse(fs.readFileSync(settingsfile[0], "utf8"));
        }
        catch (e) {
            settings = null;
        }
        if (settings != null) {
            settings.hostname = parsedsettings.hostname;
            settings.username = parsedsettings.username;
            settings.password = parsedsettings.password;
            settings.target = parsedsettings.target;
            settings.mode = parsedsettings.mode;
            settings.port = parsedsettings.port;
            settings.ignore = new Array();
            parsedsettings.ignore.forEach(function (val, index, array) {
                settings.ignore.push(val);
            });
            settings.watch = new Array();
            parsedsettings.watch.forEach(function (val, index, array) {
                settings.watch.push(val);
            });
            this.clientsettings = settings;
            this.queueduploads = new Array();
            this.queueprocessing = false;
            if (this.clientsettings.mode == "sftp") {
                this.openSFTPConnection();
            }
            else {
                vscode.window.showInformationMessage("FTP Settings found and loaded for project.");
            }
            this.startWatchingFiles();
        }
        else {
            vscode.window.showWarningMessage(".ftpconfig.json, or .remote-sync.json cannot be loaded.  There may be a typo or syntax issue within the file.");
        }
    }
    FtpClient.prototype.destroy = function () {
        if (this.sftpinstance != null) {
            this.sftpinstance.end();
        }
    };
    FtpClient.prototype.openSFTPConnection = function () {
        var _this = this;
        this.sftpinstance = null;
        this.sftpinstance = new sftpclient();
        this.sftpinstance.connect({
            "host": this.clientsettings.hostname,
            "port": this.clientsettings.port,
            "username": this.clientsettings.username,
            "password": this.clientsettings.password
        });
        this.sftpinstance.on('error', function (err) {
            var errormessage = vscode.window.showErrorMessage("Failed to connect to server: " + err.message);
        });
        this.sftpinstance.on('ready', function () {
            vscode.window.showInformationMessage("SFTP Settings found and loaded for project.");
        });
        this.sftpinstance.on('end', function () { return _this.openSFTPConnection(); });
    };
    FtpClient.prototype.startWatchingFiles = function () {
        var _this = this;
        var gaze = new Gaze();
        gaze.on('changed', function (filepath) {
            _this.addUploadFileToQueue(filepath);
        });
        this.clientsettings.watch.forEach(function (val, index, array) {
            var separator = "";
            if (val.charAt(0) != "/") {
                separator = "/";
            }
            gaze.add(_this.projectdir + separator + val);
        });
    };
    FtpClient.prototype.addUploadFileToQueue = function (filepath) {
        if (this.queueduploads.indexOf(filepath) === -1) {
            this.queueduploads.push(filepath);
        }
        this.processQueue();
    };
    FtpClient.prototype.processQueue = function () {
        var _this = this;
        if (!this.queueprocessing) {
            this.queueprocessing = true;
            setTimeout(function () {
                _this.queueduploads.forEach(function (val, index, array) {
                    _this.uploadFile(val);
                });
                _this.queueduploads = new Array();
                _this.queueprocessing = false;
            }, this.queuedelay);
        }
    };
    FtpClient.prototype.checkIgnoredFiles = function (filename) {
        var globarray = new Array();
        globarray.push("**/*");
        globarray = globarray.concat(this.clientsettings.ignore);
        if (Globule.isMatch(globarray, filename)) {
            return false;
        }
        else {
            return true;
        }
    };
    FtpClient.prototype.uploadFile = function (filepath) {
        var messageDisposable = vscode.window.setStatusBarMessage("Uploading file ...", 2000);
        var remotefilepath = filepath.replace(this.projectdir, "");
        remotefilepath = this.clientsettings.target + remotefilepath;
        if (this.clientsettings.mode == "sftp") {
            this.sftpinstance.sftp(function (err, sftp) {
                if (err) {
                    var errormessage = vscode.window.showErrorMessage("Failed to upload file " + err.message);
                    sftp.end();
                }
                else {
                    var readStream = fs.createReadStream(filepath);
                    var writeStream = sftp.createWriteStream(remotefilepath);
                    writeStream.on('close', function () {
                        console.log("....upload complete!");
                        messageDisposable.dispose();
                        var successmessage = vscode.window.setStatusBarMessage("... upload complete!", 3000);
                        sftp.end();
                    });
                    readStream.pipe(writeStream);
                }
            });
        }
        if (this.clientsettings.mode == "ftp") {
            var c_1 = new ftpclient();
            c_1.on('ready', function () {
                c_1.list(remotefilepath, function (err, list) {
                    if (err) {
                        var patharray = remotefilepath.split('/');
                        patharray.pop();
                        var pathtocreate = patharray.join('/');
                        console.log(pathtocreate);
                        c_1.mkdir(pathtocreate, true, function (err) {
                            if (err) {
                                var errormessage = vscode.window.showErrorMessage("Failed to create directory: " + err.message);
                            }
                            c_1.put(filepath, remotefilepath, function (err) {
                                if (err) {
                                    var errormessage = vscode.window.showErrorMessage("Failed to upload file " + err.message);
                                }
                                else {
                                    console.log("....upload complete!");
                                    messageDisposable.dispose();
                                    var successmessage = vscode.window.setStatusBarMessage("... upload complete!", 3000);
                                }
                                c_1.end();
                            });
                        });
                    }
                    else {
                        c_1.put(filepath, remotefilepath, function (err) {
                            if (err) {
                                var errormessage = vscode.window.showErrorMessage("Failed to upload file " + err.message);
                            }
                            else {
                                console.log("....upload complete!");
                                messageDisposable.dispose();
                                var successmessage = vscode.window.setStatusBarMessage("... upload complete!", 3000);
                            }
                            c_1.end();
                        });
                    }
                });
            });
            c_1.on('error', function (err) {
                var errormessage = vscode.window.showErrorMessage("Failed to connect to server: " + err.message);
            });
            c_1.connect({
                host: this.clientsettings.hostname,
                user: this.clientsettings.username,
                password: this.clientsettings.password
            });
        }
    };
    return FtpClient;
}());
exports.FtpClient = FtpClient;
//# sourceMappingURL=ftpclient.js.map