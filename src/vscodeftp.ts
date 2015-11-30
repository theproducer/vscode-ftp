var Gaze = require('gaze').Gaze;
var glob = require('glob');
var ftpclient = require('ftp');

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
}

export class VSCodeFTP{	
	projectdir :string;
	projsettings :ProjectSettings;
	queueduploads :Array<string>;
	queuedelay :number;
	queueprocessing :boolean;
	
	
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
			
			//3.  Start watching folder for changes
			this.startWatchingFiles();
			vscode.window.showInformationMessage("FTP Settings found and loaded for project.");
		} else {
			vscode.window.showWarningMessage(".ftpconfig.json, or .remote-sync.json cannot be loaded.  There may be a typo or syntax issue within the file.");
		}
	}
	
	uploadFile(filepath: string) {		
		var messageDisposable = vscode.window.setStatusBarMessage("Uploading file ...", 3000);
		
		var remotefilepath = filepath.replace(this.projectdir, "");
		console.log(remotefilepath);
		remotefilepath = this.projsettings.target + remotefilepath;
		console.log("uploading file to: " + remotefilepath);
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
	
	addUploadFileToQueue(filepath :string){
		if(this.queueduploads.indexOf(filepath) === -1){
			this.queueduploads.push(filepath);
		}
		this.processQueue();
	}
	
	checkIgnoredFiles(filename: string) {
		filename = filename.replace("/", "");
		this.projsettings.ignore.find(function(element, index, array) {
			if (element == filename) {
				return true;
			}
		});
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
			//Add file to upload queue
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