import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
vi.mock("./db", async importOriginal => ({...await importOriginal<typeof import("./db")>(), getReviewQueue: vi.fn().mockResolvedValue([])}));
vi.mock("./tutorPreview", () => ({tutorVoicePreview:vi.fn().mockResolvedValue({base64:"sample",mimeType:"audio/mpeg"})}));
import { appRouter } from "./routers";
import { getReviewQueue } from "./db";
import { tutorVoicePreview } from "./tutorPreview";
function caller(role: "admin"|"user"|null) {
  return appRouter.createCaller({user:role ? {id:42,role,openId:"test",name:"Test",email:"test@example.com",loginMethod:"google",createdAt:new Date(),updatedAt:new Date(),lastSignedIn:new Date()}:null,req:{headers:{}} as TrpcContext["req"],res:{} as TrpcContext["res"]});
}
beforeEach(()=>vi.clearAllMocks());
describe("admin preview boundaries",()=>{
  it("denies selected-word review to ordinary accounts before querying",async()=>{
    await expect(caller("user").review.getQueue({mode:"all",wordIds:[1,2]})).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(getReviewQueue).not.toHaveBeenCalled();
  });
  it("keeps ordinary due review available unchanged",async()=>{
    await caller("user").review.getQueue({mode:"due",limit:10});
    expect(getReviewQueue).toHaveBeenCalledWith(42,{mode:"due",limit:10});
  });
  it("passes selected IDs with the authenticated owner, never a caller-selected owner",async()=>{
    await caller("admin").review.getQueue({mode:"all",wordIds:[3,8],limit:2});
    expect(getReviewQueue).toHaveBeenCalledWith(42,{mode:"all",wordIds:[3,8],limit:2});
  });
  it("rejects empty, invalid and oversized ID lists",async()=>{
    for(const wordIds of [[],[-1],[1.5],Array(501).fill(1)]) await expect(caller("admin").review.getQueue({mode:"all",wordIds})).rejects.toMatchObject({code:"BAD_REQUEST"});
    expect(getReviewQueue).not.toHaveBeenCalled();
  });
  it("denies unauthenticated review",async()=>{
    await expect(caller(null).review.getQueue({mode:"all",wordIds:[1]})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  });
  it("does not call voice providers for ordinary or signed-out visitors",async()=>{
    for(const role of ["user",null] as const) await expect(caller(role).voice.tutorPreview({agent:"anna"})).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(tutorVoicePreview).not.toHaveBeenCalled();
  });
  it("allows admins to request only a known tutor sample",async()=>{
    await caller("admin").voice.tutorPreview({agent:"romain"});
    expect(tutorVoicePreview).toHaveBeenCalledWith("romain");
    await expect(caller("admin").voice.tutorPreview({agent:"unknown" as "anna"})).rejects.toMatchObject({code:"BAD_REQUEST"});
  });
});
