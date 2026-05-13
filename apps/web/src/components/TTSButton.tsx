"use client";

import { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface TTSButtonProps {
  content: string;
}

export function TTSButton({ content }: TTSButtonProps) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const toggle = () => {
    if (!window.speechSynthesis) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={speaking ? "Stop reading" : "Read aloud"}
      className="p-1 hover:bg-muted rounded text-muted-foreground"
    >
      {speaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
    </button>
  );
}
