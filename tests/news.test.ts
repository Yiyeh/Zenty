import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  parseRssOrAtom,
  createNewsApi,
  cleanText,
  decodeHtmlEntities,
  extractImageUrl,
} from "../server/news-api.ts";
import {
  parseNewsTags,
  matchesKeyword,
  formatRelativeTime,
  calculateReadTime,
} from "../src/lib/news.ts";

test("Noticias: decodificación HTML y limpieza de texto", () => {
  assert.equal(
    decodeHtmlEntities("&quot;Hola &amp; Adi&oacute;s&#39; &#x20; &lt;b&gt;"),
    "\"Hola & Adiós'   <b>",
  );
  assert.equal(
    cleanText(
      "<p>Este es un <strong>texto con formato</strong> y <a href='#'>enlaces</a>.</p>",
    ),
    "Este es un texto con formato y enlaces.",
  );
  assert.equal(
    cleanText("<![CDATA[Noticia con <em>CDATA</em> y &amp; entidad]]>"),
    "Noticia con CDATA y & entidad",
  );
});

test("Noticias: extracción de imágenes de RSS y Atom", () => {
  const sampleMedia =
    '<media:content url="https://ejemplo.com/foto.jpg" medium="image" />';
  assert.equal(extractImageUrl(sampleMedia), "https://ejemplo.com/foto.jpg");

  const sampleEnclosure =
    '<enclosure url="https://ejemplo.com/banner.png" type="image/png" />';
  assert.equal(
    extractImageUrl(sampleEnclosure),
    "https://ejemplo.com/banner.png",
  );

  const sampleImg =
    '<description><![CDATA[<img src="https://ejemplo.com/portada.webp" alt="test" /> Noticia]]></description>';
  assert.equal(extractImageUrl(sampleImg), "https://ejemplo.com/portada.webp");
});

test("Noticias: parseo de feeds RSS 2.0 y Atom", () => {
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Canal de Prueba</title>
        <item>
          <title><![CDATA[Nuevo avance en IA revoluciona el desarrollo]]></title>
          <link>https://xataka.com/ia-avance</link>
          <description><![CDATA[<img src="https://xataka.com/img.jpg" /> Descripción del avance con detalles técnicos.]]></description>
          <pubDate>Sat, 17 Oct 2026 12:00:00 GMT</pubDate>
          <category><![CDATA[Inteligencia Artificial]]></category>
          <category>Tecnología</category>
        </item>
      </channel>
    </rss>`;

  const source = {
    id: "test_tech",
    name: "Tech Test",
    siteUrl: "https://test.com",
    feedUrl: "https://test.com/rss",
    category: "tech" as const,
    language: "es" as const,
    color: "#3b82f6",
    enabled: true,
  };

  const parsedRss = parseRssOrAtom(rssXml, source);
  assert.equal(parsedRss.length, 1);
  assert.equal(
    parsedRss[0].title,
    "Nuevo avance en IA revoluciona el desarrollo",
  );
  assert.equal(parsedRss[0].link, "https://xataka.com/ia-avance");
  assert.equal(parsedRss[0].imageUrl, "https://xataka.com/img.jpg");
  assert.equal(parsedRss[0].tags.includes("Inteligencia Artificial"), true);
  assert.equal(parsedRss[0].source.name, "Tech Test");

  const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed</title>
      <entry>
        <title>Nuevo juego anunciado para Nintendo Switch</title>
        <link rel="alternate" href="https://vandal.com/switch-game" />
        <summary>Un título clásico vuelve renovado.</summary>
        <updated>2026-10-17T14:30:00Z</updated>
        <category term="Nintendo" />
      </entry>
    </feed>`;

  const gamingSource = {
    id: "test_gaming",
    name: "Gaming Test",
    siteUrl: "https://vandal.com",
    feedUrl: "https://vandal.com/atom",
    category: "gaming" as const,
    language: "es" as const,
    color: "#10b981",
    enabled: true,
  };

  const parsedAtom = parseRssOrAtom(atomXml, gamingSource);
  assert.equal(parsedAtom.length, 1);
  assert.equal(
    parsedAtom[0].title,
    "Nuevo juego anunciado para Nintendo Switch",
  );
  assert.equal(parsedAtom[0].link, "https://vandal.com/switch-game");
  assert.equal(parsedAtom[0].tags.includes("Nintendo"), true);
});

test("Noticias: búsqueda, tags y coincidencias", () => {
  const article = {
    id: "test:1",
    title: "Sony presenta PlayStation 6 en Tokio",
    link: "https://ejemplo.com/ps6",
    summary:
      "La nueva consola promete gráficos ultrarrealistas y retrocompatibilidad.",
    publishedAt: new Date().toISOString(),
    source: { id: "test", name: "PlayStation Blog" },
    category: "gaming" as const,
    imageUrl: null,
    tags: ["PlayStation", "Hardware", "Consolas"],
    readTimeMinutes: 3,
  };

  assert.equal(matchesKeyword(article, "playstation"), true);
  assert.equal(matchesKeyword(article, "tokio"), true);
  assert.equal(matchesKeyword(article, "hardware"), true);
  assert.equal(matchesKeyword(article, "xbox"), false);

  const tags = parseNewsTags(
    "IA, PlayStation, Nintendo, , Manga; Anime\nCiencia",
  );
  assert.deepEqual(tags, [
    "IA",
    "PlayStation",
    "Nintendo",
    "Manga",
    "Anime",
    "Ciencia",
  ]);

  assert.equal(formatRelativeTime(new Date().toISOString()), "hace un momento");
  assert.equal(calculateReadTime("Palabra ".repeat(300)), 2);
});

