#!/usr/bin/env node
/**
 * generate-gemini-image.mjs
 * Zero-dependency Gemini Image Generation CLI using the official Interactions REST API.
 * Reads GEMINI_API_KEY from process.env or workspace .env file (never logs the key).
 *
 * Usage:
 *   node .agents/skills/viet-game-art/scripts/generate-gemini-image.mjs \
 *     --prompt "Cute chibi Vietnamese student running..." \
 *     --out "public/assets/minigames/demo/student.png" \
 *     --aspect 1:1 \
 *     --size 1K \
 *     --model gemini-nano-banana-2.1 \
 *     [--ref path/to/reference.png]
 */

import fs from 'node:fs';
import path from 'node:path';

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';
const DEFAULT_MODEL = 'gemini-nano-banana-2.1';
const DEFAULT_ASPECT = '1:1';
const DEFAULT_SIZE = '1K';

function printUsage() {
  console.error(`Usage:
  node generate-gemini-image.mjs --prompt "<text>" --out "<file>" [options]

Options:
  --prompt, -p <text>       Image generation prompt (or use --prompt-file)
  --prompt-file <path>      Read prompt text from a UTF-8 file
  --out, -o <path>          Output image path (.png / .jpg / .webp)
  --aspect, -a <ratio>      Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9 (default: ${DEFAULT_ASPECT})
  --size, -s <size>         Image size: 1K, 2K, 4K (default: ${DEFAULT_SIZE})
  --model, -m <id>          Model ID: gemini-nano-banana-2.1 (default), gemini-3-pro-image, gemini-3.1-flash-lite-image
  --ref, -i <path>          Reference image path (repeatable, up to 14 images)
`);
}

function parseArgs(argv) {
  const args = {
    prompt: '',
    promptFile: '',
    out: '',
    aspect: DEFAULT_ASPECT,
    size: DEFAULT_SIZE,
    model: DEFAULT_MODEL,
    refs: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${flag}`);
      return argv[++i];
    };

    switch (flag) {
      case '--prompt':
      case '-p':
        args.prompt = next();
        break;
      case '--prompt-file':
        args.promptFile = next();
        break;
      case '--out':
      case '-o':
        args.out = next();
        break;
      case '--aspect':
      case '-a':
        args.aspect = next();
        break;
      case '--size':
      case '-s':
        args.size = next();
        break;
      case '--model':
      case '-m':
        args.model = next();
        break;
      case '--ref':
      case '-i':
        args.refs.push(next());
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return args;
}

function loadApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }

  // Walk upward from cwd to find .env
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^GEMINI_API_KEY\s*=\s*(.+)$/);
        if (match) {
          let val = match[1].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1).trim();
          }
          if (val) return val;
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('GEMINI_API_KEY not found in environment or .env file.');
}

function inferMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function findImageInPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // 1. Direct outputs array (Interactions API standard)
  if (Array.isArray(payload.outputs)) {
    for (const item of payload.outputs) {
      if (item?.type === 'image' && item.data) {
        return { data: item.data, mimeType: item.mime_type || item.mimeType || 'image/png' };
      }
      if (item?.content && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part?.type === 'image' && part.data) {
            return { data: part.data, mimeType: part.mime_type || part.mimeType || 'image/png' };
          }
        }
      }
    }
  }

  // 2. Steps array
  if (Array.isArray(payload.steps)) {
    for (const step of payload.steps) {
      const contents = step?.content || step?.outputs;
      if (Array.isArray(contents)) {
        for (const part of contents) {
          if (part?.type === 'image' && part.data) {
            return { data: part.data, mimeType: part.mime_type || part.mimeType || 'image/png' };
          }
        }
      }
    }
  }

  // 3. Fallback: recursive scan for { type: "image", data: "<base64>" }
  const stack = [payload];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'image' && typeof node.data === 'string' && node.data.length > 100) {
      return { data: node.data, mimeType: node.mime_type || node.mimeType || 'image/png' };
    }
    if (node.inlineData?.data && typeof node.inlineData.data === 'string') {
      return { data: node.inlineData.data, mimeType: node.inlineData.mimeType || 'image/png' };
    }
    for (const val of Object.values(node)) {
      if (val && typeof val === 'object') stack.push(val);
    }
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let prompt = args.prompt;
  if (args.promptFile) {
    prompt = fs.readFileSync(args.promptFile, 'utf8').trim();
  }
  if (!prompt) {
    printUsage();
    throw new Error('Missing --prompt or --prompt-file');
  }
  if (!args.out) {
    printUsage();
    throw new Error('Missing --out path');
  }

  const apiKey = loadApiKey();

  let input = prompt;
  if (args.refs.length > 0) {
    input = [{ type: 'text', text: prompt }];
    for (const refPath of args.refs) {
      const buf = fs.readFileSync(refPath);
      input.push({
        type: 'image',
        data: buf.toString('base64'),
        mime_type: inferMimeType(refPath),
      });
    }
  }

  const body = {
    model: args.model,
    input,
    response_format: {
      type: 'image',
      aspect_ratio: args.aspect,
      image_size: args.size,
    },
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Api-Revision': API_REVISION,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini API HTTP ${response.status}: ${text.slice(0, 600)}`);
  }

  const json = JSON.parse(text);
  const img = findImageInPayload(json);
  if (!img) {
    const summary = JSON.stringify(json, (k, v) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 80)}...(${v.length})` : v), 2);
    throw new Error(`No image returned in Gemini response. Shape:\n${summary.slice(0, 1000)}`);
  }

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const buffer = Buffer.from(img.data, 'base64');
  fs.writeFileSync(outPath, buffer);

  console.log(`OK: ${outPath} (${buffer.length} bytes, ${img.mimeType}, model=${args.model}, aspect=${args.aspect}, size=${args.size})`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
