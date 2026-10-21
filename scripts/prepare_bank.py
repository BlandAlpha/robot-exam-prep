"""Extract the supplied public question bank without changing official answers."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT.parent / 'tmp/theory-extracted.txt').read_text()

def clean(s):
    s = re.sub(r'\n[ \t]*\d+[ \t]*\n(?=<PARSED TEXT FOR PAGE:)', '\n', s)
    s = re.sub(r'\n[ \t]{10,}\d+[ \t]*(?=\n|$)', '', s)
    s = re.sub(r'<PARSED TEXT FOR PAGE: \d+ / \d+>', '', s)
    s = re.sub(r'^.*第五届全国仪器仪表行业职业技能竞赛工业机器人系统操作员 S 赛项.*$', '', s, flags=re.M)
    s = s.replace('\\[', '[').replace('\\]', ']').replace('\\>', '>').replace('\\*', '*')
    return re.sub(r'\s+', ' ', s).strip()

single, rest = text.split('一、单项选择题\n')[-1].split('二、判断题\n')
judge, keys = rest.split('三、选择题参考答案\n')
sk, jk = keys.split('四、判断题参考答案\n')
answers_s = {int(n): a for n, a in re.findall(r'(\d{1,3})\s*\.\s*([ABCD])', sk)}
answers_j = {int(n): ('T' if a == '√' else 'F') for n, a in re.findall(r'(\d{1,3})\s*\.\s*([√×])', jk)}
assert len(answers_s) == len(answers_j) == 300

ERRATA = {
 's26': ('题干/选项疑点', '常见工业机器人含六轴机型；本题缺少“6个”这一选项，不能泛化为自由度一般小于6。', None),
 's41': ('参考答案疑点', '通常手臂主要决定位置，手腕主要决定姿态；按题意D更合理。', 'D'),
 's56': ('参考答案疑点', '使用测力扳手控制预紧，通常属于控制扭矩法，按题意A更合理。', 'A'),
 's82': ('参考答案疑点', '向不平行于任何基本投影面的平面投影，通常称斜视图，按题意B更合理。', 'B'),
 's116': ('选项含义重叠', 'A“数据转换”与C“A/D、D/A转换”有包含关系，不能把C理解为不属于PLC扩展功能。', None),
 's156': ('题干/答案疑点', '激活函数不必具有饱和区，“需要具有的属性”表述也不严谨；按常规教学意图C更合理。', 'C'),
 's175': ('答案唯一性疑点', '参考答案为C；D对细化的表述通常也成立。开运算先腐蚀后膨胀，闭运算相反。', None),
 's178': ('答案唯一性疑点', '直方图均衡通常是图像增强方法；本题多个选项均可能归入增强处理，不宜据此建立排他定义。', None),
 's179': ('参考答案疑点', '拉普拉斯算子可用于图像锐化，按题意A“膨胀”更合理。', 'A'),
 's202': ('参考答案疑点', '视觉传感器属于硬件；软件部分对应①图像处理软件和②机器人控制软件，按题意D更合理。', 'D'),
 's203': ('参考答案疑点', '典型手眼安装/标定形式是眼在手上与眼在手外，对应①②，按题意D更合理。', 'D'),
 's204': ('参考答案疑点', '结构光主动投射已知光图案，按原理应归为主动式，B更合理。', 'B'),
 'j63': ('适用范围疑点', '250mm/s是常见手动减速模式限制，不能泛化为机器人所有运行模式的最高速度。', 'F'),
 'j238': ('参考答案疑点', '增加模型复杂度可能引起过拟合，不能保证总能降低测试误差，按原理应为错误。', 'F'),
}

def category(kind, n, q):
    # Learning tags inferred from content, not official exam sampling quotas.
    if (kind == 'single' and n >= 251) or (kind == 'judge' and n >= 251): return '数字孪生与虚拟仿真'
    if re.search(r'急停|安全|触电|接地|保护线|PE 线|职业|合闸|电烧伤|屏蔽层|电位差', q): return '安全与职业素养'
    if re.search(r'维护|保养|换油|故障|零位|原点位置校准|防振|防污', q): return '故障诊断与维护'
    if re.search(r'PLC|HMI|可编程|可编程序|梯形图|人机界面|输入继电器|输出继电器|组态', q): return '系统集成与调试'
    if re.search(r'视觉|图像|图形|相机|镜头|光圈|摄影|感光|快门|滤色|透镜|光线|色彩|红光|光源|CCD|CMOS|RGB|CNN|神经|学习|人工智能|标注|GPU|池化|卷积|算法|人脸|SLAM|像素|曝光|传感器', q): return '系统集成与调试'
    if re.search(r'通信|通讯|以太网|总线|物联网|数据采集|数字量|模拟量|二进制|编码方式', q): return '工业通信与智能制造'
    if re.search(r'示教|编程|轨迹|手动|坐标系下|TCP|标定|工具坐标|关节坐标|直角坐标|插补|摇杆', q): return '机器人操作与编程'
    if re.search(r'机器人|机械手|手爪|自由度|手腕|手臂|手部|D-H|雅可比|位姿|动力学', q): return '工业机器人基础'
    return '机械与电气基础'

bank = []
pattern = re.compile(r'^\s*(\d{1,3})[.．、]\s*(.*?)(?=^\s*\d{1,3}[.．、]|\Z)', re.M|re.S)
for kind, segment, ans in [('single', single, answers_s), ('judge', judge, answers_j)]:
    for m in pattern.finditer(segment):
        n = int(m[1])
        raw = m[2]
        pages = list(re.finditer(r'<PARSED TEXT FOR PAGE: (\d+) /', segment[:m.start()]))
        page = int(pages[-1][1]) if pages else (3 if kind == 'single' else 45)
        if kind == 'single':
            parts = re.split(r'^\s*([ABCD])(?:[.．、]\s*|[ \t]+)', raw, flags=re.M)
            assert len(parts) == 9, (n, parts)
            prompt = clean(parts[0])
            options = [{'key':parts[i], 'text':clean(parts[i+1])} for i in range(1,9,2)]
        else:
            prompt = clean(raw)
            options = [{'key':'T','text':'正确'}, {'key':'F','text':'错误'}]
        qid = ('s' if kind == 'single' else 'j') + str(n)
        item = {'id':qid,'type':kind,'number':n,'prompt':prompt,'options':options,'answer':ans[n],'page':page,'category':category(kind,n,prompt)}
        if qid in ERRATA:
            title, note, proposed = ERRATA[qid]
            item['errata'] = {'title':title,'note':note,'proposed':proposed}
        bank.append(item)

assert len(bank) == 600
assert len({q['id'] for q in bank}) == 600
assert all(q['prompt'] and all(o['text'] for o in q['options']) for q in bank), [q['id'] for q in bank if not q['prompt'] or not all(o['text'] for o in q['options'])]
payload = {'version':'2026.10.21.1','title':'工业机器人系统操作员 S 赛项理论题库','questions':bank,
 'rules':{'minutes':60,'singlePoints':50,'judgePoints':50,'totalWeight':0.2,'officialQuestionCount':None,'officialModuleWeights':None},
 'source':{'bank':'2026年9月公开理论题库：单选300题、判断300题','rules':'理论知识竞赛规程（2026年9月）及工业机器人系统操作员S赛项竞赛规程','note':'新提供的三份PDF为规程与技术标准，不含替换题库。题目沿用先前提供的笔试.pdf。'}}
(ROOT/'bank.js').write_text('/* Source: supplied public theory bank. Answers preserved verbatim. */\nwindow.QUESTION_BANK = '+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';\n')
(ROOT/'bank.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'questions':len(bank),'single':sum(q['type']=='single' for q in bank),'judge':sum(q['type']=='judge' for q in bank),'flagged':len(ERRATA),'categories':{k:sum(q['category']==k for q in bank) for k in sorted({q['category'] for q in bank})}},ensure_ascii=False))
