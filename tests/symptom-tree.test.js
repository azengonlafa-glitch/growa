// Structure and behaviour tests for the guided symptom checker (no emulator needed).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NODES, OUTCOMES, START } from '../functions/src/symptom-tree.js';
import { newState, answer, back, question, result, ROUTE_RANK } from '../functions/src/symptom-engine.js';

const targets = (node) => [
  ...(node.options ?? []).map((o) => o.to).filter(Boolean),
  ...(node.rules ?? []).map((r) => r.to),
  ...(node.to ? [node.to] : []),
];

// Answer by matching part of an option label, so scenarios read like a conversation.
function walk(steps) {
  let s = newState();
  for (const pick of steps) {
    const q = question(s);
    assert.ok(q, `expected a question before "${pick}", got result ${s.current}`);
    const picks = (Array.isArray(pick) ? pick : [pick]).map((p) => {
      const i = q.options.findIndex((o) => o.label.includes(p));
      assert.ok(i >= 0, `no option "${p}" in "${q.text}"`);
      return i;
    });
    s = answer(s, q.nodeId, q.type === 'multi' ? picks : picks[0]);
  }
  return s;
}
const NONE = 'ไม่มีอาการเหล่านี้';

describe('tree structure', () => {
  test('every target exists, every node and outcome is used', () => {
    const used = new Set([START]);
    for (const [id, node] of Object.entries(NODES)) {
      assert.ok(['single', 'multi', 'route'].includes(node.type), `${id} type`);
      if (node.type !== 'route') assert.ok(node.text && node.options.length >= 2, `${id} needs text and options`);
      for (const t of targets(node)) {
        if (t.startsWith('outcome:')) assert.ok(OUTCOMES[t.slice(8)], `${id} -> missing ${t}`);
        else assert.ok(NODES[t], `${id} -> missing node ${t}`);
        used.add(t);
      }
    }
    for (const id of Object.keys(NODES)) assert.ok(used.has(id), `node ${id} is unreachable`);
    for (const id of Object.keys(OUTCOMES)) assert.ok(used.has(`outcome:${id}`), `outcome ${id} is never reached`);
  });

  test('every outcome has a valid route and advice', () => {
    for (const [id, o] of Object.entries(OUTCOMES)) {
      assert.ok(ROUTE_RANK.includes(o.route), `${id} route`);
      assert.ok(o.title && o.advice.length > 0, `${id} title/advice`);
    }
  });

  test('product suggestions exist only on self-care outcomes and are catalog ids', () => {
    for (const [id, o] of Object.entries(OUTCOMES)) {
      if (!o.suggest) continue;
      assert.equal(o.route, 'self_care', `${id} suggests medicines but is not self_care`);
      assert.ok(o.suggest.every((c) => /^[a-z0-9]+$/.test(c)), `${id} suggest ids`);
    }
  });

  test('every possible answer path ends in an outcome', () => {
    let paths = 0;
    const reached = new Set();
    const explore = (s, depth) => {
      assert.ok(depth < 30, `path too long at ${s.current}`);
      const q = question(s);
      if (!q) {
        paths++;
        reached.add(result(s).outcomeId);
        return;
      }
      const choices = q.type === 'multi' ? q.options.map((_, i) => [i]) : q.options.map((_, i) => i);
      for (const c of choices) explore(answer(s, q.nodeId, c), depth + 1);
    };
    explore(newState(), 0);
    assert.ok(paths > 1000, `only ${paths} paths`);
    assert.equal(reached.size, Object.keys(OUTCOMES).length);
  });
});

