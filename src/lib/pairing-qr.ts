export async function pairingQr(url: string) {
  const target = new URL(url); const parts = target.hostname.split("."); if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) throw new Error("Invalid local pairing address"); if (target.protocol !== "http:" || target.username || target.password || target.search || target.hash || !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(target.hostname)) throw new Error("Invalid local pairing address");
  const module = await import("qrcode"); return module.toDataURL(target.origin + "/connect", { width: 200, margin: 2, errorCorrectionLevel: "M" });
}
