"use client";

import type { RefObject } from "react";
import { Download, Volume2, VolumeX } from "lucide-react";

interface VoicePlaybackControlsProps {
  speaking: boolean;
  playbackSpeed: number;
  audioUrl: string | null;
  audioRef: RefObject<HTMLAudioElement>;
  downloadFileName?: string;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
}

export function VoicePlaybackControls({
  speaking,
  playbackSpeed,
  audioUrl,
  audioRef,
  downloadFileName = "agenthub-voice.mp3",
  onToggle,
  onSpeedChange,
}: VoicePlaybackControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        title={speaking ? "Stop reading" : "Read aloud"}
        className="rounded p-1 text-muted-foreground hover:bg-white/10"
      >
        {speaking ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      </button>
      <select
        aria-label="Playback speed"
        title="Playback speed"
        value={playbackSpeed}
        onChange={(event) => onSpeedChange(Number(event.target.value))}
        className="h-6 rounded border border-white/10 bg-transparent px-1 text-[11px] text-muted-foreground"
      >
        {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
          <option key={speed} value={speed}>
            {speed}x
          </option>
        ))}
      </select>
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        controls={Boolean(audioUrl)}
        className={audioUrl ? "h-6 w-28" : "hidden"}
      />
      {audioUrl ? (
        <a
          href={audioUrl}
          download={downloadFileName}
          className="rounded p-1 text-muted-foreground hover:bg-white/10"
          title="Download audio"
        >
          <Download className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
