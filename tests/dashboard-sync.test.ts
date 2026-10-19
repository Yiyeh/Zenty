import test from "node:test";
import assert from "node:assert/strict";
import { defaultData } from "../src/lib/dashboard.ts";
import { mergeDashboard } from "../src/lib/dashboard-sync.ts";
import { mangaSwipe } from "../src/lib/manga-gestures.ts";
test("sincronización: conserva altas independientes, campos distintos y no resucita registros borrados", () => {
  const base = structuredClone(defaultData); base.notes = [{id:"a",title:"Idea",content:"Original",color:"arena"}];
  const phone = structuredClone(base), pc = structuredClone(base);
  phone.notes[0].content = "Desde móvil"; pc.notes[0].title = "Desde PC";
  phone.notes.push({id:"b",title:"Móvil",content:"B",color:"arena"}); pc.notes.push({id:"c",title:"PC",content:"C",color:"arena"});
  const merged = mergeDashboard(base, phone, pc);
  assert.equal(merged.notes.length,3); assert.equal(merged.notes[0].title,"Desde PC"); assert.equal(merged.notes[0].content,"Desde móvil");
  pc.notes = []; assert.equal(mergeDashboard(base,phone,pc).notes.some(note => note.id === "a"),false);
  phone.settings.theme="dark"; pc.settings.userName="Nombre PC";
  const settings = mergeDashboard(base,phone,pc).settings; assert.equal(settings.theme,"dark"); assert.equal(settings.userName,"Nombre PC");
});
test("swipes: RTL, Comic, inversión y rechazo de scroll vertical, zoom o gestos accidentales", () => {
  const gesture = {dx:100,dy:8,elapsed:220,mode:"rtl" as const,inverted:false,zoom:1};
  assert.equal(mangaSwipe(gesture),"next"); assert.equal(mangaSwipe({...gesture,mode:"ltr"}),"previous");
  assert.equal(mangaSwipe({...gesture,inverted:true}),"previous"); assert.equal(mangaSwipe({...gesture,dx:-100,mode:"ltr"}),"next");
  for (const patch of [{dy:120},{zoom:1.5},{elapsed:1200},{dx:15},{mode:"webtoon" as const}]) assert.equal(mangaSwipe({...gesture,...patch}),null);
});
