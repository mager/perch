import { access,chmod,mkdir,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if(process.platform!=='darwin')throw new Error('This installer is for macOS. Run the agent with your service manager on other systems.');
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/install-agent.mjs /absolute/path/to/.env.agent');
const envFile=resolve(file);await access(envFile);await chmod(envFile,0o600);
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=resolve(homedir(),'Library/LaunchAgents'),logs=resolve(homedir(),'Library/Logs/Perch');
await mkdir(dir,{recursive:true});await mkdir(logs,{recursive:true,mode:0o700});
const destination=resolve(dir,'dev.perch.agent.plist');
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const plist=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>dev.perch.agent</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>--env-file=${xml(envFile)}</string><string>${xml(resolve(root,'agent/agent.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>60</integer>
<key>StandardOutPath</key><string>${xml(resolve(logs,'agent.log'))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(logs,'agent-error.log'))}</string>
</dict></plist>`;
// Refuse to overwrite an existing service; unload/remove it deliberately first.
await writeFile(destination,plist,{flag:'wx',mode:0o600});
execFileSync('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,destination],{stdio:'inherit'});
console.log(`Installed ${destination}. Runs while your macOS user is logged in. Reinstall after changing Node's location.`);
