import test from "node:test";
import assert from "node:assert/strict";
import { pairingQr } from "../src/lib/pairing-qr.ts";
test("QR: se genera localmente sin enviar el código a terceros", async () => {
 const data = await pairingQr("http://192.168.1.4:17732"); assert.match(data, /^data:image\/png;base64,/); assert.equal(Buffer.from(data.split(",")[1], "base64").subarray(1,4).toString(), "PNG");
 for (const url of ["https://example.com", "http://192.168.1.4:17732?code=123456789", "http://user:secret@192.168.1.4"]) await assert.rejects(pairingQr(url));
});
