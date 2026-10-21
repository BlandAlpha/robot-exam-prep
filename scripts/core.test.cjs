const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../core.js');
const B=JSON.parse(fs.readFileSync(path.join(__dirname,'../bank.json'),'utf8'));
const Q=B.questions, MAP=Object.fromEntries(Q.map(q=>[q.id,q]));
test('600 original questions have complete choices and a valid original answer',()=>{
  assert.equal(Q.length,600);assert.equal(new Set(Q.map(q=>q.id)).size,600);
  assert.equal(Q.filter(q=>q.type==='single').length,300);
  assert.equal(Q.filter(q=>q.type==='judge').length,300);
  for(const q of Q){assert.ok(q.prompt.length>0);assert.ok(q.options.some(o=>o.key===q.answer));assert.equal(q.options.length,q.type==='single'?4:2);assert.ok(q.options.every(o=>o.text));assert.ok(!JSON.stringify(q).includes('PARSED TEXT'));assert.ok(q.page>=3&&q.page<=57);}
  assert.equal(MAP.s56.answer,'C');assert.equal(MAP.s56.errata.proposed,'A');
  assert.equal(MAP.s81.options[0].text,'500');
  assert.equal(MAP.s134.options[1].text,'16');
});
test('wrong answers add one persistent wrong item; correct answer does not silently remove it',()=>{
  const s=C.emptyState(),q=Q[0];C.record(s,q,'A',1);C.record(s,q,'B',2);C.record(s,q,q.answer,3);
  assert.deepEqual(s.wrong,[q.id]);assert.equal(s.stats[q.id].attempts,3);assert.equal(s.stats[q.id].wrong,2);assert.equal(s.stats[q.id].correct,1);
});
test('random exam has no duplicates and 50/50 weighted scores despite unequal counts',()=>{
  const ex=C.makeExam(Q,20,10,1000);assert.equal(ex.ids.length,30);assert.equal(new Set(ex.ids).size,30);
  for(const id of ex.ids.filter(id=>MAP[id].type==='single'))ex.answers[id]=MAP[id].answer;
  const r=C.score(ex,MAP,2000);assert.equal(r.score,50);assert.equal(r.singleScore,50);assert.equal(r.judgeScore,0);assert.equal(r.unanswered,10);
  for(const id of ex.ids)ex.answers[id]=MAP[id].answer;
  assert.equal(C.score(ex,MAP).score,100);
  assert.throws(()=>C.makeExam(Q,301,50));assert.throws(()=>C.makeExam(Q,0,50));
});
test('wall-clock timer expires in background, independently of UI tick frequency',()=>{
  const ex=C.makeExam(Q,1,1,1000);assert.equal(C.remaining(ex,1000),3600);assert.equal(C.remaining(ex,1000+45*60000),900);assert.equal(C.remaining(ex,1000+60*60000),0);assert.equal(C.remaining(ex,1000+80*60000),0);
});
test('backup round trip preserves notes, favorites, wrong questions, practice and active exam',()=>{
  const s=C.emptyState();s.favorites=['s1'];s.notes.s1='原理与题库答案分开';C.record(s,Q[0],'A',3);s.exam=C.makeExam(Q,2,2,1000);s.exam.answers[s.exam.ids[0]]=MAP[s.exam.ids[0]].answer;s.practice={ids:['s1','j1'],index:1,answers:{s1:{answer:'A',correct:false,at:3}},mode:'practice'};
  const next=C.normalize(JSON.parse(JSON.stringify(s)),Q);assert.equal(next.notes.s1,s.notes.s1);assert.deepEqual(next.favorites,s.favorites);assert.deepEqual(next.wrong,s.wrong);assert.deepEqual(next.exam,{...s.exam,warned:false});assert.equal(next.practice.index,1);assert.equal(next.practice.answers.s1.correct,false);
});
test('import merges data without replacing the active exam or double counting same-question stats',()=>{
  const a=C.emptyState(),b=C.emptyState();a.exam=C.makeExam(Q,2,2,1000);a.favorites=['s1'];b.favorites=['s2'];b.wrong=['j1'];C.record(a,Q[0],Q[0].answer,200);C.record(b,Q[0],'A',100);
  const m=C.merge(a,b,Q);assert.equal(m.exam.id,a.exam.id);assert.deepEqual(m.favorites,['s1','s2']);assert.deepEqual(m.wrong,['j1','s1']);assert.equal(m.stats.s1.attempts,1);assert.equal(m.stats.s1.correct,1);
});
test('reloading exam history recalculates scores rather than trusting imported numbers',()=>{
  const ex=C.makeExam(Q,2,3,1000);ex.answers[ex.ids[0]]=MAP[ex.ids[0]].answer;
  const s=C.emptyState();s.history=[C.score(ex,MAP,2000)];s.history[0].score=999;
  const n=C.normalize(s,Q);assert.equal(n.history[0].score,25);
});
test('shuffle preserves set and does not mutate the input',()=>{const a=[1,2,3,4],b=C.shuffle(a,()=>.1);assert.deepEqual(a,[1,2,3,4]);assert.deepEqual([...b].sort(),a);assert.notDeepEqual(b,a);});
test('all 600 questions have substantive explanations; official answer keys remain unchanged',()=>{
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../explanations.js'),'utf8'),context);
  const notes=context.window.QUESTION_EXPLANATIONS;
  assert.equal(Object.keys(notes).length,600);
  for(const q of Q){assert.ok(notes[q.id]);assert.ok(notes[q.id].text.length>=30,q.id);assert.ok(!notes[q.id].text.includes('解析正在更新'));}
  assert.ok(notes.s81.text.includes('500r/min'));
  assert.ok(notes.s128.text.includes('28'));
  assert.ok(notes.j238.text.includes('过拟合'));
  assert.equal(MAP.s56.answer,'C');
});
test('module sorting preference survives a backup round trip',()=>{
  const s=C.emptyState();s.settings.topicSort='count';assert.equal(C.normalize(JSON.parse(JSON.stringify(s)),Q).settings.topicSort,'count');
});
