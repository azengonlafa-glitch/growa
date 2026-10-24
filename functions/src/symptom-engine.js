// Pure state machine over symptom-tree.js. No I/O, so it is unit-testable and
// the same answers always produce the same result.
import { NODES, OUTCOMES, START } from './symptom-tree.js';

export const ROUTE_RANK = ['self_care', 'pharmacist', 'doctor', 'urgent', 'emergency'];

export const ROUTE_TEXT = {
  self_care: 'ดูแลตัวเองเบื้องต้นได้',
  pharmacist: 'ควรปรึกษาเภสัชกร',
  doctor: 'ควรพบแพทย์',
  urgent: 'ควรพบแพทย์โดยเร็วภายในวันนี้',
  emergency: 'ฉุกเฉิน ไปโรงพยาบาลหรือโทร 1669 ทันที',
};

const MAX_STEPS = 40; // longest real path is ~12; guards against content loops

function matches(when, facts) {
  return Object.entries(when).every(([fact, values]) => values.includes(facts[fact]));
}

// Follows automatic route nodes until reaching a question or an outcome.
function settle(target, facts) {
  let to = target;
  for (let i = 0; i < MAX_STEPS; i++) {
    if (to.startsWith('outcome:')) return to;
    const node = NODES[to];
    if (!node) throw new Error(`unknown node ${to}`);
    if (node.type !== 'route') return to;
    to = (node.via && facts[node.via]) || (node.rules ?? []).find((r) => matches(r.when, facts))?.to || node.to;
  }
  throw new Error('route loop');
}

export function newState() {
  return { facts: {}, path: [], current: settle(START, {}) };
}

// Who needs a higher level of care regardless of the symptom.
function minimumRoute(facts) {
  if (facts.age === 'infant3m') return ['urgent', 'ทารกอายุต่ำกว่า 3 เดือนควรได้รับการตรวจจากแพทย์'];
  if (facts.age === 'infant') return ['doctor', 'เด็กอายุต่ำกว่า 1 ปีควรได้รับการตรวจจากแพทย์'];
  const reasons = [];
  if (facts.age === 'toddler') reasons.push('เด็กเล็กอายุ 1–5 ปี');
  if (facts.age === 'elder') reasons.push('ผู้สูงอายุ 65 ปีขึ้นไป');
  if (['pregnant', 'maybe'].includes(facts.pregnancy)) reasons.push('ตั้งครรภ์หรืออาจตั้งครรภ์');
  if (facts.pregnancy === 'breastfeeding') reasons.push('ให้นมบุตร');
  if (facts.chronic === 'yes') reasons.push('มีโรคประจำตัวหรือใช้ยาประจำ');
  return reasons.length ? ['pharmacist', `ยาบางชนิดอาจไม่เหมาะกับ${reasons.join(' / ')} จึงควรให้เภสัชกรเลือกยา`] : null;
}

export function result(state) {
  if (!state.current.startsWith('outcome:')) return null;
  const id = state.current.slice('outcome:'.length);
  const outcome = OUTCOMES[id];
  let route = outcome.route;
  const notes = [];
  const min = minimumRoute(state.facts);
  if (min && ROUTE_RANK.indexOf(min[0]) > ROUTE_RANK.indexOf(route)) {
    route = min[0];
    notes.push(min[1]);
  }
  return {
    outcomeId: id,
    title: outcome.title,
    route,
    routeText: ROUTE_TEXT[route],
    advice: outcome.advice,
    // Only while the route is still self-care: a vulnerable person is sent to the pharmacist instead.
    suggestedCatalogIds: route === 'self_care' ? outcome.suggest ?? [] : [],
    warn: outcome.warn ?? [],
    notes,
    disclaimer: 'ผลนี้เป็นข้อมูลเบื้องต้นจากคำตอบของคุณ ไม่ใช่การวินิจฉัยโรค',
  };
}

export function question(state) {
  if (state.current.startsWith('outcome:')) return null;
  const node = NODES[state.current];
  return {
    nodeId: state.current,
    type: node.type,
    text: node.text,
    help: node.help ?? null,
    options: node.options.map((o, index) => ({ index, label: o.label, exclusive: o.exclusive === true, group: o.group ?? null })),
    step: state.path.length + 1,
  };
}

// Throws Error('invalid answer') for answers that don't fit the current node.
export function answer(state, nodeId, choices) {
  if (nodeId !== state.current || state.current.startsWith('outcome:')) throw new Error('invalid answer');
  const node = NODES[nodeId];
  const picked = [...new Set(Array.isArray(choices) ? choices : [choices])];
  if (picked.length === 0 || picked.some((i) => !Number.isInteger(i) || i < 0 || i >= node.options.length)) {
    throw new Error('invalid answer');
  }

  let to;
  const facts = { ...state.facts };
  if (node.type === 'single') {
    if (picked.length !== 1) throw new Error('invalid answer');
    const opt = node.options[picked[0]];
    Object.assign(facts, opt.set ?? {});
    to = opt.to;
  } else {
    const opts = picked.map((i) => node.options[i]);
    // Exactly one ordinary symptom ticked: remember it so its own questions come next. Several: ask which matters most.
    const plain = opts.filter((o) => o.set && !o.to);
    if (plain.length === 1) Object.assign(facts, plain[0].set);
    if (opts.some((o) => o.exclusive) && opts.length > 1) throw new Error('invalid answer');
    // The most severe flagged choice wins.
    const flagged = opts.filter((o) => o.to)
      .sort((a, b) => ROUTE_RANK.indexOf(OUTCOMES[b.to.slice(8)]?.route) - ROUTE_RANK.indexOf(OUTCOMES[a.to.slice(8)]?.route));
    // More than one red flag that still needs a follow-up page: do not guess which one to ask about.
    const followUps = flagged.filter((o) => !o.to.startsWith('outcome:'));
    to = followUps.length > 1 ? 'outcome:emergency' : flagged[0]?.to ?? node.to;
  }

  if (state.path.length >= MAX_STEPS) throw new Error('too many steps');
  return {
    facts,
    path: [...state.path, { nodeId, choices: picked }],
    current: settle(to, facts),
  };
}

// Undo the last answer by replaying the path, so facts stay consistent.
export function back(state) {
  let s = newState();
  for (const step of state.path.slice(0, -1)) s = answer(s, step.nodeId, step.choices);
  return s;
}

// Human-readable Q&A for the pharmacist.
export function transcript(state) {
  return state.path.map(({ nodeId, choices }) => {
    const node = NODES[nodeId];
    return `${node.text} → ${choices.map((i) => node.options[i].label).join(', ')}`;
  });
}
