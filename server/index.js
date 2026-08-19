import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';

const app = express();
app.use(cors());

const MUSIC_DIR = process.env.MUSIC_DIR;
const PORT = process.env.PORT || 4000;
const VOLUMES_DIR = '/Volumes';
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.m4b', '.aac'];

if (!MUSIC_DIR) {
  console.error('MUSIC_DIR is not set. Copy .env.example to .env and set MUSIC_DIR to your mp3 folder.');
  process.exit(1);
}

// id -> absolute file path, accumulated across scans (spans all sources, ids are unique per absolute path)
const trackIndex = new Map();

function idFor(absolutePath) {
  return crypto.createHash('sha1').update(absolutePath).digest('hex').slice(0, 16);
}

async function findIpodControlDir(volumePath) {
  let entries;
  try {
    entries = await fsp.readdir(volumePath, { withFileTypes: true });
  } catch {
    return null;
  }
  const match = entries.find(
    (e) => e.isDirectory() && e.name.toLowerCase() === 'ipod_control'
  );
  return match ? path.join(volumePath, match.name) : null;
}

async function detectSources() {
  const sources = [{ id: 'local', label: 'Local Library', dir: MUSIC_DIR }];

  let volumes;
  try {
    volumes = await fsp.readdir(VOLUMES_DIR, { withFileTypes: true });
  } catch {
    volumes = [];
  }

  for (const volume of volumes) {
    if (!volume.isDirectory()) continue;
    const volumePath = path.join(VOLUMES_DIR, volume.name);
    const ipodControlDir = await findIpodControlDir(volumePath);
    if (!ipodControlDir) continue;
    const musicDir = path.join(ipodControlDir, 'Music');
    if (!fs.existsSync(musicDir)) continue;
    sources.push({ id: `ipod:${volume.name}`, label: `iPod (${volume.name})`, dir: musicDir });
  }

  return sources;
}

async function walk(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && AUDIO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function scanLibrary(dir) {
  const files = await walk(dir);
  const tracks = [];

  for (const filePath of files) {
    const id = idFor(filePath);
    trackIndex.set(id, filePath);

    let title = path.basename(filePath, path.extname(filePath));
    let artist = '';
    let album = '';
    let duration = 0;

    try {
      const meta = await parseFile(filePath, { duration: true, skipCovers: true });
      title = meta.common.title || title;
      artist = meta.common.artist || '';
      album = meta.common.album || '';
      duration = meta.format.duration || 0;
    } catch {
      // fall back to filename-derived metadata if tags can't be parsed
      // (iPod files in particular use obfuscated names, so this is a last resort)
    }

    tracks.push({ id, title, artist, album, duration });
  }

  tracks.sort((a, b) => a.title.localeCompare(b.title));
  return tracks;
}

app.get('/api/sources', async (_req, res) => {
  try {
    const sources = await detectSources();
    res.json(sources.map(({ id, label }) => ({ id, label })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to detect sources' });
  }
});

app.get('/api/tracks', async (req, res) => {
  try {
    const sourceId = req.query.source || 'local';
    const sources = await detectSources();
    const source = sources.find((s) => s.id === sourceId);
    if (!source) {
      return res.status(404).json({ error: `Unknown source: ${sourceId}` });
    }
    const tracks = await scanLibrary(source.dir);
    res.json(tracks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to scan music library' });
  }
});

app.get('/api/stream/:id', (req, res) => {
  const filePath = trackIndex.get(req.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Track not found' });
  }

  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === '.mp3' ? 'audio/mpeg' : ext === '.aac' ? 'audio/aac' : 'audio/mp4';

  if (!range) {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': contentType,
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
});

app.listen(PORT, () => {
  console.log(`Pi-amp player server running on http://localhost:${PORT}`);
  console.log(`Serving mp3s from ${MUSIC_DIR}`);
});