test("Noticias: endpoint API /api/news con filtrado y servidor local", async (t) => {
  const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Canal Simulado</title>
        <item>
          <title>Manga Berserk nuevo capítulo confirmado</title>
          <link>https://ramenparados.com/berserk-nuevo</link>
          <description>El equipo continúa la obra maestra de Kentaro Miura.</description>
          <pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate>
          <category>Berserk</category>
          <category>Manga</category>
        </item>
        <item>
          <title>NVIDIA anuncia nueva arquitectura de GPUs</title>
          <link>https://xataka.com/nvidia-nueva-gpu</link>
          <description>Mayor eficiencia energética y aceleración de IA.</description>
          <pubDate>Sat, 17 Oct 2026 09:00:00 GMT</pubDate>
          <category>Hardware</category>
          <category>IA</category>
        </item>
      </channel>
    </rss>`;

  const mockFetcher = (async () => {
    return new Response(mockXml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }) as unknown as typeof fetch;

  const handler = createNewsApi({ fetcher: mockFetcher });
  const server = createServer((req, res) => {
    void handler(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}/api/news`;

  // 1. Fetch all
  const resAll = await fetch(baseUrl);
  assert.equal(resAll.status, 200);
  const dataAll = await resAll.json();
  assert.equal(Array.isArray(dataAll.items), true);
  assert.equal(dataAll.items.length >= 2, true);

  // 2. Filter by search query
  const resQuery = await fetch(`${baseUrl}?q=berserk`);
  const dataQuery = await resQuery.json();
  assert.equal(dataQuery.items.length >= 1, true);
  assert.equal(
    dataQuery.items.every(
      (it: any) =>
        it.title.includes("Berserk") || it.summary.includes("Berserk"),
    ),
    true,
  );

  // 3. Filter by tag
  const resTag = await fetch(`${baseUrl}?tag=hardware`);
  const dataTag = await resTag.json();
  assert.equal(
    dataTag.items.some(
      (it: any) =>
        it.tags.includes("Hardware") || it.title.includes("Hardware"),
    ),
    true,
  );
});

test("Noticias: valida caché y descarta enlaces ejecutables o datos incompletos", async () => {
  const { normalizeNewsFeed } = await import("../src/lib/news.ts");
  const valid = {
    id: "1",
    title: "Tecnología",
    link: "https://example.com/a",
    summary: "Análisis",
    source: { id: "test", name: "Test" },
    category: "tech",
    imageUrl: "javascript:alert(1)",
    publishedAt: "invalid",
    tags: ["IA", null],
  };
  const result = normalizeNewsFeed({
    items: [valid, { ...valid, link: "javascript:alert(1)" }, {}],
    sources: [],
    updatedAt: new Date().toISOString(),
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].imageUrl, null);
  assert.equal(result.items[0].publishedAt, null);
  assert.deepEqual(result.items[0].tags, ["IA"]);
  assert.equal(matchesKeyword(result.items[0], "tecnologia"), true);
  assert.throws(() => normalizeNewsFeed({ items: [] }));
});

test("Noticias: widget y sección comparten petición, TTL y actualización manual", async () => {
  const { createNewsFeedClient } = await import("../src/lib/news-client.ts");
  let calls = 0;
  let time = 1000;
  const client = createNewsFeedClient(
    (async () => {
      calls++;
      await new Promise((done) => setTimeout(done, 10));
      return Response.json({
        items: [],
        sources: [],
        updatedAt: new Date().toISOString(),
        total: 0,
      });
    }) as typeof fetch,
    () => time,
  );
  await Promise.all([client(), client()]);
  assert.equal(calls, 1);
  await client();
  assert.equal(calls, 1);
  await client({ refresh: true });
  assert.equal(calls, 2);
  time += 300_001;
  await client();
  assert.equal(calls, 3);
});

test("Noticias: reiniciar no rejuvenece caché antigua y una caída conserva su fecha", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "zenty-news-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let time = Date.parse("2026-10-17T12:00:00Z");
  let calls = 0;
  const xml =
    "<rss><channel><item><title>Noticia</title><link>https://example.com/story</link><description>Resumen de la noticia</description></item></channel></rss>";
  let handler = createNewsApi({
    directory,
    now: () => time,
    fetcher: (async () => {
      calls++;
      return new Response(xml);
    }) as typeof fetch,
  });
  const server = createServer((req, res) => {
    void handler(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/news`;
  const first = await (await fetch(base)).json();
  const initialCalls = calls;
  await fetch(base);
  assert.equal(calls, initialCalls);
  time += 16 * 60_000;
  handler = createNewsApi({
    directory,
    now: () => time,
    fetcher: (async () => {
      calls++;
      throw new Error("Offline");
    }) as typeof fetch,
  });
  const cached = await (await fetch(`${base}?limit=nope`)).json();
  assert.equal(cached.items.length, 1);
  assert.equal(cached.stale, true);
  assert.equal(cached.updatedAt, first.updatedAt);
  assert.ok(calls > initialCalls);
  assert.equal(
    (
      await fetch(
        `${base}/image?url=${encodeURIComponent("https://127.0.0.1/private")}`,
      )
    ).status,
    502,
  );
  assert.equal(
    (await fetch(base, { headers: { origin: "https://example.com" } })).status,
    403,
  );
});
