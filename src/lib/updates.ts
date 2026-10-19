export interface UpdateState {
  supported:boolean; version:string; phase:"idle"|"checking"|"available"|"downloading"|"downloaded"|"installing"|"error";
  latestVersion:string; percent:number; message:string; notes:string; releaseUrl:string;
}
