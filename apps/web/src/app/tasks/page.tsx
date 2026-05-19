"use client";

import { TaskManager } from "@/components/TaskManager";

export default function TasksPage() {
  return (
    <div className="agenthub-page">
      <div className="agenthub-window mx-auto h-[calc(100vh-4rem)] max-w-5xl overflow-hidden">
        <TaskManager />
      </div>
    </div>
  );
}
