(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function emptyState() {
    return {version:1, stats:{}, wrong:[], favorites:[], notes:{}, history:[], practice:null, exam:null, settings:{theme:'light',large:false}};
  }
  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length-1; i > 0; i--) {
      const j = Math.floor(random()*(i+1));
      [result[i],result[j]] = [result[j],result[i]];
    }
    return result;
  }
  function record(state, question, answer, at = Date.now()) {
    const correct = answer === question.answer;
    const old = state.stats[question.id] || {attempts:0, correct:0, wrong:0};
    state.stats[question.id] = {attempts:old.attempts+1, correct:old.correct+(correct?1:0), wrong:old.wrong+(correct?0:1), last:at, lastAnswer:answer};
    if (!correct && !state.wrong.includes(question.id)) state.wrong.push(question.id);
    return correct;
  }
  function makeExam(questions, singleCount, judgeCount, now = Date.now()) {
    const single = questions.filter(q=>q.type==='single');
    const judge = questions.filter(q=>q.type==='judge');
    if (!Number.isInteger(singleCount) || !Number.isInteger(judgeCount) || singleCount<1 || singleCount>single.length || judgeCount<1 || judgeCount>judge.length) throw new Error('每种题型数量须为1—300的整数');
    return {id:'exam-'+now, ids:[...shuffle(single).slice(0,singleCount),...shuffle(judge).slice(0,judgeCount)].map(q=>q.id), answers:{}, marked:[], index:0, started:now, deadline:now+3600000};
  }
  function score(exam, questionMap, now = Date.now()) {
    const result = {id:exam.id, ids:[...exam.ids], answers:{...exam.answers}, started:exam.started, submitted:now, total:exam.ids.length, correct:0, unanswered:0, singleCorrect:0, judgeCorrect:0, singleCount:0, judgeCount:0};
    for (const id of exam.ids) {
      const q=questionMap[id];
      const single=q.type==='single';
      result[single?'singleCount':'judgeCount']++;
      if (!exam.answers[id]) result.unanswered++;
      if (exam.answers[id]===q.answer) {result.correct++;result[single?'singleCorrect':'judgeCorrect']++;}
    }
    result.singleScore=50*result.singleCorrect/result.singleCount;
    result.judgeScore=50*result.judgeCorrect/result.judgeCount;
    result.score=Math.round((result.singleScore+result.judgeScore)*100)/100;
    return result;
  }
  function remaining(exam, now=Date.now()) {return Math.max(0,Math.ceil((exam.deadline-now)/1000));}
  function normalize(input, questions) {
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('备份格式不正确');
    const out=emptyState(), map=Object.fromEntries(questions.map(q=>[q.id,q]));
    const valid=id=>typeof id==='string' && Object.hasOwn(map,id);
    const ids=xs=>[...new Set(Array.isArray(xs)?xs.filter(valid):[])];
    out.wrong=ids(input.wrong); out.favorites=ids(input.favorites);
    if (input.stats && typeof input.stats==='object') for (const [id,s] of Object.entries(input.stats)) {
      if (!valid(id)||!s||typeof s!=='object') continue;
      const attempts=Number(s.attempts), correct=Number(s.correct), wrong=Number(s.wrong);
      if ([attempts,correct,wrong].every(n=>Number.isSafeInteger(n)&&n>=0) && attempts===correct+wrong) out.stats[id]={attempts,correct,wrong,last:Number(s.last)||0,lastAnswer:s.lastAnswer};
    }
    if(input.notes && typeof input.notes==='object') for(const [id,note] of Object.entries(input.notes)) if(valid(id)&&typeof note==='string') out.notes[id]=note.slice(0,4000);
    function session(s, exam=false) {
      if(!s||typeof s!=='object'||!Array.isArray(s.ids)||!s.ids.length||s.ids.some(id=>!valid(id))||new Set(s.ids).size!==s.ids.length) return null;
      const answers={};
      for(const [id,v] of Object.entries(s.answers||{})) {
        if(!s.ids.includes(id)) continue;
        const answer=exam?v:v?.answer;
        if(!map[id].options.some(o=>o.key===answer)) continue;
        answers[id]=exam?answer:{answer,correct:answer===map[id].answer,at:Number(v.at)||0};
      }
      const index=Math.max(0,Math.min(s.ids.length-1,Number.isInteger(s.index)?s.index:0));
      if(exam) {
        if(!Number.isFinite(s.started)||!Number.isFinite(s.deadline)||s.deadline<=s.started||!s.ids.some(id=>map[id].type==='single')||!s.ids.some(id=>map[id].type==='judge')) return null;
        return {...s,ids:[...s.ids],answers,index,marked:ids(s.marked),warned:!!s.warned};
      }
      return {...s,ids:[...s.ids],answers,index,mode:s.mode==='recite'?'recite':'practice'};
    }
    out.practice=session(input.practice);out.exam=session(input.exam,true);
    if(Array.isArray(input.history)) out.history=input.history.filter(h=>h&&typeof h.id==='string'&&Array.isArray(h.ids)&&h.ids.every(valid)&&h.ids.length&&h.answers&&typeof h.answers==='object'&&Number.isFinite(h.submitted)&&h.ids.some(id=>map[id].type==='single')&&h.ids.some(id=>map[id].type==='judge')).slice(0,20).map(h=>score({...h,deadline:h.submitted},map,h.submitted));
    if(['light','dark','auto'].includes(input.settings?.theme)) out.settings.theme=input.settings.theme;
    out.settings.large=!!input.settings?.large;
    if(['gain','count','original'].includes(input.settings?.topicSort)) out.settings.topicSort=input.settings.topicSort;
    return out;
  }
  function merge(current, imported, questions) {
    const other=normalize(imported,questions), result=normalize(current,questions);
    result.wrong=[...new Set([...result.wrong,...other.wrong])];
    result.favorites=[...new Set([...result.favorites,...other.favorites])];
    for(const [id,s] of Object.entries(other.stats)) if(!result.stats[id] || s.last>result.stats[id].last) result.stats[id]=s;
    result.notes={...other.notes,...result.notes};
    result.history=[...new Map([...other.history,...result.history].map(h=>[h.id,h])).values()].sort((a,b)=>b.submitted-a.submitted).slice(0,20);
    if(!result.practice) result.practice=other.practice;
    return result;
  }
  return {emptyState,shuffle,record,makeExam,score,remaining,normalize,merge};
});
