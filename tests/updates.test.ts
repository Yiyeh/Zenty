import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {createRequire} from "node:module";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
const {createUpdateController,backupUpdateMetadata}=createRequire(import.meta.url)("../desktop/update-controller.cjs");
class FakeUpdater extends EventEmitter {
  checks=0; downloads=0; installed=false;
  async checkForUpdates(){this.checks++;this.emit("checking-for-update");await new Promise(resolve=>setTimeout(resolve,10));this.emit("update-available",{version:"1.1.0",releaseNotes:"<p>Mejoras</p>"});}
  async downloadUpdate(){this.downloads++;this.emit("download-progress",{percent:50});this.emit("update-downloaded",{version:"1.1.0"});}
  quitAndInstall(silent:boolean,restart:boolean){assert.equal(silent,false);assert.equal(restart,true);this.installed=true;}
}
test("actualizador: solo descarga con acción explícita, una consulta y guarda antes de instalar",async()=>{
 const updater=new FakeUpdater();let saved=false;
 const controller=createUpdateController({updater,version:"1.0.0",supported:true,prepare:async()=>{assert.equal(updater.installed,false);saved=true;}});
 await Promise.all([controller.check(),controller.check()]);assert.equal(updater.checks,1);assert.equal(updater.downloads,0);assert.equal(controller.get().phase,"available");assert.equal(controller.get().notes.trim(),"Mejoras");
 await controller.download();assert.equal(updater.downloads,1);assert.equal(controller.get().percent,100);assert.equal(controller.get().phase,"downloaded");
 await controller.install();assert.equal(saved,true);assert.equal(updater.installed,true);
});
test("actualizador: fallo al guardar impide instalar y permite reintentar; portable no actualiza",async()=>{
 const updater=new FakeUpdater();let fail=true;const controller=createUpdateController({updater,version:"1.0.0",supported:true,prepare:async()=>{if(fail)throw new Error("private path");}});
 await controller.check();await controller.download();await controller.install();assert.equal(updater.installed,false);assert.equal(controller.get().phase,"error");assert.ok(!controller.get().message.includes("private path"));
 fail=false;await controller.check();assert.equal(controller.get().phase,"downloaded");await controller.install();assert.equal(updater.installed,true);
 const portable=createUpdateController({updater,version:"1.0.0",supported:false});await portable.check();assert.equal(portable.get().supported,false);assert.equal(updater.checks,1);
});
test("respaldo previo: conserva índices y ajustes sin copiar originales ni sesiones",async()=>{
 const profile=await mkdtemp(join(tmpdir(),"zenty-update-"));
 try{await mkdir(join(profile,"data/library-data"),{recursive:true});await mkdir(join(profile,"connections"));await writeFile(join(profile,"data/library-data/library.json"),'{"position":7}');await writeFile(join(profile,"data/library-data/book.pdf"),"original");await writeFile(join(profile,"connections/token.enc"),"secret");
 const backup=await backupUpdateMetadata(profile,"1.0.0");assert.equal(await readFile(join(backup,"data/library-data/library.json"),"utf8"),'{"position":7}');
 await assert.rejects(readFile(join(backup,"data/library-data/book.pdf")));await assert.rejects(readFile(join(backup,"connections/token.enc")));assert.equal(await readFile(join(profile,"data/library-data/book.pdf"),"utf8"),"original");
 }finally{await rm(profile,{recursive:true,force:true});}
});
