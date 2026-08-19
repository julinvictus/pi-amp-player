import { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function App() {
  const audioRef = useRef(null);
  const [sources, setSources] = useState([{ id: 'local', label: 'Local Library' }]);
  const [sourceId, setSourceId] = useState('local');
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const loadSources = useCallback(() => {
    fetch(`${API_BASE}/api/sources`)
      .then((res) => {
        if (!res.ok) throw new Error('request failed');
        return res.json();
      })
      .then((data) => {
        if (data.length) setSources(data);
      })
      .catch(() => {});
  }, []);

  const loadTracks = useCallback((forSourceId) => {
    setStatus('loading');
    fetch(`${API_BASE}/api/tracks?source=${encodeURIComponent(forSourceId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('request failed');
        return res.json();
      })
      .then((data) => {
        setTracks(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    loadSources();
    // poll periodically so a newly connected iPod shows up without a manual refresh
    const interval = setInterval(loadSources, 4000);
    return () => clearInterval(interval);
  }, [loadSources]);

  useEffect(() => {
    loadTracks(sourceId);
  }, [sourceId, loadTracks]);

  const onSourceChange = (e) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
    }
    setIsPlaying(false);
    setCurrentIndex(-1);
    setCurrentTime(0);
    setDuration(0);
    setSourceId(e.target.value);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;

  const playTrackAt = (index) => {
    if (index < 0 || index >= tracks.length) return;
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = `${API_BASE}/api/stream/${currentTrack.id}`;
    audio.load();
    if (isPlaying) audio.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrack) {
      if (tracks.length) playTrackAt(0);
      return;
    }
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const next = () => {
    if (!tracks.length) return;
    playTrackAt((currentIndex + 1) % tracks.length);
  };

  const prev = () => {
    if (!tracks.length) return;
    playTrackAt((currentIndex - 1 + tracks.length) % tracks.length);
  };

  const onSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const pct = Number(e.target.value) / 1000;
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  const progressPct = duration ? (currentTime / duration) * 1000 : 0;

  return (
    <div className="winamp">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onEnded={next}
      />

      <div className="winamp__titlebar">
        <select className="winamp__source" value={sourceId} onChange={onSourceChange}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.label.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="winamp__display">
        <div className="winamp__marquee">
          {currentTrack
            ? `${currentTrack.title}${currentTrack.artist ? ` — ${currentTrack.artist}` : ''}`
            : status === 'loading'
              ? 'Loading library...'
              : status === 'error'
                ? 'Could not reach server'
                : 'No track loaded'}
        </div>
        <div className="winamp__time">{formatTime(currentTime)} / {formatTime(duration)}</div>
      </div>

      <input
        className="winamp__seek"
        type="range"
        min={0}
        max={1000}
        value={progressPct}
        onChange={onSeek}
        disabled={!currentTrack}
      />

      <div className="winamp__controls">
        <button onClick={prev} title="Previous">⏮</button>
        <button onClick={togglePlay} title="Play/Pause">{isPlaying ? '⏸' : '▶'}</button>
        <button onClick={stop} title="Stop">⏹</button>
        <button onClick={next} title="Next">⏭</button>
        <button onClick={() => loadTracks(sourceId)} title="Rescan library">⟳</button>

        <div className="winamp__volume">
          <span>VOL</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="winamp__playlist">
        <div className="winamp__playlist-header">
          Playlist ({tracks.length}) {status === 'loading' && '— scanning...'}
          {status === 'error' && '— server unreachable, check the API'}
        </div>
        <ul>
          {tracks.map((track, index) => (
            <li
              key={track.id}
              className={index === currentIndex ? 'active' : ''}
              onDoubleClick={() => playTrackAt(index)}
            >
              <span className="idx">{index + 1}.</span>
              <span className="title">
                {track.title}{track.artist ? ` — ${track.artist}` : ''}
              </span>
              <span className="dur">{formatTime(track.duration)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
