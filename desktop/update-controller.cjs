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
    try { const info=await fs.lstat(source); if(!info.isFile() || info.isSymbolicLink()) throw new Error("Archivo de save inválido.");
      await fs.mkdir(path.dirname(target),{recursive:true}); await fs.copyFile(source,target);
    } catch(error) { if(error.code!=="ENOENT") throw error; }
  }
  await fs.writeFile(path.join(folder,"LEEME.txt"),"Respaldo de ajustes, índices y progreso previo a actualizar Zenty. Los archivos de libros y juegos siguen en su ubicación original; esta copia no duplica sus contenidos ni incluye sesiones de cuentas. Con Zenty cerrado, copia las carpetas y JSON de este respaldo al perfil para restaurar sus metadatos.");
  return folder;
}
function createUpdateController({updater,version,supported,prepare=async()=>{},notify=()=>{},now=Date.now}) {
  let state={supported,version,phase:"idle",latestVersion:"",percent:0,message:supported?"Busca nuevas versiones de Zenty.":"Instala Zenty con el instalador para activar las actualizaciones internas.",notes:"",releaseUrl:RELEASE_URL};
  let flight=null,downloaded=false,lastProgress=0;
  const update=(value)=>{state={...state,...value};notify({...state});};
  const error=()=>update({phase:"error",message:"No se pudo completar la actualización. Comprueba la conexión y vuelve a intentarlo. Tu versión actual y tu save se conservan."});
  if(supported && updater) {
    updater.autoDownload=false; updater.autoInstallOnAppQuit=false; updater.allowPrerelease=false; updater.allowDowngrade=false;
    updater.on("checking-for-update",()=>update({phase:"checking",message:"Buscando actualizaciones…"}));
    updater.on("update-available",info=>update({phase:"available",latestVersion:info.version,percent:0,notes:typeof info.releaseNotes==="string"?info.releaseNotes.replace(/<[^>]*>/g," ").slice(0,8000):"",message:`Zenty ${info.version} está disponible.`}));
    updater.on("update-not-available",()=>update({phase:"idle",message:"Tienes la versión más reciente."}));
    updater.on("download-progress",progress=>{if(now()-lastProgress<400 && progress.percent<100)return;lastProgress=now();update({phase:"downloading",percent:Math.max(0,Math.min(100,Math.round(progress.percent))),message:"Descargando actualización…"});});
    updater.on("update-downloaded",info=>{downloaded=true;update({phase:"downloaded",latestVersion:info.version,percent:100,message:"Actualización lista. Reinicia cuando quieras instalarla."});});
    updater.on("error",error);
  }
  const run=async(action)=>{
    if(!supported || !updater)return {...state};
    if(flight)return flight;
    const work=(async()=>{
      try {
        if(action==="check") { if(downloaded){update({phase:"downloaded",message:"Actualización lista. Puedes volver a intentar instalarla."});return {...state};}if(state.phase==="downloading")return {...state}; await updater.checkForUpdates(); }
        else if(action==="download") { if(state.phase!=="available" && !downloaded)throw new Error("No update");if(downloaded)return {...state};update({phase:"downloading",message:"Descargando actualización…",percent:0});await updater.downloadUpdate(); }
        else if(action==="install") { if(!downloaded)throw new Error("Not downloaded");update({phase:"installing",message:"Guardando tus cambios y respaldando los ajustes…"});await prepare();updater.quitAndInstall(false,true); }
        return {...state};
      } catch { error();return {...state}; }
    })();
    flight=work; try{return await work;}finally{flight=null;}
  };
  return {get:()=>({...state}),check:()=>run("check"),download:()=>run("download"),install:()=>run("install")};
}
module.exports={createUpdateController,backupUpdateMetadata};
