import type { ReactNode } from "react";

import { MobileStudioNav } from "@/components/studios/MobileStudioNav";
import { StudioRail } from "@/components/studios/StudioRail";
import { StudioTopBar } from "@/components/studios/StudioTopBar";
import { StudiosTransition } from "@/components/studios/StudiosTransition";

export default function StudiosLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground safe-area-top">
      <StudioRail />
      <div className="flex flex-1 flex-col min-w-0">
        <StudioTopBar />
        <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <StudiosTransition>{children}</StudiosTransition>
        </main>
        <MobileStudioNav />
      </div>
    </div>
  );
}
