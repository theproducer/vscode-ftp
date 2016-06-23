import * as vscode from 'vscode'; 
import * as fs from 'fs';

var Gaze = require('gaze').Gaze;
var Glob = require('glob');
var Globule = require('globule');
var ftpclient = require('ftp');
var sftpclient = require('ssh2').Client;

class ClientSettings{
    hostname :string;
	username :string;
	password :string;
	target :string;
	mode :string;
	ignore :Array<string>;
	watch :Array<string>;
    port :number;
}

export class FtpClient{
    projectdir: string;
    clientsettings: ClientSettings;    
    queueduploads :Array<string>;
	queuedelay :number;
	queueprocessing :boolean;
    sftpinstance: any;

    constructor(projectpath: string){
        this.projectdir = projectpath;
        this.queuedelay = 1000;

        var settings = new ClientSettings();
        var settingsfile = Glob.sync(this.projectdir + "/.ftpconfig.json");
        if(settingsfile[0] == null){
            settingsfile = Glob.sync(this.projectdir + "/.remote-sync.json");
        }

        var parsedsettings = null;

        try{
            parsedsettings = JSON.parse(fs.readFileSync(settingsfile[0], "utf8"));
        }catch (e){
            settings = null;
        }

        if(settings != null){
            settings.hostname = parsedsettings.hostname;
			settings.username = parsedsettings.username;
			settings.password = parsedsettings.password;
			settings.target = parsedsettings.target;	
            settings.mode = parsedsettings.mode;
            settings.port = parsedsettings.port;
			settings.ignore = new Array<string>();
			parsedsettings.ignore.forEach(function(val, index, array){					
				settings.ignore.push(val);
			});
			settings.watch = new Array<string>();
			parsedsettings.watch.forEach(function(val, index, array){					
				settings.watch.push(val);
			});

            this.clientsettings = settings;
            this.queueduploads = new Array<string>();
            this.queueprocessing = false;

            if(this.clientsettings.mode == "sftp"){
                this.openSFTPConnection();                
            }else{
                vscode.window.showInformationMessage("FTP Settings found and loaded for project.");
            }

            this.startWatchingFiles();
        }else{
            vscode.window.showWarningMessage(".ftpconfig.json, or .remote-sync.json cannot be loaded.  There may be a typo or syntax issue within the file.");
        }
    }

    destroy(){
        if(this.sftpinstance != null){
            this.sftpinstance.end();
        }
    }

    openSFTPConnection(){
        this.sftpinstance = null;
        this.sftpinstance = new sftpclient();
        this.sftpinstance.connect({
            "host": this.clientsettings.hostname,
            "port": this.clientsettings.port,
            "username": this.clientsettings.username,
            "password": this.clientsettings.password
        });
        
        this.sftpinstance.on('error', function(err :any) {
            var errormessage = vscode.window.showErrorMessage("Failed to connect to server: " + err.message);
        });
        
        this.sftpinstance.on('ready', function(){
            vscode.window.showInformationMessage("SFTP Settings found and loaded for project.");
        });        
            
        this.sftpinstance.on('end', () => this.openSFTPConnection());
    }

    startWatchingFiles(){
        var gaze = new Gaze();
        gaze.on('changed', (filepath) => {
            this.addUploadFileToQueue(filepath);
        });

        this.clientsettings.watch.forEach((val, index, array) => {
			var separator = "";
			if(val.charAt(0) != "/"){
				separator = "/";
			}
			gaze.add(this.projectdir + separator + val);
		});
    }

    addUploadFileToQueue(filepath: string){
        if(this.queueduploads.indexOf(filepath) === -1){
            this.queueduploads.push(filepath);
        }
        this.processQueue();
    }

    processQueue(){
        if(!this.queueprocessing){
            this.queueprocessing = true;

            setTimeout(() => {
                this.queueduploads.forEach((val, index, array) => {
					this.uploadFile(val);					
				});

                this.queueduploads = new Array<string>();
                this.queueprocessing = false;
            }, this.queuedelay);
        }
    }

    checkIgnoredFiles(filename: string) {
        let globarray = new Array<string>();
        globarray.push("**/*");
        globarray = globarray.concat(this.clientsettings.ignore);
        
		if(Globule.isMatch(globarray, filename)){
            return false;
        }else{
            return true;
        }
	}

    uploadFile(filepath: string){
        var messageDisposable = vscode.window.setStatusBarMessage("Uploading file ...", 2000);
        var remotefilepath = filepath.replace(this.projectdir, "");
        remotefilepath = this.clientsettings.target + remotefilepath;

        if(this.clientsettings.mode == "sftp"){
            this.sftpinstance.sftp(  
                function(err, sftp){
                    if(err){
                        var errormessage = vscode.window.showErrorMessage("Failed to upload file " + err.message);
                        sftp.end(); 
                    }else{
                        let readStream = fs.createReadStream(filepath);
                        let writeStream = sftp.createWriteStream(remotefilepath);
                        
                        writeStream.on('close', function(){
                            console.log("....upload complete!");
                            messageDisposable.dispose();
                            var successmessage = vscode.window.setStatusBarMessage("... upload complete!", 3000);
                            sftp.end();                                
                        });
                        
                        readStream.pipe(writeStream);
                    }
                }
            );
        }

        if(this.clientsettings.mode == "ftp"){
            let c = new ftpclient();

            c.on('ready', function(){
                c.list(remotefilepath, function(err, list){					
					if(err){
						var patharray = remotefilepath.split('/');
						patharray.pop()

						var pathtocreate = patharray.join('/');
						console.log(pathtocreate);
						c.mkdir(pathtocreate, true, function(err){
							if(err){
								var errormessage = vscode.window.showErrorMessage("Failed to create directory: " + err.message);
							}
							c.put(filepath, remotefilepath, function(err){
								if(err){					
									var errormessage = vscode.window.showErrorMessage("Failed to upload file " + err.message);
								}else{
									console.log("....upload complete!");
									messageDisposable.dispose();
									var successmessage = vscode.window.setStatusBarMessage("... upload complete!", 3000);
								}				
								c.end();
							});
						});
					}else{
						c.put(filepath, remotefilepath, function(err){
							if(err){					
								var errormessage = vscode.window.showErrorMessage("Failed to upload file " + err.message);
							}else{
								console.log("....upload complete!");
								messageDisposable.dispose();
								var successmessage = vscode.window.setStatusBarMessage("... upload complete!", 3000);
							}				
							c.end();
						});
					}
				});
            });

            c.on('error', function(err :any) {
                var errormessage = vscode.window.showErrorMessage("Failed to connect to server: " + err.message);
            });
            
            c.connect({
                host: this.clientsettings.hostname,
                user: this.clientsettings.username,
                password: this.clientsettings.password
            });
        }
    }
}