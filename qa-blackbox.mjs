/* Blackbox QA for DarConverter. Hits the running dev server only. */
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const BASE = process.env.QA_BASE ?? "http://localhost:4321";
const CONVERT = `${BASE}/api/image-convert`;

/**
 * Astro's CSRF protection (security.checkOrigin, on by default) rejects unsafe
 * methods whose Origin header is not the site's own origin. A browser always
 * sends it, so the QA client has to behave like one.
 */
const BROWSER_HEADERS = { origin: BASE };

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
  <rect width="240" height="160" fill="#1d4ed8"/>
  <circle cx="80" cy="80" r="52" fill="#f97316"/>
  <rect x="130" y="40" width="80" height="80" fill="#22c55e"/>
</svg>`;

function makeBmp(size = 8) {
  const rowBytes = Math.ceil((size * 3) / 4) * 4;
  const pixelBytes = rowBytes * size;
  const header = Buffer.alloc(54);

  header.write("BM", 0, "latin1");
  header.writeUInt32LE(54 + pixelBytes, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(size, 18);
  header.writeInt32LE(size, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(0, 30);
  header.writeUInt32LE(pixelBytes, 34);

  const pixels = Buffer.alloc(pixelBytes);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = y * rowBytes + x * 3;
      pixels[offset] = 0x20;
      pixels[offset + 1] = 0x50;
      pixels[offset + 2] = 0xd0;
    }
  }

  return Buffer.concat([header, pixels]);
}

async function fixtures() {
  const base = sharp({
    create: {
      width: 320,
      height: 240,
      channels: 4,
      background: { r: 29, g: 78, b: 216, alpha: 1 }
    }
  });

  const png = await base.clone().png().toBuffer();

  // A shape-rich image gives the vector tracer something to trace.
  const traced = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160">
        <rect width="240" height="160" fill="#f8fafc"/>
        <circle cx="90" cy="80" r="60" fill="#dc2626"/>
        <rect x="140" y="30" width="80" height="100" fill="#0f172a"/>
      </svg>`
    )
  )
    .png()
    .toBuffer();

  return {
    png,
    traced,
    jpg: await base.clone().jpeg().toBuffer(),
    webp: await base.clone().webp().toBuffer(),
    gif: await base.clone().gif().toBuffer(),
    tiff: await base.clone().tiff().toBuffer(),
    avif: await base.clone().avif({ quality: 60 }).toBuffer(),
    bmp: makeBmp(48),
    alphaPng: await sharp({
      create: {
        width: 60,
        height: 60,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0 }
      }
    })
      .png()
      .toBuffer(),
    svg: Buffer.from(SVG),
    svgPath: "sample.svg",
    pngPath: "sample.png",
    jpgPath: "sample.jpg",
    webpPath: "sample.webp"
  };
}

function form(entries) {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        data.append(key, item);
      }
    } else if (value instanceof Blob) {
      data.append(key, value, value.name ?? "upload.bin");
    } else if (value !== undefined && value !== null) {
      data.append(key, String(value));
    }
  }

  return data;
}

/** sharp reports "jpeg"; the app and the tools registry spell it "JPG". */
const SHARP_FORMAT = { JPG: "jpeg", PDF: "pdf", SVG: "svg" };

function filePart(buffer, name, type) {
  const blob = new Blob([buffer], { type });
  blob.name = name;
  return blob;
}

async function convert({ buffer, name, type, output, tool, extra = {} }) {
  const data = form({
    tool,
    output,
    file: filePart(buffer, name, type),
    ...extra
  });

  const response = await fetch(CONVERT, { method: "POST", body: data, headers: BROWSER_HEADERS });
  const bufferOut = Buffer.from(await response.arrayBuffer());

  return {
    response,
    buffer: bufferOut,
    text: response.headers.get("content-type")?.includes("application/json")
      ? bufferOut.toString("utf8")
      : "",
    header: (name) => response.headers.get(name) ?? ""
  };
}

