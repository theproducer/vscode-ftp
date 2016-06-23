'use strict';

import * as vscode from 'vscode';
import * as vscodeftp from './ftpclient';
import * as fs from 'fs';

var client = null;

export function activate(context: vscode.ExtensionContext) {
    client = new vscodeftp.FtpClient(vscode.workspace.rootPath);

    var disposable = vscode.commands.registerCommand('extension.uploadFile', () => {	
		vscodeFtpUploadFile();			
	});
	
	var reloadDisposable = vscode.commands.registerCommand('extension.reloadSettings', () => {
		vscodeFtpReloadSettings();
	});
	
	var createDisposable = vscode.commands.registerCommand('extension.createSettings', () => {
		vscodeFtpCreateSettings();
	});
    
    var pathDisposable = vscode.commands.registerCommand("extension.uploadPath", () => {
        vscodeFtpUploadPath();
    });

    var onSaveListener = function(event) {
        //Check if file is ignored
        if(!client.checkIgnoredFiles(event.fileName)){
            client.uploadFile(event.fileName);
        }		
	}
	
	var onSaveDisposable = vscode.workspace.onDidSaveTextDocument(onSaveListener);
	
	context.subscriptions.push(disposable);
	context.subscriptions.push(reloadDisposable);
	context.subscriptions.push(onSaveDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function vscodeFtpUploadPath(){
    if(client.clientsettings != null){
        var options: vscode.InputBoxOptions = {
            prompt: "Enter the path to the file or folder you want to upload (relative to this project)",
            placeHolder: "ex.: src/images/logo.jpg"
        };
        
        var path = null;
        var pathThenable = vscode.window.showInputBox(options);
        pathThenable.then(function(value: string){
			if(value !== undefined){
				path = vscode.workspace.rootPath + "/" + value;
				fs.access(path, fs.F_OK, function(err){
					if(err){
						vscode.window.showErrorMessage("Could not find file/directory: " + path);
					}else{
						//check if this is a file or directory
						fs.lstat(path, function(err, stats){
							if(stats.isDirectory()){
								vscode.window.showInformationMessage("VSCodeFTP does not yet support directory uploads");
							}else{
								if(stats.isFile()){
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
	} else {
		vscodeFtpReloadSettings();
	}
}

function vscodeFtpCreateSettings() {
	var options: vscode.InputBoxOptions = {
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
		ignore: Array<string>(),
		watch: Array<string>(),
		autoUploadOnSave: true
	};
	
	var hostnameThenable = vscode.window.showInputBox(options);
	hostnameThenable.then(function(value: string) {
		ftpdetails.hostname = value;

		var usernameThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
			prompt: "Enter the FTP username"
		});
		
		usernameThenable.then(function(value: string) {
			ftpdetails.username = value;
			
			var passwordThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
				prompt: "Enter the FTP password",
				password: true				
			});
			
			passwordThenable.then(function(value: string) {
				ftpdetails.password = value;
				
				var portThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
					prompt: "Enter the port number",
					value: "21"
				});
				
				portThenable.then(function(value: string) {
					ftpdetails.port = parseInt(value);
					
					var remotepathThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
						prompt: "Enter the remote path to the project directory"
					});
					
					remotepathThenable.then(function(value: string) {
						ftpdetails.target = value;
                        
                        var modeThenable = vscode.window.showInputBox(vscode.InputBoxOptions = {
                            prompt: "Enter the protocol (ftp or sftp)"
                        });
                        
                        modeThenable.then(function(value: string){
                           ftpdetails.mode = value; 
                           
                           //Add some default ignores
                            ftpdetails.ignore.push("!node_modules/**");
                            ftpdetails.ignore.push("!.ftpconfig.json");
                            ftpdetails.ignore.push("!.remote-sync.json");
                            
                            
                            //Create the json file
                            console.log(ftpdetails);
                            fs.writeFile(vscode.workspace.rootPath + "/.ftpconfig.json", JSON.stringify(ftpdetails, null, 4), function() {
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