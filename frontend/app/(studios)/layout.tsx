import type { ReactNode } from "react";

import { StudioRail } from "@/components/studios/StudioRail";
import { StudioTopBar } from "@/components/studios/StudioTopBar";
import { StudiosTransition } from "@/components/studios/StudiosTransition";

export default function StudiosLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <StudioRail />
      <div className="flex flex-1 flex-col">
        <StudioTopBar />
        <main className="flex-1">
          <StudiosTransition>{children}</StudiosTransition>
        </main>
      </div>
    </div>
  );
}
