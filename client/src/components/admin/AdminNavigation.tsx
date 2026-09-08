import { useState } from "react";
import type { SidebarTab } from "@/types";
import { useAuth } from "@/_core/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
const entries: {label: string; tab: SidebarTab}[] = [
  {label:"Today",tab:"dashboard"},{label:"Speaking",tab:"voice-chat"},{label:"Reading",tab:"reading"},{label:"Listening",tab:"listening"},
  {label:"My vocabulary",tab:"library"},{label:"Flashcards",tab:"flashcards"},{label:"Quiz",tab:"quiz"},{label:"Progress",tab:"progress"},
  {label:"Grammar practice",tab:"grammar"},{label:"Dictionary",tab:"dictionary"},{label:"Tutor chat",tab:"tutor"},{label:"Settings",tab:"settings"}
];
const admin: {label:string; tab:SidebarTab}[] = [{label:"Writing",tab:"writing"},{label:"Ingest",tab:"ingest"},{label:"Ops",tab:"ops"},{label:"Test logs",tab:"testlogs"},{label:"Accounts",tab:"accounts"},{label:"Workflow",tab:"workflow"}];
export default function AdminNavigation({active, navigate}: {active:SidebarTab; navigate:(tab:SidebarTab)=>void}) {
  const [open,setOpen] = useState(false);
  const {logout} = useAuth();
  const list = <nav aria-label="Main navigation" className="overflow-y-auto flex-1 p-3">
    {entries.map(e => <button key={e.tab} aria-current={active===e.tab ? "page":undefined} onClick={()=>{navigate(e.tab);setOpen(false);}} className={`w-full text-left rounded-md px-3 py-3 text-sm ${active===e.tab ? "bg-secondary text-primary font-bold":"hover:bg-secondary/60"}`}>{e.label}</button>)}
    <details className="border-t mt-3 pt-3" open={admin.some(e=>e.tab===active)}><summary className="px-3 py-3 text-sm cursor-pointer">Administration</summary>{admin.map(e=><button key={e.tab} onClick={()=>{navigate(e.tab);setOpen(false);}} className="block px-3 py-3 text-sm w-full text-left hover:bg-secondary/60">{e.label}</button>)}<a href="/admin/landing-preview" className="block px-3 py-3 text-sm underline">Landing page preview</a></details>
    <button className="px-3 py-3 mt-2 underline text-sm" onClick={()=>void logout()}>Sign out</button>
  </nav>;
  return <>
    <aside className="hidden md:flex flex-col w-52 shrink-0 border-r bg-sidebar"><a href="/#dashboard" className="px-5 py-5"><img src="/brand/romaintalk-wordmark.png" alt="RomainTalk" className="w-36"/></a><p className="px-6 pb-3 text-xs text-speaking">Admin preview</p>{list}</aside>
    <header className="md:hidden flex shrink-0 items-center gap-3 border-b px-4 py-2 bg-sidebar"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button aria-label="Open navigation" className="p-3"><Menu className="w-5 h-5"/></button></SheetTrigger><SheetContent side="left"><SheetHeader><SheetTitle>RomainTalk</SheetTitle><SheetDescription>Admin preview navigation</SheetDescription></SheetHeader>{list}</SheetContent></Sheet><span className="font-bold">{entries.find(e=>e.tab===active)?.label ?? "Administration"}</span><span className="ml-auto text-xs text-speaking">Preview</span></header>
  </>;
}
