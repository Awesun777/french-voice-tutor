import type { HTMLAttributes } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

// A single shared sheet per reader: keyboard focus, Escape, outside-click and
// touch dismissal are managed by Radix rather than hundreds of token popovers.
export default function GlossSurface({ enabled, close, children, ...legacy }: HTMLAttributes<HTMLDivElement> & { enabled: boolean; close:()=>void }) {
  if (!enabled) return <div {...legacy}>{children}</div>;
  return <Sheet open onOpenChange={open=>{if(!open)close();}}><SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto sm:max-w-lg sm:mx-auto rounded-t-xl"><SheetHeader><SheetTitle>Word meaning</SheetTitle><SheetDescription>Listen to the word or save it for review.</SheetDescription></SheetHeader><div className="px-5 pb-6 [&_button]:min-h-11 [&_button]:min-w-11">{children}</div></SheetContent></Sheet>;
}
