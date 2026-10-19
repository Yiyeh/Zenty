const { tr } = require("./locale.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const {randomUUID} = require("node:crypto");
const RELEASE_URL = "https://github.com/Yiyeh/Zenty/releases/latest";
async function backupUpdateMetadata(profile, version) {
  const folder = path.join(profile,"backups",`before-update-${version}-${randomUUID().slice(0,8)}`);
  const files = ["data/dashboard-data/dashboard.json","data/dashboard-data/previous.json","data/library-data/library.json","data/gaming-data/local-games.json","reminders/plan.json","reminders/delivered.json","startup.json","window.json","audio.json"];
  await fs.mkdir(folder,{recursive:true});
  for(const relative of files) {
    const source=path.join(profile,relative), target=path.join(folder,relative);
    try { const info=await fs.lstat(source); if(!info.isFile() || info.isSymbolicLink()) throw new Error(tr("update_controller.38845b08b4"));
      await fs.mkdir(path.dirname(target),{recursive:true}); await fs.copyFile(source,target);
    } catch(error) { if(error.code!=="ENOENT") throw error; }
  }
  await fs.writeFile(path.join(folder,"LEEME.txt"),tr("update_controller.78fc892d0a"));
  return folder;
}
function createUpdateController({updater,version,supported,prepare=async()=>{},notify=()=>{},now=Date.now}) {
  let state={supported,version,phase:"idle",latestVersion:"",percent:0,message:supported?"Busca nuevas versiones de Zenty.":tr("update_controller.9855d803bd"),notes:"",releaseUrl:RELEASE_URL};
  let flight=null,downloaded=false,lastProgress=0;
  const update=(value)=>{state={...state,...value};notify({...state});};
  const error=()=>update({phase:"error",message:tr("update_controller.a1a966a1db")});
  if(supported && updater) {
    updater.autoDownload=false; updater.autoInstallOnAppQuit=false; updater.allowPrerelease=false; updater.allowDowngrade=false;
    updater.on("checking-for-update",()=>update({phase:"checking",message:tr("update_controller.ff298bf341")}));
    updater.on("update-available",info=>update({phase:"available",latestVersion:info.version,percent:0,notes:typeof info.releaseNotes==="string"?info.releaseNotes.replace(/<[^>]*>/g," ").slice(0,8000):"",message:tr("update_controller.9d5de214f0", { v0: info.version })}));
    updater.on("update-not-available",()=>update({phase:"idle",message:tr("update_controller.826e1e9075")}));
    updater.on("download-progress",progress=>{if(now()-lastProgress<400 && progress.percent<100)return;lastProgress=now();update({phase:"downloading",percent:Math.max(0,Math.min(100,Math.round(progress.percent))),message:tr("update_controller.7422ed45f6")});});
    updater.on("update-downloaded",info=>{downloaded=true;update({phase:"downloaded",latestVersion:info.version,percent:100,message:tr("update_controller.2e94babca3")});});
    updater.on("error",error);
  }
  const run=async(action)=>{
    if(!supported || !updater)return {...state};
    if(flight)return flight;
    const work=(async()=>{
      try {
        if(action==="check") { if(downloaded){update({phase:"downloaded",message:tr("update_controller.e2791968ec")});return {...state};}if(state.phase==="downloading")return {...state}; await updater.checkForUpdates(); }
        else if(action==="download") { if(state.phase!=="available" && !downloaded)throw new Error(tr("update_controller.6117d05e41"));if(downloaded)return {...state};update({phase:"downloading",message:tr("update_controller.7422ed45f6"),percent:0});await updater.downloadUpdate(); }
        else if(action==="install") { if(!downloaded)throw new Error(tr("update_controller.5569a4e0a4"));update({phase:"installing",message:tr("update_controller.a6a51c973e")});await prepare();updater.quitAndInstall(false,true); }
        return {...state};
      } catch { error();return {...state}; }
    })();
    flight=work; try{return await work;}finally{flight=null;}
  };
  return {get:()=>({...state}),check:()=>run("check"),download:()=>run("download"),install:()=>run("install")};
}
module.exports={createUpdateController,backupUpdateMetadata};