async function checkFormat(label, result, expected) {
  if (!result.response.ok) {
    ok(label, false, `HTTP ${result.response.status} ${result.text.slice(0, 160)}`);
    return null;
  }

  const disposition = result.header("content-disposition");
  const jobId = result.header("x-conversion-job-id");

  if (!jobId) {
    ok(label, false, "missing X-Conversion-Job-Id");
    return null;
  }

  if (expected === "PDF") {
    const isPdf = result.buffer.subarray(0, 5).toString("latin1") === "%PDF-";
    ok(`${label} -> PDF`, isPdf && result.buffer.length > 400, `${result.buffer.length} bytes, ${disposition}`);

    try {
      const doc = await PDFDocument.load(result.buffer);
      console.log(`        pages=${doc.getPageCount()} bytes=${result.buffer.length} dims=${result.header("x-output-width")}x${result.header("x-output-height")}`);
    } catch (error) {
      ok(`${label} -> PDF parseable`, false, error.message);
    }

    return result;
  }

  if (expected === "SVG") {
    const body = result.buffer.toString("utf8");
    const isSvg = /<svg[\s>]/i.test(body);

    ok(
      `${label} -> SVG`,
      isSvg && /<path/i.test(body),
      `${result.buffer.length} bytes, paths=${result.header("x-trace-path-count")}`
    );

    return result;
  }

  try {
    const meta = await sharp(result.buffer).metadata();
    const matches = meta.format === (SHARP_FORMAT[expected] ?? expected.toLowerCase());

    ok(
      `${label} -> ${expected}`,
      matches,
      `decoded=${meta.format} ${meta.width}x${meta.height} bytes=${result.buffer.length}`
    );

    return meta;
  } catch (error) {
    ok(`${label} -> ${expected}`, false, `undecodable: ${error.message}`);
    return null;
  }
}

const fx = await fixtures();

section("Metadata / health");
{
  const response = await fetch(`${BASE}/api/health`);
  const body = await response.json();

  ok("GET /api/health returns 200", response.status === 200, `status=${response.status}`);
  ok("health reports connected", body?.data?.connected === true, JSON.stringify(body).slice(0, 200));
  ok("health reports migrations applied", body?.data?.missingTables?.length === 0, JSON.stringify(body?.data?.missingTables));
  ok("health reports Neon driver", body?.data?.driver === "neon-postgresql", body?.data?.driver);
  ok("health reports DarConverter", body?.data?.appName === "DarConverter", body?.data?.appName);
}

section("All 15 registered converters (real bytes out)");
{
  const rasterCases = [
    ["png-to-jpg", fx.png, fx.pngPath, "image/png", "JPG"],
    ["jpg-to-png", fx.jpg, fx.jpgPath, "image/jpeg", "PNG"],
    ["png-to-webp", fx.png, fx.pngPath, "image/png", "WEBP"],
    ["jpg-to-webp", fx.jpg, fx.jpgPath, "image/jpeg", "WEBP"],
    ["webp-to-png", fx.webp, fx.webpPath, "image/webp", "PNG"],
    ["webp-to-jpg", fx.webp, fx.webpPath, "image/webp", "JPG"],
    ["svg-to-png", fx.svg, fx.svgPath, "image/svg+xml", "PNG"],
    ["svg-to-jpg", fx.svg, fx.svgPath, "image/svg+xml", "JPG"],
    ["svg-to-webp", fx.svg, fx.svgPath, "image/svg+xml", "WEBP"],
    ["image-to-svg", fx.png, fx.pngPath, "image/png", "SVG"],
    ["png-to-svg", fx.traced, "traced.png", "image/png", "SVG"],
    ["jpg-to-svg", fx.jpg, fx.jpgPath, "image/jpeg", "SVG"],
    ["webp-to-svg", fx.webp, fx.webpPath, "image/webp", "SVG"]
  ];

  for (const [slug, buffer, name, type, expected] of rasterCases) {
    const result = await convert({
      buffer,
      name,
      type,
      output: expected,
      tool: slug,
      extra: slug.endsWith("-to-svg") || slug === "image-to-svg"
        ? { traceMode: "color", traceColors: 6 }
        : {}
    });

    await checkFormat(slug, result, expected);
  }

  const singleSvgToPdf = await convert({
    buffer: fx.svg,
    name: fx.svgPath,
    type: "image/svg+xml",
    output: "PDF",
    tool: "svg-to-pdf"
  });

  await checkFormat("svg-to-pdf", singleSvgToPdf, "PDF");
}

