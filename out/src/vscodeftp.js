var Gaze = require('gaze').Gaze;
var glob = require('glob');
var ftpclient = require('ftp');
var vscode = require('vscode');
var fs = require('fs');
var ProjectSettings = (function () {
    function ProjectSettings() {
    }
    return ProjectSettings;
})();
exports.ProjectSettings = ProjectSettings;
var VSCodeFTP = (function () {
    function VSCodeFTP(projectpath) {
        //1.  Get current parent directory
        this.projectdir = projectpath;
        this.queuedelay = 750;
        //2.  Read settings .json file
        var projectsettings = new ProjectSettings();
        var settingsfile = glob.sync(this.projectdir + "/.ftpconfig.json");
        if (settingsfile[0] == null) {
            settingsfile = glob.sync(this.projectdir + "/.remote-sync.json");
        }
        console.log(settingsfile[0]);
        var settings = null;
        try {
            settings = JSON.parse(fs.readFileSync(settingsfile[0], "utf8"));
        }
        catch (e) {
            settings = null;
        }
        if (settings != null) {
            projectsettings.hostname = settings.hostname;
            projectsettings.username = settings.username;
            projectsettings.password = settings.password;
            projectsettings.target = settings.target;
            //Get files to ignore
            projectsettings.ignore = new Array();
            settings.ignore.forEach(function (val, index, array) {
                projectsettings.ignore.push(val);
            });
            //Get files to watch
            projectsettings.watch = new Array();
            settings.watch.forEach(function (val, index, array) {
                projectsettings.watch.push(val);
            });
            this.projsettings = projectsettings;
            this.queueduploads = new Array();
            this.queueprocessing = false;
            //3.  Start watching folder for changes
            this.startWatchingFiles();
            vscode.window.showInformationMessage("FTP Settings found and loaded for project.");
        }
        else {
            vscode.window.showWarningMessage(".ftpconfig.json, or .remote-sync.json cannot be loaded.  There may be a typo or syntax issue within the file.");
        }
    }
    VSCodeFTP.prototype.uploadFile = function (filepath) {
        var messageDisposable = vscode.window.setStatusBarMessage("Uploading file ...", 3000);
        var remotefilepath = filepath.replace(this.projectdir, "");
        console.log(remotefilepath);
        remotefilepath = this.projsettings.target + remotefilepath;
        console.log("uploading file to: " + remotefilepath);
        var c = new ftpclient();
        c.on('ready', function () {
            c.put(filepath, remotefilepath, function (err) {
                if (err) {
                    var errormessage = vscode.window.showErrorMessage("Failed to upload file " + err.message);
                }
                else {
                    console.log("....upload complete!");
                    messageDisposable.dispose();
                    var successmessage = vscode.window.setStatusBarMessage("... upload complete!", 3000);
                }
                c.end();
            });
        });
        c.on('error', function (err) {
            var errormessage = vscode.window.showErrorMessage("Failed to connect to server: " + err.message);
        });
        c.connect({
            host: this.projsettings.hostname,
            user: this.projsettings.username,
            password: this.projsettings.password
        });
    };
    VSCodeFTP.prototype.addUploadFileToQueue = function (filepath) {
        if (this.queueduploads.indexOf(filepath) === -1) {
            this.queueduploads.push(filepath);
        }
        this.processQueue();
    };
    VSCodeFTP.prototype.checkIgnoredFiles = function (filename) {
        filename = filename.replace("/", "");
        this.projsettings.ignore.find(function (element, index, array) {
            if (element == filename) {
                return true;
            }
        });
    };
    VSCodeFTP.prototype.processQueue = function () {
        var that = this;
        if (!this.queueprocessing) {
            this.queueprocessing = true;
            setTimeout(function () {
                that.queueduploads.forEach(function (val, index, array) {
                    that.uploadFile(val);
                });
                that.queueduploads = new Array();
                that.queueprocessing = false;
            }, this.queuedelay);
        }
    };
    VSCodeFTP.prototype.startWatchingFiles = function () {
        var that = this;
        var gaze = new Gaze();
        gaze.on('changed', function (filepath) {
            //Add file to upload queue
            that.addUploadFileToQueue(filepath);
        });
        this.projsettings.watch.forEach(function (val, index, array) {
            var separator = "";
            if (val.charAt(0) != "/") {
                separator = "/";
            }
            gaze.add(that.projectdir + separator + val);
            //console.log(that.projectdir + separator + val);
        });
    };
    return VSCodeFTP;
})();
exports.VSCodeFTP = VSCodeFTP;
//# sourceMappingURL=vscodeftp.js.map