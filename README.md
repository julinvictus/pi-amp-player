# Pi-amp JS

A local MP3 player: Node/Express backend that scans a folder on your machine and streams the files, React frontend styled like classic Winamp.

Designed to turn a Raspberry Pi into a music player.

Dropdown allows to pick a local folder or read songs from an iPod/mp3 player.

## Setup

**Backend**
```
cd server
npm install
cp .env.example .env   # edit MUSIC_DIR to point at your mp3 folder
npm start               # http://localhost:4000
```

**Frontend**
```
cd client
npm install
npm run dev              # http://localhost:5173
```

Open http://localhost:5173 in your browser. The player scans `MUSIC_DIR` recursively for `.mp3` files, reads ID3 tags (title/artist/album/duration) via `music-metadata`, and streams playback through `/api/stream/:id` with HTTP range support (so seeking works).

Click ⟳ in the player to rescan the folder after adding new files. Double-click a playlist row to play it.

## Notes
- `MUSIC_DIR` is currently set to `~/Downloads` for testing since that's where mp3s were found — change it in `server/.env` to your actual music library path.
- Both dev servers need to be running at once (server on 4000, client on 5173).
