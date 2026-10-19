import { APP_NAME, APP_ID } from "./src/lib/brand.ts";
export default {
  appId: APP_ID,
  productName: APP_NAME,
  electronVersion: "44.9.0",
  directories: { output: "releases/Zenty-Installer", buildResources: "desktop" },
  files: ["dist/**/*", "desktop/**/*", "desktop-server/**/*", "package.json", "!desktop/native-audio/*.cs", "!desktop/native-audio/*.sha256"],
  asar: true,
  asarUnpack: ["desktop/native-audio/audio-helper.exe"],
  npmRebuild: false,
  win: { target: [{target:"nsis",arch:["x64"]}], icon:"desktop/icon.ico", executableName:APP_NAME },
  nsis: {
    oneClick:false, perMachine:false, allowElevation:false, allowToChangeInstallationDirectory:false,
    deleteAppDataOnUninstall:false, createDesktopShortcut:true, createStartMenuShortcut:true,
    shortcutName:APP_NAME, installerIcon:"desktop/icon.ico", uninstallerIcon:"desktop/icon.ico",
    artifactName:"${productName}-Setup-${version}.${ext}",
  },
  publish: [{provider:"github",owner:"Yiyeh",repo:"Zenty",releaseType:"draft"}],
};