section("image-to-pdf with a real multi-file batch");
{
  const data = form({
    tool: "image-to-pdf",
    output: "PDF",
    quality: 90,
    background: "ffffff",
    file: [
      filePart(fx.png, "one.png", "image/png"),
      filePart(fx.jpg, "two.jpg", "image/jpeg"),
      filePart(fx.webp, "three.webp", "image/webp")
    ]
  });

  const response = await fetch(CONVERT, { method: "POST", body: data, headers: BROWSER_HEADERS });
  const buffer = Buffer.from(await response.arrayBuffer());

  ok("batch upload returns 200", response.status === 200, `status=${response.status}`);

  if (response.ok) {
    const doc = await PDFDocument.load(buffer);

    ok("PDF has 3 pages, one per upload", doc.getPageCount() === 3, `pages=${doc.getPageCount()}`);
    // image-convert maps pixels to points as CSS pixels (72/96), by design.
    ok("PDF page size follows the 72/96 CSS pixel rule", doc.getPage(0).getWidth() === 240 && doc.getPage(0).getHeight() === 180, `${doc.getPage(0).getWidth()}x${doc.getPage(0).getHeight()}`);
    ok("batch filename is generic", /filename="images\.pdf"/.test(response.headers.get("content-disposition") ?? ""), response.headers.get("content-disposition"));
  }
}

section("Declared input format coverage");
{
  const inputs = [
    ["avif", fx.avif, "sample.avif", "image/avif", "image-to-pdf", "PDF"],
    ["tiff", fx.tiff, "sample.tiff", "image/tiff", null, "PNG"],
    ["gif", fx.gif, "sample.gif", "image/gif", null, "PNG"]
  ];

  for (const [label, buffer, name, type, tool, output] of inputs) {
    const result = await convert({ buffer, name, type, output, tool });

    await checkFormat(`${label} input`, result, output);
  }

  // BMP is no longer advertised anywhere: this sharp build has no BMP decoder,
  // so the server must reject it up front instead of failing mid-conversion.
  const bmp = await convert({
    buffer: makeBmp(48),
    name: "sample.bmp",
    type: "image/bmp",
    output: "PNG"
  });
  ok("bmp input is refused, not half-supported", bmp.response.status === 400, `status=${bmp.response.status} ${bmp.text.slice(0, 120)}`);

  const bmpPage = await fetch(`${BASE}/image-to-pdf`);
  const bmpHtml = await bmpPage.text();
  ok("bmp is not advertised on tool pages", !/\.bmp|BMP/i.test(bmpHtml), "tool page still mentions BMP");
}

