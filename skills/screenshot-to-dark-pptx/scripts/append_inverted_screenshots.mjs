#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"]);
const CM_TO_PX = 96 / 2.54;

function usage() {
  return `Usage:
  node append_inverted_screenshots.mjs \\
    --pptx /abs/source.pptx \\
    (--image /abs/image.png | --image-dir /abs/screenshots) ... \\
    --output /abs/output.pptx \\
    --presentation-skill-dir /abs/presentations/skills/presentations \\
    --python /abs/python3

Optional:
  --width-cm 30       Preferred image width; tall images scale down to fit slide height
  --left-cm 0         Explicit left offset; overrides --align
  --top-cm 0          Top offset
  --align left        left, center, or right
`;
}

function parseArgs(argv) {
  const options = {
    images: [],
    imageDirs: [],
    widthCm: 30,
    topCm: 0,
    align: "left",
    leftCm: null,
  };
  const valueFlags = new Set([
    "--pptx", "--image", "--image-dir", "--output", "--presentation-skill-dir",
    "--python", "--width-cm", "--left-cm", "--top-cm", "--align",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (!valueFlags.has(flag)) throw new Error(`Unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    index += 1;

    if (flag === "--pptx") options.pptx = value;
    else if (flag === "--image") options.images.push(value);
    else if (flag === "--image-dir") options.imageDirs.push(value);
    else if (flag === "--output") options.output = value;
    else if (flag === "--presentation-skill-dir") options.presentationSkillDir = value;
    else if (flag === "--python") options.python = value;
    else if (flag === "--width-cm") options.widthCm = Number(value);
    else if (flag === "--left-cm") options.leftCm = Number(value);
    else if (flag === "--top-cm") options.topCm = Number(value);
    else if (flag === "--align") options.align = value;
  }

  for (const key of ["pptx", "output", "presentationSkillDir", "python"]) {
    if (!options[key]) throw new Error(`Missing required argument: ${key}`);
  }
  if (options.images.length === 0 && options.imageDirs.length === 0) {
    throw new Error("Provide at least one --image or --image-dir");
  }
  if (!["left", "center", "right"].includes(options.align)) {
    throw new Error("--align must be left, center, or right");
  }
  for (const [name, value] of [["width-cm", options.widthCm], ["top-cm", options.topCm]]) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number`);
  }
  if (options.widthCm === 0) throw new Error("--width-cm must be greater than zero");
  if (options.leftCm !== null && (!Number.isFinite(options.leftCm) || options.leftCm < 0)) {
    throw new Error("--left-cm must be a non-negative number");
  }
  return options;
}

async function assertFile(filePath, description) {
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats?.isFile()) throw new Error(`${description} is not a file: ${filePath}`);
}

async function collectImages(options) {
  const paths = [...options.images];
  for (const directory of options.imageDirs) {
    const stats = await fs.stat(directory).catch(() => null);
    if (!stats?.isDirectory()) throw new Error(`Image directory not found: ${directory}`);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        paths.push(path.join(directory, entry.name));
      }
    }
  }

  const unique = [...new Set(paths.map((item) => path.resolve(item)))];
  const collator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });
  unique.sort((a, b) => collator.compare(path.basename(a), path.basename(b)) || collator.compare(a, b));
  if (unique.length === 0) throw new Error("No supported image files were found");
  await Promise.all(unique.map((filePath) => assertFile(filePath, "Image")));
  return unique;
}

function resolveRuntimeModules() {
  if (process.env.CODEX_NODE_MODULES) return path.resolve(process.env.CODEX_NODE_MODULES);
  return path.resolve(path.dirname(process.execPath), "..", "node_modules");
}

async function importRuntimePackage(packageName) {
  const runtimeModules = resolveRuntimeModules();
  const runtimeRequire = createRequire(path.join(runtimeModules, "_codex_skill_resolver.cjs"));
  const entry = runtimeRequire.resolve(packageName);
  return import(pathToFileURL(entry).href);
}

async function readSlideSizeEmu(sourceBytes, JSZip) {
  const zip = await JSZip.loadAsync(sourceBytes);
  const entry = zip.file("ppt/presentation.xml");
  if (!entry) throw new Error("ppt/presentation.xml is missing from the source PPTX");
  const xml = await entry.async("text");
  const tag = xml.match(/<p:sldSz\b[^>]*>/)?.[0];
  const cx = tag?.match(/\bcx="(\d+)"/)?.[1];
  const cy = tag?.match(/\bcy="(\d+)"/)?.[1];
  if (!cx || !cy) throw new Error("Unable to read the source slide size");
  return `${cx},${cy}`;
}

