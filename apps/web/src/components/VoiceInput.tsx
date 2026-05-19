"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  continuous?: boolean;
  disabled?: boolean;
}

function useSttSettings() {
  const { activeSessionId, sessions, agents } = useChatStore();
  return useMemo(() => {
    const session = sessions.find((item) => item.id === activeSessionId);
    const agent = session?.agentId ? agents.find((item) => item.id === session.agentId) : undefined;
    return {
      providerId: agent?.sttProvider || "browser",
    };
  }, [activeSessionId, sessions, agents]);
}

export function VoiceInput({ onTranscript, continuous = false, disabled = false }: VoiceInputProps) {
  const sttSettings = useSttSettings();
  const [recording, setRecording] = useState(false);
  const [continuousActive, setContinuousActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const continuousActiveRef = useRef(false);
  const disabledRef = useRef(disabled);
  const manualStopRef = useRef(false);
  const pausedForPlaybackRef = useRef(false);

  const stopMediaStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const stopCapture = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopMediaStream();
    setRecording(false);
  }, [stopMediaStream]);

  const startBrowserRecognition = useCallback(
    (continuousMode = false) => {
      if (disabledRef.current || pausedForPlaybackRef.current || recognitionRef.current) return;
      const win = window as any;
      const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;
      if (!SR) {
        alert("Browser speech recognition not supported in this browser.");
        return;
      }

      const r = new SR();
      r.continuous = continuousMode;
      r.interimResults = false;
      r.onresult = (e: any) => {
        const results = Array.from(e.results ?? []).slice(e.resultIndex ?? 0) as any[];
        const transcript = results
          .map((result) => result?.[0]?.transcript)
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .trim();
        if (transcript) onTranscript(transcript);
      };
      r.onend = () => {
        recognitionRef.current = null;
        setRecording(false);
        if (
          continuousActiveRef.current &&
          !manualStopRef.current &&
          !disabledRef.current &&
          !pausedForPlaybackRef.current
        ) {
          window.setTimeout(() => startBrowserRecognition(true), 250);
        }
      };
      recognitionRef.current = r;
      r.start();
      setRecording(true);
    },
    [onTranscript],
  );

  const submitProviderRecording = useCallback(
    async (blob: Blob) => {
      const formData = new FormData();
      formData.append("providerId", sttSettings.providerId);
      formData.append("audio", blob, "voice-input.webm");

      const res = await fetch("/api/voice/stt", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Provider STT unavailable");
      const data = (await res.json()) as { text?: string };
      if (data.text) onTranscript(data.text);
    },
    [onTranscript, sttSettings.providerId],
  );

  const startProviderRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      startBrowserRecognition(false);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      stopMediaStream();
      setRecording(false);
      void submitProviderRecording(blob).catch(() => {
        alert("Provider speech-to-text failed. Browser speech recognition remains available as a fallback.");
      });
    };
    recorder.start();
    setRecording(true);
  }, [startBrowserRecognition, stopMediaStream, submitProviderRecording]);

  const toggle = useCallback(() => {
    if (recording || continuousActiveRef.current) {
      manualStopRef.current = true;
      continuousActiveRef.current = false;
      setContinuousActive(false);
      stopCapture();
      return;
    }

    manualStopRef.current = false;
    if (continuous) {
      continuousActiveRef.current = true;
      setContinuousActive(true);
      startBrowserRecognition(true);
      return;
    }

    if (sttSettings.providerId !== "browser") {
      void startProviderRecording().catch(() => startBrowserRecognition());
      return;
    }

    startBrowserRecognition();
  }, [continuous, recording, startBrowserRecognition, startProviderRecording, stopCapture, sttSettings.providerId]);

  useEffect(() => {
    if (!continuousActiveRef.current) return;
    if (disabled) {
      stopCapture();
      return;
    }
    if (!recording && !pausedForPlaybackRef.current) {
      startBrowserRecognition(true);
    }
  }, [disabled, recording, startBrowserRecognition, stopCapture]);

  useEffect(() => {
    const handlePlayback = (event: Event) => {
      const speaking = Boolean((event as CustomEvent<{ speaking?: boolean }>).detail?.speaking);
      pausedForPlaybackRef.current = speaking;
      if (speaking) {
        stopCapture();
        return;
      }
      if (continuousActiveRef.current && !disabledRef.current) {
        startBrowserRecognition(true);
      }
    };

    window.addEventListener("agenthub:voice-playback", handlePlayback);
    return () => window.removeEventListener("agenthub:voice-playback", handlePlayback);
  }, [startBrowserRecognition, stopCapture]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled && !continuousActive}
      aria-pressed={recording || continuousActive}
      data-testid="voice-input-button"
      title={recording || continuousActive ? "Stop continuous voice" : "Voice input"}
      className={`rounded-full p-2 transition-colors ${
        recording || continuousActive ? "animate-pulse bg-red-500/15 text-red-300" : "text-slate-300 hover:bg-white/10"
      }`}
    >
      {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      <span className="sr-only">{continuous ? "Continuous voice" : "Voice input"}</span>
    </button>
  );
}