section("Options actually change output");
{
  const resized = await convert({
    buffer: fx.png,
    name: fx.pngPath,
    type: "image/png",
    output: "PNG",
    tool: "png-to-jpg",
    extra: { width: 200 }
  });

  if (resized.response.ok) {
    const resizedMeta = await sharp(resized.buffer).metadata();
    ok("width=200 is applied", resizedMeta.width === 200, `got ${resizedMeta.width}x${resizedMeta.height}`);
  } else {
    ok("width=200 is applied", false, `HTTP ${resized.response.status}`);
  }

  const rotated = await convert({
    buffer: fx.png,
    name: fx.pngPath,
    type: "image/png",
    output: "PNG",
    tool: "png-to-jpg",
    extra: { rotation: 90 }
  });

  if (rotated.response.ok) {
    const rotatedMeta = await sharp(rotated.buffer).metadata();
    ok("rotation=90 swaps axes", rotatedMeta.width === 240 && rotatedMeta.height === 320, `got ${rotatedMeta.width}x${rotatedMeta.height}`);
  } else {
    ok("rotation=90 swaps axes", false, `HTTP ${rotated.response.status}`);
  }

  const flattened = await convert({
    buffer: fx.alphaPng,
    name: "transparent.png",
    type: "image/png",
    output: "JPG",
    tool: "png-to-jpg",
    extra: { background: "ffffff" }
  });

  if (flattened.response.ok) {
    const { data: pixels } = await sharp(flattened.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    ok("background flattens transparent PNG to white", pixels[0] > 250 && pixels[1] > 250 && pixels[2] > 250, `first pixel rgb=${pixels[0]},${pixels[1]},${pixels[2]}`);
  } else {
    ok("background flattens transparent PNG to white", false, `HTTP ${flattened.response.status}`);
  }

  const lowQuality = await convert({
    buffer: fx.traced,
    name: "traced.png",
    type: "image/png",
    output: "JPG",
    tool: "png-to-jpg",
    extra: { quality: 20 }
  });

  const highQuality = await convert({
    buffer: fx.traced,
    name: "traced.png",
    type: "image/png",
    output: "JPG",
    tool: "png-to-jpg",
    extra: { quality: 95 }
  });

  ok("quality changes encoded size", lowQuality.buffer.length < highQuality.buffer.length, `q20=${lowQuality.buffer.length} q95=${highQuality.buffer.length}`);

  const bw = await convert({
    buffer: fx.traced,
    name: "traced.png",
    type: "image/png",
    output: "SVG",
    tool: "png-to-svg",
    extra: { traceMode: "bw", traceColors: 2 }
  });

  ok("bw trace emits X-Trace-Path-Count", bw.header("x-trace-path-count") !== "", `paths=${bw.header("x-trace-path-count")}`);
}

section("Validation and error handling");
{
  const empty = await convert({ buffer: Buffer.alloc(0), name: "empty.png", type: "image/png", output: "PNG" });
  ok("empty file rejected with 400", empty.response.status === 400, `status=${empty.response.status}`);

  const fakePng = await convert({
    buffer: Buffer.from("this is definitely not an image"),
    name: "fake.png",
    type: "image/png",
    output: "PNG"
  });
  ok("non-image content rejected with 400", fakePng.response.status === 400, `status=${fakePng.response.status}`);
  ok("non-image error is explicit", /does not match a supported image format/i.test(fakePng.text), fakePng.text.slice(0, 120));

  const mismatched = await convert({
    buffer: fx.png,
    name: "actually-png.jpg",
    type: "image/jpeg",
    output: "JPG"
  });
  ok("extension/MIME mismatch rejected with 400", mismatched.response.status === 400, `status=${mismatched.response.status}`);
  ok("mismatch error names the real format", /actual file content \(PNG\)/i.test(mismatched.text), mismatched.text.slice(0, 160));

  const oversize = await convert({
    buffer: Buffer.concat([fx.png, Buffer.alloc(51 * 1024 * 1024)]),
    name: "huge.png",
    type: "image/png",
    output: "PNG"
  });
  ok("oversize upload rejected with 400", oversize.response.status === 400, `status=${oversize.response.status}`);
  ok("oversize error states the limit", /Maximum file size is 50 MB/.test(oversize.text), oversize.text.slice(0, 160));

  const heic = await convert({
    buffer: Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypheic"),
      Buffer.alloc(64)
    ]),
    name: "photo.heic",
    type: "image/heic",
    output: "JPG"
  });
  ok("HEIC refused honestly with 400", heic.response.status === 400, `status=${heic.response.status}`);
  ok("HEIC error does not promise a conversion", /not enabled yet/i.test(heic.text), heic.text.slice(0, 160));

  const badOutput = await convert({
    buffer: fx.png,
    name: fx.pngPath,
    type: "image/png",
    output: "MP4"
  });
  ok("unsupported output format rejected with 400", badOutput.response.status === 400, `status=${badOutput.response.status}`);

  const noFile = await fetch(CONVERT, {
    method: "POST",
    headers: BROWSER_HEADERS,
    body: form({ output: "PNG", tool: "png-to-jpg" })
  });
  ok("missing file rejected with 400", noFile.status === 400, `status=${noFile.status}`);

  const notMultipart = await fetch(CONVERT, {
    method: "POST",
    headers: { ...BROWSER_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ output: "PNG" })
  });
  ok("non-multipart body rejected with 400", notMultipart.status === 400, `status=${notMultipart.status}`);

  const multiRaster = await fetch(CONVERT, {
    method: "POST",
    headers: BROWSER_HEADERS,
    body: form({
      output: "PNG",
      file: [filePart(fx.png, "a.png", "image/png"), filePart(fx.jpg, "b.jpg", "image/jpeg")]
    })
  });
  ok("multi-file raster rejected with 400", multiRaster.status === 400, `status=${multiRaster.status}`);

  const wrongMethod = await fetch(CONVERT);
  ok("GET on convert endpoint is not 200", wrongMethod.status !== 200, `status=${wrongMethod.status}`);

  const zeroByteField = await fetch(CONVERT, {
    method: "POST",
    headers: BROWSER_HEADERS,
    body: form({
      output: "JPG",
      file: filePart(fx.png, "ok.png", "image/png"),
      width: "0",
      quality: "0",
      background: "not-a-color",
      rotation: "45"
    })
  });
  const zeroByteBody = await zeroByteField.text();
  ok("out-of-range options are sanitised, not fatal", zeroByteField.status === 200, `status=${zeroByteField.status} ${zeroByteBody.slice(0, 120)}`);
}

