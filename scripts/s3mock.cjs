const http = require("http");

const store = new Map();
const port = Number(process.argv[2] || 9100);

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, HEAD, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "ETag, Content-Length, Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const parts = path.split("/");
  const bucket = parts.shift();
  const key = parts.join("/");

  if (req.method === "GET" && !key && url.searchParams.get("list-type") === "2") {
    const prefix = url.searchParams.get("prefix") || "";
    const maxKeys = Math.max(1, Number(url.searchParams.get("max-keys") || 1000));
    const token = url.searchParams.get("continuation-token") || "";
    const prefixId = `${bucket}/`;
    const all = [...store.keys()]
      .filter((id) => id.startsWith(prefixId))
      .map((id) => ({ key: id.slice(prefixId.length), ...store.get(id) }))
      .filter((object) => object.key.startsWith(prefix))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const nextIndex = all.findIndex((object) => object.key > token);
    const start = token ? (nextIndex === -1 ? all.length : nextIndex) : 0;
    const page = all.slice(start, start + maxKeys);
    const last = page[page.length - 1];
    const truncated = Boolean(last) && all.some((object) => object.key > last.key);
    const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const contents = page
      .map(
        (object) =>
          `<Contents><Key>${escape(object.key)}</Key><LastModified>${new Date().toISOString()}</LastModified>` +
          `<ETag>"mock-etag"</ETag><Size>${object.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
      )
      .join("");
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket}</Name>` +
      `<Prefix>${escape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys>` +
      `<IsTruncated>${truncated}</IsTruncated>` +
      (truncated ? `<NextContinuationToken>${escape(last.key)}</NextContinuationToken>` : "") +
      `${contents}</ListBucketResult>`;
    res.setHeader("Content-Type", "application/xml");
    res.writeHead(200);
    res.end(xml);
    return;
  }

  if (!key) {
    res.writeHead(200);
    res.end("");
    return;
  }
  const id = `${bucket}/${key}`;

  if (req.method === "PUT") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      store.set(id, { body, contentType: req.headers["content-type"] || "application/octet-stream" });
      res.setHeader("ETag", '"mock-etag"');
      res.writeHead(200);
      res.end("");
    });
    return;
  }
  if (req.method === "HEAD") {
    const obj = store.get(id);
    if (!obj) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Length", String(obj.body.length));
    res.setHeader("Content-Type", obj.contentType);
    res.writeHead(200);
    res.end();
    return;
  }
  if (req.method === "GET") {
    const obj = store.get(id);
    if (!obj) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", obj.contentType);
    res.setHeader("Content-Length", String(obj.body.length));
    res.writeHead(200);
    res.end(obj.body);
    return;
  }
  if (req.method === "DELETE") {
    store.delete(id);
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(405);
  res.end();
});

server.listen(port, "0.0.0.0", () => console.log(`s3mock listening on ${port}`));
