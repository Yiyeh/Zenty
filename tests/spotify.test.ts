import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createMusicApi } from "../server/music-api.ts";
import { requestSpotifyVolume } from "../src/lib/spotify.ts";
import { normalizeSettings, spotifyEmbed } from "../src/lib/dashboard.ts";
test("Spotify: enlaces normalizados, sin credenciales y tamaño persistido", () => {
  const id = "0Lr4kGOYn9l83EjuK6cZFQ";
  for (const prefix of ["/track/", "/intl-es/track/", "/embed/track/"])
    assert.equal(
      spotifyEmbed(`https://open.spotify.com${prefix}${id}?si=abc`),
      `https://open.spotify.com/embed/track/${id}`,
    );
  assert.equal(
    spotifyEmbed(`https://someone@open.spotify.com/track/${id}`),
    null,
  );
  assert.equal(spotifyEmbed(`https://open.spotify.com:1234/track/${id}`), null);
  assert.equal(
    normalizeSettings({ spotifyCompact: true }).spotifyCompact,
    true,
  );
  assert.equal(
    normalizeSettings({ spotifyCompact: "true" }).spotifyCompact,
    false,
  );
});
test("Spotify: comprobar existencia sin cargar iframe erróneo, caché y sin proxy arbitrario", async (t) => {
  let calls = 0;
  const requested: string[] = [];
  const handler = createMusicApi((async (input) => {
    calls++;
    requested.push(String(input));
    return String(input).includes("AAAAAAAAAAAAAAAAAAAAAA")
      ? new Response("missing", { status: 404 })
      : Response.json({
          title: "Playlist de prueba",
          html: "<script>ignored</script>",
        });
  }) as typeof fetch);
  const server = createServer(
    (req, res) =>
      void handler(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/music/spotify?url=`;
  const good = "https://open.spotify.com/playlist/BBBBBBBBBBBBBBBBBBBBBB";
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      fetch(base + encodeURIComponent(good)).then((r) => r.json()),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(results[0].available, true);
  assert.equal(results[0].title, "Playlist de prueba");
  assert.equal("html" in results[0], false);
  assert.equal(
    (
      await (
        await fetch(
          base +
            encodeURIComponent(
              "https://open.spotify.com/track/AAAAAAAAAAAAAAAAAAAAAA",
            ),
        )
      ).json()
    ).available,
    false,
  );
  assert.equal(
    (await fetch(base + encodeURIComponent("http://127.0.0.1/private"))).status,
    400,
  );
  assert.ok(
    requested.every((url) =>
      url.startsWith("https://open.spotify.com/oembed?url="),
    ),
  );
});
test("Spotify: volumen real, valores acotados y errores de Premium/dispositivo", async () => {
  const requests: { url: string; method?: string; authorization?: string }[] =
    [];
  const fetcher = (async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method,
      authorization:
        new Headers(init?.headers).get("Authorization") || undefined,
    });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  assert.equal(
    await requestSpotifyVolume("test-token", "device & one", 145, fetcher),
    100,
  );
  assert.equal(
    await requestSpotifyVolume("test-token", "device", -25, fetcher),
    0,
  );
  assert.equal(requests[0].method, "PUT");
  assert.equal(requests[0].authorization, "Bearer test-token");
  assert.equal(
    new URL(requests[0].url).searchParams.get("device_id"),
    "device & one",
  );
  await assert.rejects(requestSpotifyVolume("x", "device", NaN, fetcher));
  assert.equal(requests.length, 2);
  for (const [status, pattern] of [
    [403, /Premium/],
    [404, /dispositivo activo/],
    [429, /esperar/],
  ] as const)
    await assert.rejects(
      requestSpotifyVolume(
        "test-token",
        "device",
        40,
        (async () => new Response(null, { status })) as typeof fetch,
      ),
      pattern,
    );
});

test("Spotify Connect: dispositivos reales, comandos dirigidos y enlaces completos sin previews", async () => {
  const {
    requestSpotifyDevices,
    requestSpotifyCommand,
    normalizeSpotifyPlayback,
  } = await import("../src/lib/spotify.ts");
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input, init) => {
    calls.push({ url: String(input), init });
    return String(input).endsWith("/devices")
      ? Response.json({
          devices: [
            {
              id: "windows",
              name: "Mi PC",
              type: "Computer",
              is_active: true,
              supports_volume: true,
              volume_percent: 40,
            },
            { id: null },
          ],
        })
      : new Response(null, { status: 204 });
  }) as typeof fetch;
  const devices = await requestSpotifyDevices("token", fetcher);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, "Mi PC");
  assert.equal(devices[0].volume, 40);
  for (const action of ["play", "pause", "next", "previous"] as const)
    await requestSpotifyCommand(
      "token",
      { action, deviceId: "windows" },
      fetcher,
    );
  await requestSpotifyCommand(
    "token",
    { action: "seek", deviceId: "web player", position: 45000 },
    fetcher,
  );
  await requestSpotifyCommand(
    "token",
    { action: "transfer", deviceId: "web player", play: true },
    fetcher,
  );
  await requestSpotifyCommand(
    "token",
    {
      action: "play",
      deviceId: "windows",
      url: "https://open.spotify.com/album/5DFy4n6tGVadO1bqkEQw1I",
    },
    fetcher,
  );
  assert.equal(calls[3].init?.method, "POST");
  assert.equal(new URL(calls[5].url).searchParams.get("position_ms"), "45000");
  assert.deepEqual(JSON.parse(calls[6].init?.body as string), {
    device_ids: ["web player"],
    play: true,
  });
  assert.deepEqual(JSON.parse(calls[7].init?.body as string), {
    context_uri: "spotify:album:5DFy4n6tGVadO1bqkEQw1I",
  });
  const before = calls.length;
  await assert.rejects(
    requestSpotifyCommand(
      "x",
      {
        action: "play",
        deviceId: "windows",
        url: "https://attacker.test/track/123",
      },
      fetcher,
    ),
  );
  await assert.rejects(
    requestSpotifyCommand(
      "x",
      { action: "seek", deviceId: "windows", position: NaN },
      fetcher,
    ),
  );
  assert.equal(calls.length, before);
  await assert.rejects(
    requestSpotifyCommand(
      "x",
      { action: "play", deviceId: "windows" },
      (async () => new Response(null, { status: 404 })) as typeof fetch,
    ),
    /dispositivo/,
  );
  const item = normalizeSpotifyPlayback(
    {
      is_playing: true,
      progress_ms: 1000,
      item: {
        name: "Canción completa",
        duration_ms: 200000,
        artists: [{ name: "Artista" }],
        album: { images: [{ url: "https://i.scdn.co/image/cover" }] },
      },
    },
    1000,
  );
  assert.equal(item?.duration, 200000);
  assert.equal(item?.progress, 1000);
  assert.equal(item?.image, "https://i.scdn.co/image/cover");
});
