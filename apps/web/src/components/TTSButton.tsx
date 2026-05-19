"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VoicePlaybackControls } from "@agenthub/ui";
import { useChatStore } from "@/stores/chatStore";

interface TTSButtonProps {
  content: string;
  autoPlay?: boolean;
}

const audioCache = new Map<string, string>();

function selectSpeechVoice(providerId: string, voiceId: string) {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (providerId === "edge") {
    return voices.find((voice) => /microsoft|edge/i.test(voice.name)) ?? voices[0] ?? null;
  }
  return voices.find((voice) => voice.name.toLowerCase().includes(voiceId.toLowerCase())) ?? null;
}

function useVoiceSettings() {
  const { activeSessionId, sessions, agents } = useChatStore();
  return useMemo(() => {
    const session = sessions.find((item) => item.id === activeSessionId);
    const agent = session?.agentId ? agents.find((item) => item.id === session.agentId) : undefined;
    return {
      providerId: agent?.voiceProvider || "browser",
      voice: agent?.voiceId || "alloy",
      speed: agent?.voiceSpeed ?? 1,
    };
  }, [activeSessionId, sessions, agents]);
}

export function TTSButton({ content, autoPlay = false }: TTSButtonProps) {
  const voiceSettings = useVoiceSettings();
  const [speaking, setSpeaking] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(voiceSettings.speed);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoPlayedRef = useRef(false);

  useEffect(() => {
    setPlaybackSpeed(voiceSettings.speed);
  }, [voiceSettings.speed]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      window.dispatchEvent(new CustomEvent("agenthub:voice-playback", { detail: { speaking: false } }));
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("agenthub:voice-playback", { detail: { speaking } }));
  }, [speaking]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  const speakWithBrowser = useCallback(() => {
    if (!window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.voice = selectSpeechVoice(voiceSettings.providerId, voiceSettings.voice);
    utterance.rate = playbackSpeed;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
    return true;
  }, [content, playbackSpeed, voiceSettings.providerId, voiceSettings.voice]);

  const fetchProviderAudio = useCallback(async () => {
    const cacheKey = JSON.stringify({
      text: content,
      providerId: voiceSettings.providerId,
      voice: voiceSettings.voice,
      speed: playbackSpeed,
    });
    const cached = audioCache.get(cacheKey);
    if (cached) return cached;

    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: content,
        providerId: voiceSettings.providerId,
        voice: voiceSettings.voice,
        speed: playbackSpeed,
      }),
    });

    if (!res.ok) throw new Error("Provider TTS unavailable");
    const blob = await res.blob();
    const nextUrl = URL.createObjectURL(blob);
    audioCache.set(cacheKey, nextUrl);
    return nextUrl;
  }, [content, playbackSpeed, voiceSettings.providerId, voiceSettings.voice]);

  const playProviderAudio = useCallback(async () => {
    const nextUrl = await fetchProviderAudio();
    setAudioUrl(nextUrl);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = nextUrl;
    audio.playbackRate = playbackSpeed;
    audio.onended = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
    await audio.play();
    setSpeaking(true);
  }, [fetchProviderAudio, playbackSpeed]);

  const providerBacked = voiceSettings.providerId !== "browser" && voiceSettings.providerId !== "edge";

  const toggle = useCallback(async () => {
    if (speaking) {
      stop();
      return;
    }

    if (providerBacked) {
      try {
        await playProviderAudio();
        return;
      } catch {
        // Keep browser speechSynthesis as the local fallback path.
      }
    }

    speakWithBrowser();
  }, [playProviderAudio, providerBacked, speakWithBrowser, speaking, stop]);

  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || !content.trim()) return;
    autoPlayedRef.current = true;
    void toggle();
  }, [autoPlay, content, toggle]);

  const browserAvailable = typeof window !== "undefined" && Boolean(window.speechSynthesis);
  if (!browserAvailable && !providerBacked) return null;

  return (
    <VoicePlaybackControls
      speaking={speaking}
      playbackSpeed={playbackSpeed}
      audioUrl={audioUrl}
      audioRef={audioRef}
      onToggle={toggle}
      onSpeedChange={setPlaybackSpeed}
    />
  );
}
