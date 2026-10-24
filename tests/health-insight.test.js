// Rules that link symptoms to the saved health profile (no emulator needed).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyze, applyInsight, topicOfOutcome, topicOfGroup } from '../functions/src/health-insight.js';
import { OUTCOMES } from '../functions/src/symptom-tree.js';

const profile = (p = {}) => ({ allergies: [], otherAllergies: [], conditions: [], currentMeds: [], noAllergies: false, noConditions: false, ...p });

describe('health insight', () => {
  test('every outcome maps to a topic and the suggested products are known to the rules', () => {
    for (const id of Object.keys(OUTCOMES)) assert.equal(typeof topicOfOutcome(id), 'string');
    assert.equal(topicOfOutcome('headache_tension'), 'headache');
    assert.equal(topicOfOutcome('diarrhea_simple'), 'diarrhea');
    assert.equal(topicOfGroup('fever'), 'fever');
    assert.equal(topicOfGroup('nonsense'), 'other');
  });

  test('a recorded allergy withholds the matching suggestion and says why', () => {
    const a = analyze(profile({ allergies: [{ substance: 'พาราเซตามอล' }] }), { topic: 'headache', suggestedCatalogIds: ['para500'] });
    assert.deepEqual(a.blocked.map((b) => b.catalogId), ['para500']);
    assert.match(a.blocked[0].reason, /พาราเซตามอล/);
    const r = applyInsight({ suggestedCatalogIds: ['para500'] }, a);
    assert.deepEqual(r.suggestedCatalogIds, []);
    assert.ok(r.healthNotes.length >= 1);
    // English names and other spellings still match
    assert.equal(analyze(profile({ allergies: [{ substance: 'Paracetamol' }] }), { topic: 'fever', suggestedCatalogIds: ['para500'] }).blocked.length, 1);
    assert.equal(analyze(profile({ allergies: [{ substance: 'ยาในกลุ่ม NSAIDs' }] }), { topic: 'pain', suggestedCatalogIds: ['ibuprofen400'] }).blocked.length, 1);
  });

  test('unrelated allergies and missing data change nothing', () => {
    const a = analyze(profile({ allergies: [{ substance: 'เพนิซิลลิน' }] }), { topic: 'headache', suggestedCatalogIds: ['para500'] });
    assert.equal(a.blocked.length, 0);
    assert.equal(a.missing, false);
    assert.equal(analyze(profile(), { topic: 'headache', suggestedCatalogIds: ['para500'] }).missing, true);
    assert.equal(analyze(profile({ noAllergies: true, noConditions: true }), { topic: 'fever' }).missing, false);
  });

  test('conditions and regular medicines are linked to the symptom', () => {
    const bp = analyze(profile({ conditions: ['ความดันโลหิตสูง'] }), { topic: 'headache' });
    assert.ok(bp.notes.some((n) => /ความดัน/.test(n)));
    const statin = analyze(profile({ currentMeds: ['Simvastatin 20 mg'] }), { topic: 'pain' });
    assert.ok(statin.notes.some((n) => /statin/.test(n)));
    const metformin = analyze(profile({ currentMeds: ['เมทฟอร์มิน 500 มก.'] }), { topic: 'diarrhea' });
    assert.ok(metformin.notes.some((n) => /เมทฟอร์มิน/.test(n)));
    const acei = analyze(profile({ currentMeds: ['Enalapril 5 mg'] }), { topic: 'respiratory' });
    assert.ok(acei.notes.some((n) => /ACE/.test(n)));
    // not linked to unrelated symptoms
    assert.equal(analyze(profile({ conditions: ['ความดันโลหิตสูง'] }), { topic: 'rash' }).notes.length, 0);
  });

  test('liver, kidney and heart conditions hold back household products', () => {
    assert.deepEqual(analyze(profile({ conditions: ['โรคตับ'] }), { topic: 'fever', suggestedCatalogIds: ['para500'] }).blocked.map((b) => b.catalogId), ['para500']);
    assert.deepEqual(analyze(profile({ conditions: ['โรคไต'] }), { topic: 'diarrhea', suggestedCatalogIds: ['ors'] }).blocked.map((b) => b.catalogId), ['ors']);
    assert.equal(analyze(profile({ conditions: ['โรคไต'] }), { topic: 'fever', suggestedCatalogIds: ['para500'] }).blocked.length, 0);
  });

  test('the rest of the setup form is used: other conditions, lifestyle and age', () => {
    const notesFor = (p, ctx) => analyze(profile(p), ctx).notes;
    assert.ok(notesFor({ conditions: ['ซึมเศร้า / วิตกกังวล'] }, { topic: topicOfOutcome('insomnia') }).some((n) => /ซึมเศร้า/.test(n)));
    assert.ok(notesFor({ conditions: ['ไทรอยด์'] }, { topic: 'stomach', outcomeId: 'constipation_simple' }).some((n) => /ไทรอยด์/.test(n)));
    assert.equal(notesFor({ conditions: ['ไทรอยด์'] }, { topic: 'stomach', outcomeId: 'dyspepsia' }).length, 0);
    assert.ok(notesFor({ conditions: ['ลมชัก'] }, { topic: 'fever' }).some((n) => /ชัก/.test(n)));
    assert.ok(notesFor({ conditions: ['กระดูกพรุน'] }, { topic: 'pain' }).some((n) => /กระดูก/.test(n)));
    assert.ok(notesFor({ conditions: ['เบาหวาน'] }, { topic: 'wound' }).some((n) => /แผล/.test(n)));
    assert.ok(notesFor({ conditions: ['ภูมิแพ้'] }, { topic: topicOfOutcome('conjunctivitis_allergic') }).some((n) => /ภูมิแพ้/.test(n)));
    assert.ok(notesFor({ smoking: 'current' }, { topic: 'respiratory' }).some((n) => /สูบบุหรี่/.test(n)));
    assert.ok(notesFor({ alcohol: 'regular' }, { topic: 'fever', suggestedCatalogIds: ['para500'] }).some((n) => /แอลกอฮอล์/.test(n)));
    assert.ok(notesFor({ age: 70 }, { topic: 'diarrhea' }).some((n) => /65/.test(n)));
    assert.equal(notesFor({ age: 30, smoking: 'never' }, { topic: 'diarrhea' }).length, 0);
  });

  test('the data the notes were based on is returned', () => {
    const a = analyze(profile({ conditions: ['เบาหวาน'], allergies: [{ substance: 'เพนิซิลลิน' }], currentMeds: ['Metformin 500 mg'] }), { topic: 'diarrhea' });
    assert.deepEqual(a.basis, ['เบาหวาน', 'แพ้เพนิซิลลิน', 'ยา Metformin 500 mg']);
    assert.deepEqual(applyInsight({ suggestedCatalogIds: [] }, a).healthBasis, a.basis);
  });

  test('pregnancy is mentioned and nothing is ever added to the suggestions', () => {
    const a = analyze(profile(), { topic: 'fever', suggestedCatalogIds: ['para500'], pregnancy: 'pregnant' });
    assert.ok(a.notes.some((n) => /ตั้งครรภ์/.test(n)));
    assert.deepEqual(applyInsight({ suggestedCatalogIds: ['para500'] }, { notes: [], blocked: [], missing: false }).suggestedCatalogIds, ['para500']);
  });
});
