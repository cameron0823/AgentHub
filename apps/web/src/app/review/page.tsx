"use client";

import { ReviewTab } from "@/components/ReviewTab";

export default function ReviewPage() {
  return (
    <div className="agenthub-page">
      <div className="agenthub-window mx-auto h-[calc(100vh-4rem)] max-w-7xl overflow-hidden">
        <ReviewTab />
      </div>
    </div>
  );
}
