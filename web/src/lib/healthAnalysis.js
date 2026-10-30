// Health analysis and benchmarking engine based on user profile and medication data.
import { ageOf, bmiOf } from '../profile/model.js';

export function analyzeHealth(form, meds = []) {
  if (!form) return null;

  const age = ageOf(form) ?? 35;
  const bmi = bmiOf(form);
  const conditions = form.conditions ?? [];
  const allergies = form.allergies ?? [];
  const exercise = form.exercise ?? '';
  const smoking = form.smoking ?? '';
  const alcohol = form.alcohol ?? '';
  const bpHistory = form.history?.bp ?? '';
  const bloodSugar = form.history?.bloodSugar ?? '';

  // 1. BMI Benchmark Analysis (Asian criteria)
  // <18.5 Underweight, 18.5-22.9 Normal (Optimal), 23-24.9 Overweight, >=25 Obese
  let bmiScore = 20;
  let bmiCategory = 'normal';
  let bmiText = 'สมส่วน (สุขภาพดี)';
  let bmiTone = 'good';
  let idealWeightMin = null;
  let idealWeightMax = null;

  if (form.height) {
    const hM = form.height / 100;
    idealWeightMin = +(18.5 * hM * hM).toFixed(1);
    idealWeightMax = +(22.9 * hM * hM).toFixed(1);
  }

  if (bmi) {
    const v = bmi.value;
    if (v < 18.5) {
      bmiCategory = 'underweight';
      bmiText = 'น้ำหนักน้อยกว่าเกณฑ์';
      bmiTone = 'warn';
      bmiScore = 18;
    } else if (v <= 22.9) {
      bmiCategory = 'normal';
      bmiText = 'สมส่วนตามเกณฑ์เอเชีย (สุขภาพดี)';
      bmiTone = 'good';
      bmiScore = 25;
    } else if (v <= 24.9) {
      bmiCategory = 'overweight';
      bmiText = 'น้ำหนักเกินเกณฑ์ (ท้วม)';
      bmiTone = 'warn';
      bmiScore = 19;
    } else if (v <= 29.9) {
      bmiCategory = 'obese1';
      bmiText = 'โรคอ้วนระดับ 1 (ต้องระวัง)';
      bmiTone = 'bad';
      bmiScore = 14;
    } else {
      bmiCategory = 'obese2';
      bmiText = 'โรคอ้วนระดับ 2 (ความเสี่ยงสูง)';
      bmiTone = 'bad';
      bmiScore = 10;
    }
  }

  // 2. Lifestyle Score (Max 25 pts)
  let lifestyleScore = 15;
  let exercisePoints = 6;
  let exerciseLabel = 'ไม่ได้ระบุ';
  if (exercise.includes('3-5') || exercise.includes('ประจำ') || exercise.includes('สม่ำเสมอ') || exercise.includes('ทุกวัน')) {
    exercisePoints = 10;
    exerciseLabel = 'ออกกำลังกายสม่ำเสมอ (ยอดเยี่ยม)';
  } else if (exercise.includes('1-2') || exercise.includes('บ้าง') || exercise.includes('นานๆ ครั้ง')) {
    exercisePoints = 6;
    exerciseLabel = 'ออกกำลังกายเป็นครั้งคราว';
  } else if (exercise.includes('ไม่') || exercise.includes('น้อย')) {
    exercisePoints = 3;
    exerciseLabel = 'แทบไม่ได้ออกกำลังกาย';
  }

  let smokingPoints = 8;
  let smokingLabel = 'ไม่ระบุ';
  if (smoking === 'never' || smoking.includes('ไม่เคย') || smoking.includes('ไม่สูบ')) {
    smokingPoints = 8;
    smokingLabel = 'ไม่สูบบุหรี่ (ดีมาก)';
  } else if (smoking.includes('เลิก') || smoking === 'quit') {
    smokingPoints = 6;
    smokingLabel = 'เลิกบุหรี่แล้ว';
  } else if (smoking.includes('สูบ') || smoking === 'yes') {
    smokingPoints = 2;
    smokingLabel = 'สูบบุหรี่เป็นประจำ (เสี่ยงต่อหลอดเลือดและหัวใจ)';
  }

  let alcoholPoints = 7;
  let alcoholLabel = 'ไม่ระบุ';
  if (alcohol === 'never' || alcohol.includes('ไม่ดื่ม') || alcohol.includes('ไม่เคย')) {
    alcoholPoints = 7;
    alcoholLabel = 'ไม่ดื่มแอลกอฮอล์ (ดีมาก)';
  } else if (alcohol.includes('สังคม') || alcohol.includes('ครั้งคราว') || alcohol === 'occasional') {
    alcoholPoints = 5;
    alcoholLabel = 'ดื่มเป็นครั้งคราวในงานสังคม';
  } else if (alcohol.includes('ประจำ') || alcohol.includes('บ่อย') || alcohol === 'regular') {
    alcoholPoints = 2;
    alcoholLabel = 'ดื่มเป็นประจำ (ควรลดปริมาณ)';
  }

  lifestyleScore = exercisePoints + smokingPoints + alcoholPoints;

  // 3. Chronic Conditions & Drug Safety Burden (Max 30 pts)
  let conditionScore = 30;
  const highRiskConditions = ['เบาหวาน', 'ความดันโลหิตสูง', 'ไขมันในเลือดสูง', 'โรคไต', 'โรคหัวใจ', 'หลอดเลือดสมอง', 'เกาต์', 'หอบหืด'];
  const userHighRisks = conditions.filter((c) => highRiskConditions.some((h) => c.toLowerCase().includes(h.toLowerCase())));

  if (conditions.length === 0) {
    conditionScore = 30;
  } else if (conditions.length === 1) {
    conditionScore = 24;
  } else if (conditions.length === 2) {
    conditionScore = 19;
  } else {
    conditionScore = Math.max(10, 16 - (conditions.length - 2) * 2);
  }

  // Allergy factor
  if (allergies.length > 2) {
    conditionScore = Math.max(8, conditionScore - 2);
  }

  // 4. Proactive Health Readiness (Max 20 pts)
  let readinessScore = 12;
  if (form.displayName && form.birthYear && form.sex) readinessScore += 3;
  if (form.height && form.weight) readinessScore += 2;
  if (form.bloodType) readinessScore += 1;
  if (allergies.length > 0 || form.noAllergiesDeclared) readinessScore += 2;

  // Total Score (0 - 100)
  const totalScore = Math.min(100, Math.max(25, bmiScore + lifestyleScore + conditionScore + readinessScore));

  // Determine Overall Tier
  let tier = 'good';
  let tierLabel = 'ระดับสุขภาพดี (เกณฑ์เหมาะสม)';
  let tierDesc = 'สุขภาพของคุณอยู่ในเกณฑ์ดี มีความเสี่ยงต่อโรคเรื้อรังต่ำ ควรคงพฤติกรรมสุขภาพที่ดีนี้ไว้อย่างต่อเนื่อง';
  let tierColor = '#10b981'; // green
  // Darker shade of the same hue for text on light surfaces (tierColor itself only reaches ~2:1 as text).
  let tierText = '#047857';

  if (totalScore < 60) {
    tier = 'poor';
    tierLabel = 'ระดับต้องดูแลเป็นพิเศษ (มีความเสี่ยง)';
    tierDesc = 'พบปัจจัยเสี่ยงด้านร่างกายหรือโรคประจำตัว ควรปรับพฤติกรรม ตรวจสุขภาพสม่ำเสมอ และปรึกษาเภสัชกร/แพทย์ในการใช้ยา';
    tierColor = '#ef4444'; // red
    tierText = '#b91c1c';
  } else if (totalScore < 80) {
    tier = 'moderate';
    tierLabel = 'ระดับสุขภาพปานกลาง (มีจุดที่ควรปรับปรุง)';
    tierDesc = 'สุขภาพโดยรวมอยู่ในเกณฑ์พอใช้ มีบางมิติที่หากปรับปรุง (เช่น การออกกำลังกาย หรือการคุมน้ำหนัก) จะช่วยขยับขึ้นสู่เกณฑ์สุขภาพดีเยี่ยม';
    tierColor = '#f59e0b'; // amber
    tierText = '#92400e';
  }

  // Recommendations Generation
  const recommendations = [];

  if (bmi && bmi.value >= 23.0) {
    recommendations.push({
      tone: 'warn',
      icon: 'heart',
      title: 'ควบคุมดัชนีมวลกายสู่เกณฑ์สมส่วน',
      desc: `ปัจจุบัน BMI อยู่ที่ ${bmi.value.toFixed(1)} ซึ่งเกินเกณฑ์ปกติ (18.5 - 22.9) แนะนำปรับสัดส่วนอาหาร ลดของหวานและของทอด เพื่อเป้าหมายน้ำหนักที่เหมาะสม ${idealWeightMin ? `${idealWeightMin} - ${idealWeightMax} กก.` : ''}`,
    });
  } else if (bmi && bmi.value < 18.5) {
    recommendations.push({
      tone: 'warn',
      icon: 'heart',
      title: 'เพิ่มมวลกล้ามเนื้อและโภชนาการ',
      desc: `BMI อยู่ที่ ${bmi.value.toFixed(1)} ต่ำกว่าเกณฑ์มาตรฐาน แนะนำเพิ่มโปรตีนคุณภาพดีและออกกำลังกายเพื่อเสริมสร้างความแข็งแรงของกล้ามเนื้อและกระดูก`,
    });
  } else {
    recommendations.push({
      tone: 'good',
      icon: 'check',
      title: 'ดัชนีมวลกายอยู่ในเกณฑ์สมบูรณ์',
      desc: 'น้ำหนักและส่วนสูงมีความสมดุลตามเกณฑ์มาตรฐานเอเชีย ช่วยลดภาระการทำงานของหัวใจและข้อต่อได้ดี',
    });
  }

  if (conditions.some((c) => c.includes('ความดัน') || c.includes('เบาหวาน'))) {
    recommendations.push({
      tone: 'warn',
      icon: 'info',
      title: 'การเฝ้าระวังโรคความดัน/เบาหวาน',
      desc: 'ควรตรวจวัดความดันโลหิตและระดับน้ำตาลอย่างสม่ำเสมอ รับประทานยาตามเวลาอย่างเคร่งครัด และแจ้งประวัติโรคทุกครั้งที่ซื้อยาที่ร้านขายยา',
    });
  }

  if (allergies.length > 0) {
    recommendations.push({
      tone: 'bad',
      icon: 'shield',
      title: `มีประวัติแพ้ยา ${allergies.length} รายการ`,
      desc: `ระบุแพ้: ${allergies.map((a) => a.drugName || a.agent || a).join(', ')} อย่าลืมเปิดระบบแบ่งปันข้อมูลเพื่อให้เภสัชกรตรวจสอบความปลอดภัยก่อนจ่ายยาทุกครั้ง`,
    });
  }

  if (exercisePoints < 8) {
    recommendations.push({
      tone: 'warn',
      icon: 'clock',
      title: 'เพิ่มกิจกรรมทางกายแบบแอโรบิก',
      desc: 'แนะนำเดินเร็ว ว่ายน้ำ หรือปั่นจักรยาน อย่างน้อยสัปดาห์ละ 150 นาที (วันละ 30 นาที 5 วัน) จะช่วยยกระดับคะแนนสุขภาพสู่ระดับยอดเยี่ยม',
    });
  }

  // Comparison Benchmarks Matrix
  const benchmarks = [
    {
      id: 'bmi',
      name: 'ดัชนีมวลกาย (BMI)',
      userValue: bmi ? `${bmi.value.toFixed(1)} (${bmiCategory})` : 'ยังไม่ได้ระบุ',
      userScore: bmiScore,
      maxScore: 25,
      goodBenchmark: '18.5 – 22.9 (สมส่วนตามเกณฑ์เอเชีย)',
      poorBenchmark: '≥ 25.0 (อ้วน) หรือ < 18.5 (ผอมเกิน)',
      userStatus: bmiTone,
      userPosPercent: bmi ? Math.min(94, Math.max(6, ((bmi.value - 15) / (32 - 15)) * 100)) : 50,
      goodPosRange: [23, 49], // 18.5 to 22.9 in scale 15-32
    },
    {
      id: 'lifestyle',
      name: 'พฤติกรรมและการใช้ชีวิต',
      userValue: `${exerciseLabel} · ${smokingLabel}`,
      userScore: lifestyleScore,
      maxScore: 25,
      goodBenchmark: 'ออกกำลังกาย 3-5 วัน/สัปดาห์, ไม่สูบ, ไม่ดื่มหนัก',
      poorBenchmark: 'สูบบุหรี่, ดื่มประจำ, ขาดการออกกำลังกาย',
      userStatus: lifestyleScore >= 20 ? 'good' : lifestyleScore >= 14 ? 'warn' : 'bad',
      userPosPercent: Math.min(94, Math.max(6, (lifestyleScore / 25) * 100)),
      goodPosRange: [75, 100],
    },
    {
      id: 'chronic',
      name: 'ภาระโรคเรื้อรังและความปลอดภัยของยา',
      userValue: conditions.length === 0 ? 'ไม่มีโรคประจำตัว' : `มี ${conditions.length} โรค (${conditions.slice(0, 2).join(', ')})`,
      userScore: conditionScore,
      maxScore: 30,
      goodBenchmark: 'ไม่มีโรคเรื้อรัง หรือควบคุมได้ดี ไร้ประวัติแพ้ยารุนแรง',
      poorBenchmark: 'มีโรคความดัน/เบาหวาน/ไต ร่วมกับกินยาซ้ำซ้อนหลายชนิด',
      userStatus: conditionScore >= 24 ? 'good' : conditionScore >= 18 ? 'warn' : 'bad',
      userPosPercent: Math.min(94, Math.max(6, (conditionScore / 30) * 100)),
      goodPosRange: [75, 100],
    },
    {
      id: 'readiness',
      name: 'ความพร้อมและการเฝ้าระวังสุขภาพ',
      userValue: `ข้อมูลครบ ${readinessScore >= 18 ? 'สมบูรณ์' : 'ปานกลาง'} (มีประวัติแพ้ยาและข้อมูลติดต่อ)`,
      userScore: readinessScore,
      maxScore: 20,
      goodBenchmark: 'บันทึกประวัติสุขภาพ ยาที่กิน และแพ้ยาครบ 100%',
      poorBenchmark: 'ขาดข้อมูลแพ้ยา หรือขาดเบอร์ติดต่อฉุกเฉิน',
      userStatus: readinessScore >= 17 ? 'good' : 'warn',
      userPosPercent: Math.min(94, Math.max(6, (readinessScore / 20) * 100)),
      goodPosRange: [80, 100],
    },
  ];

  return {
    totalScore,
    tier,
    tierLabel,
    tierDesc,
    tierColor,
    tierText,
    age,
    bmi,
    bmiCategory,
    bmiText,
    bmiTone,
    idealWeightMin,
    idealWeightMax,
    lifestyleScore,
    conditionScore,
    readinessScore,
    recommendations,
    benchmarks,
  };
}
