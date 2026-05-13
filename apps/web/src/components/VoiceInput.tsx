"use client";

import { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggle = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const win = window as any;
    const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SR) {
      alert("Browser speech recognition not supported in this browser.");
      return;
    }

    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript as string | undefined;
      if (transcript) onTranscript(transcript);
    };
    r.onend = () => setRecording(false);
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={recording ? "Stop recording" : "Voice input"}
      className={`p-1.5 rounded-lg transition-colors ${
        recording
          ? "text-red-500 animate-pulse bg-red-50 dark:bg-red-950"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
