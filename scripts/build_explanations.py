"""Compile the reviewed per-question study notes; never rewrite answer keys."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
questions=json.loads((ROOT/'bank.json').read_text())['questions']
ids={q['id'] for q in questions}
notes={}
for line in (ROOT/'explanations.tsv').read_text().splitlines():
    qid, text=line.split('\t',1)
    assert qid in ids and qid not in notes, qid
    issue=text.startswith('【核对】')
    if issue:text=text.removeprefix('【核对】')
    assert len(text)>=30, (qid,text)
    notes[qid]={'text':text}
    if issue:notes[qid]['issue']='此题的条件、术语或参考答案存在需要核对之处；解析已区分题库口径与知识原理，未更改原参考答案。'
assert set(notes)==ids
output='/* Learning explanations, not official answer commentary. Original answer keys remain in bank.js. */\nwindow.QUESTION_EXPLANATIONS = '+json.dumps(notes,ensure_ascii=False,separators=(',',':'))+';\n'
(ROOT/'explanations.js').write_text(output)
print(json.dumps({'count':len(notes),'marked_for_review':sum('issue' in n for n in notes.values()),'characters':sum(len(n['text']) for n in notes.values())},ensure_ascii=False))