function imageLeft(options, slideWidth, imageWidth) {
  if (options.leftCm !== null) return options.leftCm * CM_TO_PX;
  if (options.align === "center") return Math.max(0, (slideWidth - imageWidth) / 2);
  if (options.align === "right") return Math.max(0, slideWidth - imageWidth);
  return 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.RUNTIME_NODE_MODULES = resolveRuntimeModules();
  const sourcePath = path.resolve(options.pptx);
  const outputPath = path.resolve(options.output);
  const presentationSkillDir = path.resolve(options.presentationSkillDir);
  const pythonPath = path.resolve(options.python);

  if (sourcePath === outputPath) throw new Error("Output must be a new file; refusing to overwrite the source PPTX");
  await assertFile(sourcePath, "Source PPTX");
  await assertFile(pythonPath, "Python executable");
  if (await fs.stat(outputPath).catch(() => null)) throw new Error(`Output already exists: ${outputPath}`);

  const imagePaths = await collectImages(options);
  const [{ FileBlob, PresentationFile }, sharpModule, jsZipModule] = await Promise.all([
    importRuntimePackage("@oai/artifact-tool"),
    importRuntimePackage("sharp"),
    importRuntimePackage("jszip"),
  ]);
  const sharp = sharpModule.default ?? sharpModule;
  const JSZip = jsZipModule.default ?? jsZipModule;

  const sourceBytes = await fs.readFile(sourcePath);
  const expectedSlideSizeEmu = await readSlideSizeEmu(sourceBytes, JSZip);
  const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
  const originalSlideCount = presentation.slides.items.length;
  const firstSlide = presentation.slides.items[0];
  if (!firstSlide) throw new Error("The source PPTX has no slides");
  const firstLayout = JSON.parse(await (await firstSlide.export({ format: "layout" })).text());
  const slideWidth = firstLayout.slide?.frame?.width ?? 1280;
  const slideHeight = firstLayout.slide?.frame?.height ?? 720;
  const preferredImageWidth = options.widthCm * CM_TO_PX;
  const top = options.topCm * CM_TO_PX;
  const availableHeight = slideHeight - top;
  if (availableHeight <= 0) throw new Error("--top-cm must leave some usable slide height");

  const blankLayout = presentation.layouts.add("Blank");
  for (const [index, imagePath] of imagePaths.entries()) {
    const transformed = await sharp(imagePath)
      .grayscale()
      .negate({ alpha: false })
      .png()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = transformed.info;
    if (!width || !height) throw new Error(`Unable to read image dimensions: ${imagePath}`);

    let imageWidth = preferredImageWidth;
    let imageHeight = imageWidth * (height / width);
    if (imageHeight > availableHeight) {
      imageHeight = availableHeight;
      imageWidth = imageHeight * (width / height);
    }

    const slide = presentation.slides.add({ layoutId: blankLayout.id });
    slide.background.fill = "#000000";
    slide.images.add({
      blob: new Uint8Array(transformed.data),
      contentType: "image/png",
      alt: `Inverted screenshot ${index + 1}: ${path.basename(imagePath)}`,
      fit: "contain",
      position: {
        left: imageLeft(options, slideWidth, imageWidth),
        top,
        width: imageWidth,
        height: imageHeight,
      },
    });
  }

  const outputDir = path.dirname(outputPath);
  const workspaceDir = path.dirname(outputDir);
  const stagingDir = path.join(workspaceDir, ".codex-finalizer");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(stagingDir, { recursive: true });
  const candidatePath = path.join(stagingDir, `${path.parse(outputPath).name}.candidate.pptx`);
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

  const utilsPath = path.join(presentationSkillDir, "container_tools", "artifact_tool_utils.mjs");
  const { finalizePresentation } = await import(pathToFileURL(utilsPath).href);
  const expectedTotal = originalSlideCount + imagePaths.length;
  await finalizePresentation({
    workspaceDir,
    candidatePath,
    finalPath: outputPath,
    pythonExecutable: pythonPath,
    integrityValidatorPath: path.join(presentationSkillDir, "container_tools", "inspect_presentation_package_integrity.py"),
    layoutValidatorPath: path.join(presentationSkillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
    layoutArgs: ["--expected-slide-size-emu", expectedSlideSizeEmu],
    explicitTotalSlideCount: expectedTotal,
    requiredNativeTableOwnerSlides: [],
    requiredNativeChartOwnerSlides: [],
    verifyArtifactToolImport: true,
    receiptPath: path.join(stagingDir, `${path.basename(outputPath)}.validation.json`),
  });

  console.log(JSON.stringify({
    source: sourcePath,
    output: outputPath,
    originalSlideCount,
    appendedSlideCount: imagePaths.length,
    totalSlideCount: expectedTotal,
    firstImage: imagePaths[0],
    lastImage: imagePaths.at(-1),
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  console.error(usage());
  process.exitCode = 1;
});