describe('scenarios', () => {
  test('red flags stop everything before any other question', () => {
    assert.equal(result(walk([['หมดสติ']])).route, 'emergency');
    assert.equal(result(walk([['ชัก']])).route, 'emergency');
    const m = walk([['ทำร้ายตัวเอง', 'ชัก']]);
    assert.equal(result(m).route, 'emergency');
    assert.match(result(walk([['ทำร้ายตัวเอง']])).advice.join(), /1323/);
  });

  test('each red flag is a single symptom and follow-up pages never lead to self-care', () => {
    const labels = NODES[START].options.map((o) => o.label);
    assert.ok(labels.length >= 20, 'one option per symptom');
    for (const [id, node] of Object.entries(NODES)) {
      if (!id.startsWith('rf_')) continue;
      assert.ok(node.options.some((o) => o.label === 'ไม่แน่ใจ' && o.to === 'outcome:emergency'), `${id}: not sure means emergency`);
      for (const o of node.options) {
        const route = OUTCOMES[o.to.slice(8)]?.route;
        assert.ok(['urgent', 'emergency'].includes(route), `${id} -> ${o.label} must be urgent or emergency`);
      }
    }
  });

  test('the first page lists ordinary symptoms and severe ones, grouped', () => {
    const q = question(newState());
    const groups = new Set(q.options.map((o) => o.group).filter(Boolean));
    assert.deepEqual([...groups], ['อาการทั่วไป', 'อาการรุนแรง หรือต้องรีบดูแล']);
    assert.ok(q.options.length >= 40, 'many choices');
  });

  test('one ordinary symptom skips the "which part" question; several ask it', () => {
    let s = walk([['เจ็บคอ'], '18 – 64', 'ชาย', 'ไม่มี']);
    assert.equal(s.current, 'throat_severity');
    s = walk([['เจ็บคอ', 'ไอ'], '18 – 64', 'ชาย', 'ไม่มี']);
    assert.equal(s.current, 'body_area_q');
    s = walk([[NONE], '18 – 64', 'ชาย', 'ไม่มี']);
    assert.equal(s.current, 'body_area_q');
  });

  test('a severe symptom beats ordinary ones on the same page', () => {
    assert.equal(result(walk([['เจ็บคอ', 'หมดสติ']])).route, 'emergency');
    assert.equal(walk([['เจ็บคอ', 'เจ็บแน่นหน้าอก']]).current, 'rf_chest');
  });

  test('chest pain opens a follow-up page; the typical pattern is an emergency', () => {
    assert.equal(walk([['เจ็บแน่นหน้าอก']]).current, 'rf_chest');
    assert.equal(result(walk([['เจ็บแน่นหน้าอก'], 'เหมือนมีของหนักทับ'])).route, 'emergency');
    assert.equal(result(walk([['เจ็บแน่นหน้าอก'], 'ไม่แน่ใจ'])).route, 'emergency');
    assert.equal(result(walk([['เจ็บแน่นหน้าอก'], 'เจ็บจี๊ดเฉพาะจุด'])).route, 'urgent');
  });

  test('two follow-up red flags together are an emergency without asking either', () => {
    assert.equal(result(walk([['เจ็บแน่นหน้าอก', 'ไอเป็นเลือด']])).route, 'emergency');
    assert.equal(result(walk([['เจ็บแน่นหน้าอก', 'หมดสติ']])).route, 'emergency');
  });

  test('infant under 3 months with fever goes to a doctor urgently', () => {
    const s = walk([[NONE], 'ต่ำกว่า 3 เดือน', 'ไม่มี', 'ไข้ หวัด', 'มีไข้']);
    assert.equal(result(s).outcomeId, 'fever_infant');
    assert.equal(result(s).route, 'urgent');
  });

  test('adult with sneezing and itchy nose narrows to allergic rhinitis', () => {
    const s = walk([[NONE], '18 – 64', 'ชาย', 'ไม่มี', 'ไข้ หวัด', 'น้ำมูก', 'ไม่เกิน 10 วัน', 'จามติด ๆ กัน']);
    assert.equal(result(s).outcomeId, 'allergic_rhinitis');
  });

  test('dengue warning signs win over a plain fever', () => {
    const s = walk([[NONE], '18 – 64', 'หญิง', 'ไม่ใช่ทั้งสอง', 'ไม่มี', 'ไข้ หวัด', 'มีไข้', 'ไม่เกิน 3 วัน', 'มี']);
    assert.equal(result(s).outcomeId, 'fever_dengue_risk');
    assert.match(result(s).advice.join(), /NSAIDs/);
  });

  test('possible pregnancy with lower abdominal pain is an emergency', () => {
    const s = walk([[NONE], '18 – 64', 'หญิง', 'ไม่แน่ใจ', 'ไม่มี', 'ท้อง', 'ปวดท้อง', 'ท้องน้อย (ผู้หญิง)']);
    assert.equal(result(s).outcomeId, 'pregnancy_pain');
    assert.equal(result(s).route, 'emergency');
  });

  test('self-care outcomes are raised to pharmacist for at-risk people', () => {
    const adult = walk([[NONE], '18 – 64', 'ชาย', 'ไม่มี', 'ไข้ หวัด', 'น้ำมูก', 'ไม่เกิน 10 วัน', 'น้ำมูก คัดจมูก เจ็บคอเล็กน้อย']);
    assert.equal(result(adult).route, 'self_care');
    assert.deepEqual(result(adult).suggestedCatalogIds, ['para500']);
    const elder = walk([[NONE], '65 ปีขึ้นไป', 'หญิง', 'ไม่มี', 'ไข้ หวัด', 'น้ำมูก', 'ไม่เกิน 10 วัน', 'น้ำมูก คัดจมูก เจ็บคอเล็กน้อย']);
    assert.equal(result(elder).route, 'pharmacist');
    assert.equal(result(elder).notes.length, 1);
    assert.deepEqual(result(elder).suggestedCatalogIds, []); // no self-serve suggestions once raised
  });

  test('men with urinary symptoms are sent to a doctor', () => {
    const s = walk([[NONE], '18 – 64', 'ชาย', 'ไม่มี', 'ปัสสาวะ', 'ปัสสาวะแสบขัด', 'ไม่มี']);
    assert.equal(result(s).outcomeId, 'uti_complicated');
  });

  test('back undoes the last answer and its facts', () => {
    const s = walk([[NONE], '65 ปีขึ้นไป']);
    assert.equal(s.facts.age, 'elder');
    const b = back(s);
    assert.equal(b.current, 'age');
    assert.equal(b.facts.age, undefined);
  });

  test('invalid answers are rejected', () => {
    const s = newState();
    const noneIndex = question(s).options.findIndex((o) => o.exclusive);
    assert.throws(() => answer(s, 'age', 0)); // not the current question
    assert.throws(() => answer(s, s.current, [99]));
    assert.throws(() => answer(s, s.current, []));
    assert.throws(() => answer(s, s.current, [0, noneIndex])); // "none" plus a symptom
  });
});