section("CSRF origin protection (Astro security.checkOrigin)");
{
  const sameOrigin = await fetch(CONVERT, {
    method: "POST",
    headers: BROWSER_HEADERS,
    body: form({
      output: "PNG",
      file: filePart(fx.png, "same-origin.png", "image/png")
    })
  });
  ok("same-origin POST is allowed", sameOrigin.status === 200, `status=${sameOrigin.status}`);

  const crossOrigin = await fetch(CONVERT, {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: form({
      output: "PNG",
      file: filePart(fx.png, "cross-origin.png", "image/png")
    })
  });
  ok("cross-origin POST is blocked with 403", crossOrigin.status === 403, `status=${crossOrigin.status}`);

  const noOrigin = await fetch(CONVERT, {
    method: "POST",
    body: form({
      output: "PNG",
      file: filePart(fx.png, "no-origin.png", "image/png")
    })
  });
  ok("POST without Origin is blocked with 403 (CLI clients must send Origin)", noOrigin.status === 403, `status=${noOrigin.status}`);
}

section("Pages, routing and branding");
{
  const home = await fetch(BASE);
  const homeHtml = await home.text();

  ok("GET / returns 200", home.status === 200, `status=${home.status}`);
  ok("home is branded DarConverter", homeHtml.includes("DarConverter"));
  ok("home no longer mentions FileForge", !/FileForge/i.test(homeHtml));
  ok("home ships the converter island", /astro-island/.test(homeHtml));
  ok("home exposes the tool picker", homeHtml.includes("tool-picker"));
  ok("home has no fake conversion copy", !/No file was converted/i.test(homeHtml));
  ok("home lists no cleanconvert prototype", !/cleanconvert/i.test(homeHtml));
  ok("home declares a canonical url", /rel="canonical"/.test(homeHtml));

  const slugs = [
    "png-to-jpg", "jpg-to-png", "png-to-webp", "jpg-to-webp", "webp-to-png",
    "webp-to-jpg", "svg-to-png", "svg-to-jpg", "svg-to-webp", "svg-to-pdf",
    "image-to-pdf", "image-to-svg", "png-to-svg", "jpg-to-svg", "webp-to-svg"
  ];

  let allPagesOk = true;

  for (const slug of slugs) {
    const response = await fetch(`${BASE}/${slug}`);
    const html = await response.text();

    if (
      response.status !== 200 ||
      !html.includes("DarConverter") ||
      /FileForge/i.test(html)
    ) {
      allPagesOk = false;
      console.log(`        problem on /${slug}: status=${response.status}`);
    }
  }

  ok(`all ${slugs.length} tool pages render branded`, allPagesOk);

  const faq = await fetch(`${BASE}/png-to-jpg`);
  const faqHtml = await faq.text();
  ok("tool page keeps FAQ structured data", faqHtml.includes("FAQPage"));
  ok("tool page ships a converter island", /astro-island/.test(faqHtml));

  const legacy = await fetch(`${BASE}/cleanconvert`, { redirect: "manual" });
  ok("/cleanconvert is gone (301/404), never a fake converter", [301, 308, 404].includes(legacy.status), `status=${legacy.status}`);

  const missing = await fetch(`${BASE}/definitely-not-a-tool`);
  ok("unknown tool slug returns 404", missing.status === 404, `status=${missing.status}`);
}

console.log(`\n================ RESULT ================`);
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
}

process.exit(failed === 0 ? 0 : 1);
