var Gaze = require('gaze').Gaze;
var glob = require('glob');
var globule = require('globule');
var ftpclient = require('ftp');
var sftpclient = require('ssh2').Client;

import * as vscode from 'vscode'; 
import * as fs from 'fs';

export class ProjectSettings{
	hostname :string;
	username :string;
	password :string;
	target :string;
	mode :string;
	ignore :Array<string>;
	watch :Array<string>;
    port :number;
}

export class VSCodeFTP{	
	projectdir :string;
	projsettings :ProjectSettings;
	queueduploads :Array<string>;
	queuedelay :number;
	queueprocessing :boolean;
    
    sftpinstance: any;
	
	
	constructor(projectpath: string){
		//1.  Get current parent directory
		this.projectdir = projectpath;	
		this.queuedelay = 750;
		
		
		//2.  Read settings .json file
		let projectsettings = new ProjectSettings();
		let settingsfile = glob.sync(this.projectdir + "/.ftpconfig.json");
		
		if (settingsfile[0] == null) {
			settingsfile = glob.sync(this.projectdir + "/.remote-sync.json");
		}
		
		console.log(settingsfile[0]);
		var settings = null;
		try {
			settings = JSON.parse(fs.readFileSync(settingsfile[0], "utf8"));
		} catch (e) {
			settings = null;
		}
		
		if (settings != null) {
			projectsettings.hostname = settings.hostname;
			projectsettings.username = settings.username;
			projectsettings.password = settings.password;
			projectsettings.target = settings.target;	
            projectsettings.mode = settings.mode;
            projectsettings.port = settings.port;
			
			//Get files to ignore
			projectsettings.ignore = new Array<string>();
			settings.ignore.forEach(function(val, index, array){					
				projectsettings.ignore.push(val);
			});		
			
			//Get files to watch
			projectsettings.watch = new Array<string>();
			settings.watch.forEach(function(val, index, array){					
				projectsettings.watch.push(val);
			});
			
			this.projsettings = projectsettings;
			this.queueduploads = new Array<string>();
			this.queueprocessing = false;
            
            //3.  If this is SFTP, start the client and open a connection            
            if(this.projsettings.mode == "sftp"){
                this.sftpinstance = new sftpclient();
                this.sftpinstance.connect({
                    "host": this.projsettings.hostname,
                    "port": this.projsettings.port,
                    "username": this.projsettings.username,
                    "password": this.projsettings.password
                });
                
                this.sftpinstance.on('error', function(err :any) {
                    var errormessage = vscode.window.showErrorMessage("Failed to connect to server: " + err.message);
                });
                
                this.sftpinstance.on('ready', function(){
                    vscode.window.showInformationMessage("SFTP Settings found and loaded for project.");
                });
                
            }else{
                vscode.window.showInformationMessage("FTP Settings found and loaded for project.");
            }
            
			
			//4.  Start watching folder for changes
			this.startWatchingFiles();
			
		} else {
			vscode.window.showWarningMessage(".ftpconfig.json, or .remote-sync.json cannot be loaded.  There may be a typo or syntax issue within the file.");
		}
	}
    
    destroy(){
        if(this.sftpinstance != null){
            this.sftpinstance.end();    
        }        
    }
	
	uploadFile(filepath: string) {		
		var messageDisposable = vscode.window.setStatusBarMessage("Uploading file ...", 3000);
		
		var remotefilepath = filepath.replace(this.projectdir, "");
		console.log(remotefilepath);
		remotefilepath = this.projsettings.target + remotefilepath;
		console.log("uploading file to: " + remotefilepath);
        
        if(this.projsettings.mode == "sftp"){   
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
        
        if(this.projsettings.mode == "ftp"){
            let c = new ftpclient();
            c.on('ready', function(){
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
            
            c.on('error', function(err :any) {
                var errormessage = vscode.window.showErrorMessage("Failed to connect to server: " + err.message);
            });
            c.connect({
                host: this.projsettings.hostname,
                user: this.projsettings.username,
                password: this.projsettings.password
            });
        }
        
		
	}
	
	addUploadFileToQueue(filepath :string){        
		if(this.queueduploads.indexOf(filepath) === -1){
			this.queueduploads.push(filepath);
		}
		this.processQueue();
	}
	
	checkIgnoredFiles(filename: string) {
        let globarray = new Array<string>();
        globarray.push("**/*");
        globarray = globarray.concat(this.projsettings.ignore);
        
		if(globule.isMatch(globarray, filename)){
            return false;
        }else{
            return true;
        }
	}
	
	processQueue(){
		let that = this;
		if(!this.queueprocessing){
			this.queueprocessing = true;
			setTimeout(function(){
				that.queueduploads.forEach(function(val, index, array){
					that.uploadFile(val);					
				});
				
				that.queueduploads = new Array<string>();
				that.queueprocessing = false;
			}, this.queuedelay);
		}		
	}
	
	startWatchingFiles(){
		let that = this;
		var gaze = new Gaze();
		gaze.on('changed', function(filepath){            
            that.addUploadFileToQueue(filepath);            
		});
		
		this.projsettings.watch.forEach(function(val, index, array){
			var separator = "";
			if(val.charAt(0) != "/"){
				separator = "/";
			}
			gaze.add(that.projectdir + separator + val);
			//console.log(that.projectdir + separator + val);
		});	
		
	}
}