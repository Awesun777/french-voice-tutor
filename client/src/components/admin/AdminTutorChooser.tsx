import { useEffect, useRef, useState } from "react";
import { useAvatarPoster } from "@/components/AvatarVideo";
import { trpc } from "@/lib/trpc";
type Tutor = "romain" | "anna";
function Portrait({ id }: { id:Tutor }) {
  const poster = useAvatarPoster(`/avatars/${id}.mp4`);
  return poster ? <img alt="" src={poster} className="w-16 h-16 rounded-full object-cover"/> : <span className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-xl uppercase">{id[0]}</span>;
}
export default function AdminTutorChooser({userId,start}: {userId:number;start:(id:Tutor|"marc")=>void}) {
  const key=`rt-last-tutor-${userId}`;
  const [last,setLast]=useState<Tutor|null>(()=>{try {const v=localStorage.getItem(key);return v==="romain"||v==="anna" ? v:null;} catch{return null;}});
  const sample=trpc.voice.tutorPreview.useMutation();
  const audio=useRef<HTMLAudioElement|null>(null);
  const active=useRef(true);
  const [playing,setPlaying]=useState<Tutor|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;audio.current?.pause();};},[]);
  async function preview(id:Tutor) {
    if(sample.isPending) return;
    audio.current?.pause();
    if(playing===id){setPlaying(null);return;}
    setError(null);setPlaying(null);
    try{const result=await sample.mutateAsync({agent:id});if(!active.current)return;const a=new Audio(`data:${result.mimeType};base64,${result.base64}`);audio.current=a;a.onended=()=>setPlaying(null);a.onerror=()=>{setPlaying(null);setError("The sample couldn’t play. Please try again.");};await a.play();if(active.current)setPlaying(id);else a.pause();}catch{if(active.current)setError("The voice sample is unavailable. Try again, or open the conversation settings.");}
  }
  function choose(id:Tutor){try{localStorage.setItem(key,id);}catch{}setLast(id);start(id);}
  return <div className="flex-1 overflow-y-auto p-5 sm:p-10"><div className="max-w-3xl mx-auto"><p className="text-speaking text-sm">Speaking practice</p><h1 className="text-3xl font-bold mt-2">Who would you like to talk to?</h1><p className="text-muted-foreground mt-3 max-w-xl">Both tutors practise French conversation, explain corrections, and help you save vocabulary. Listen to their voices, then choose the one you prefer.</p>
    {last&&<button className="mt-6 rounded-lg bg-primary text-primary-foreground px-5 py-3 font-semibold" onClick={()=>choose(last)}>Continue with {last==="romain"?"Romain":"Anna"}</button>}
    <div className="divide-y border-y mt-7">{(["romain","anna"] as const).map(id=><section key={id} className="py-6"><div className="flex items-center gap-4"><Portrait id={id}/><div><h2 className="text-xl font-bold">{id==="romain"?"Romain":"Anna"}</h2><p className="text-sm text-muted-foreground mt-1">{id==="romain"?"A masculine voice for everyday conversation.":"A feminine voice for everyday conversation."}</p></div></div><div className="mt-4 flex flex-wrap gap-3"><button disabled={sample.isPending} onClick={()=>void preview(id)} className="border rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50">{sample.isPending&&sample.variables?.agent===id?"Preparing sample…":playing===id?"Stop sample":"Hear voice sample"}</button><button onClick={()=>choose(id)} className="rounded-lg bg-secondary text-primary px-4 py-3 text-sm font-semibold">Talk with {id==="romain"?"Romain":"Anna"}</button></div></section>)}</div>
    {error&&<p role="alert" className="mt-4 text-destructive text-sm">{error}</p>}<p className="text-xs text-muted-foreground mt-4">AI-generated voice samples. Pace in a live conversation can vary. Speed and explanation language can be adjusted before starting.</p>
    <details className="mt-8 border-t pt-5"><summary className="cursor-pointer font-semibold">Practising for the TCF?</summary><p className="mt-3 text-sm text-muted-foreground">Marc runs a three-task mock oral exam, with feedback at the end.</p><button className="underline py-3 text-sm" onClick={()=>start("marc")}>Open mock exam</button></details>
  </div></div>;
}
