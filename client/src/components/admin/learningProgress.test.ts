import {describe,it,expect} from "vitest";
import {summarizeLearning} from "./LearningProgress";
import {canUseAdminPreview} from "@/contexts/AdminPreviewContext";
const word=(id:number,extra:object={})=>({id,term:"bonjour",translation:"hello",wrongCount:0,quizCount:0,...extra});
describe("learning evidence",()=>{
  it("requires both repeat success and a longer interval, not just a mastery label",()=>{
    const result=summarizeLearning([word(1,{sm2Status:"mastered"}),word(2,{sm2Repetitions:3,sm2Interval:6}),word(3,{sm2Repetitions:2,sm2Interval:10}),word(4,{sm2Repetitions:3,sm2Interval:7})]);
    expect(result.established.map(w=>w.id)).toEqual([4]);
    expect(result.practising.map(w=>w.id)).toEqual([2,3]);
  });
  it("does not call an old error a current struggle after successful ratings",()=>{
    const result=summarizeLearning([word(1,{wrongCount:4,sm2Repetitions:3}),word(2,{wrongCount:1,sm2Repetitions:0}),word(3,{sm2Status:"learning"})]);
    expect(result.revisit.map(w=>w.id)).toEqual([2,3]);
  });
  it("handles a new learner without invented results",()=>{
    expect(summarizeLearning([])).toEqual({established:[],practising:[],revisit:[]});
  });
});
describe("preview role gate",()=>{
  it("fails closed for signed-out, unresolved, and ordinary accounts",()=>{
    for(const user of [null,undefined,{}, {role:"user"},{role:"Admin"}])expect(canUseAdminPreview(user)).toBe(false);
    expect(canUseAdminPreview({role:"admin"})).toBe(true);
  });
});
