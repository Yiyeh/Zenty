function windowState(window) {
  return {
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
    focused: window.isFocused(),
  };
}
function performWindowAction(window, action) {
  if (action === "minimize") window.minimize();
  else if (action === "maximize") {
    if (window.isFullScreen()) {
      window.setFullScreen(false);
      window.unmaximize();
    } else if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  } else if (action === "fullscreen")
    window.setFullScreen(!window.isFullScreen());
  else if (action === "close") window.close();
  else throw new Error("Unknown window action");
}
function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      value.length < 8192
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function authUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [
        "accounts.spotify.com",
        "accounts.google.com",
        "oauth2.googleapis.com",
      ].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function trustedFrame(event, origin) {
  try {
    return (
      !event.senderFrame.parent &&
      new URL(event.senderFrame.url).origin === origin &&
      new URL(event.senderFrame.url).pathname === "/"
    );
  } catch {
    return false;
  }
}
module.exports = {
  windowState,
  performWindowAction,
  safeExternalUrl,
  authUrl,
  trustedFrame,
};
