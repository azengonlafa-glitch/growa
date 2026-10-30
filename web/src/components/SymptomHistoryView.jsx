// Symptom consultation history view: shows past symptoms asked and evaluated on the platform.
import { useState, useEffect } from 'react';
import { Card, Badge, Button, Icon, Field } from './ui.jsx';
import { getSymptomHistory, saveSymptomRecord } from '../lib/symptomHistory.js';

export default function SymptomHistoryView({ patientId = 'default', patientName = 'คุณ' }) {
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'self_care' | 'pharmacist'
  const [expandedId, setExpandedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form for manual symptom logging
  const [newTitle, setNewTitle] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newSeverity, setNewSeverity] = useState('ปานกลาง');
  const [newSymptoms, setNewSymptoms] = useState('');
  const [newAdvice, setNewAdvice] = useState('');

  useEffect(() => {
    setHistory(getSymptomHistory(patientId));
  }, [patientId]);

  // Close modal on Escape key
  useEffect(() => {
    if (!showAddModal) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowAddModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddModal]);

  const filtered = history.filter((item) => {
    if (filter === 'self_care') return item.route === 'self_care';
    if (filter === 'pharmacist') return item.route === 'pharmacist' || item.route === 'urgent';
    return true;
  });

  const toggleExpand = (id) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const handleAddSymptom = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const symArray = newSymptoms.split(',').map((s) => s.trim()).filter(Boolean);
    const advArray = newAdvice.split('\n').map((s) => s.trim()).filter(Boolean);

    const record = {
      title: newTitle.trim(),
      route: 'self_care',
      routeText: 'บันทึกอาการส่วนตัว',
      duration: newDuration.trim() || 'ไม่ระบุ',
      severity: newSeverity,
      symptoms: symArray.length ? symArray : [newTitle.trim()],
      redFlags: 'บันทึกด้วยตนเอง',
      advice: advArray.length ? advArray : ['พักผ่อน ดื่มน้ำ และสังเกตอาการ'],
      suggestedMeds: [],
      source: 'manual',
    };

    const updated = saveSymptomRecord(patientId, record);
    setHistory(updated);
    setShowAddModal(false);
    setNewTitle('');
    setNewDuration('');
    setNewSymptoms('');
    setNewAdvice('');
  };

  const formatDate = (isoStr) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const getRouteBadge = (route) => {
    if (route === 'emergency') return <Badge tone="bad">ภาวะฉุกเฉิน 1669</Badge>;
    if (route === 'urgent' || route === 'pharmacist') return <Badge tone="warn">ควรปรึกษาเภสัชกร</Badge>;
    return <Badge tone="good">ดูแลตัวเองเบื้องต้นได้</Badge>;
  };

  return (
    <div className="symptom-history-wrap stack-lg">
      {/* ── HEADER CARD ── */}
      <Card className="symptom-history-hero">
        <div className="symptom-hero-row">
          <div>
            <div className="badge badge-info" style={{ marginBottom: 6 }}>
              ประวัติสุขภาพย้อนหลัง
            </div>
            <h2>ประวัติอาการที่เคยเป็นและเคยปรึกษา</h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.95rem' }}>
              รวบรวมประวัติอาการที่คุณเคยทำแบบประเมินหรือปรึกษาในระบบ เพื่อใช้ติดตามอาการย้อนหลัง หรือแสดงให้เภสัชกร/แพทย์ดู
            </p>
          </div>
          <div className="symptom-hero-actions">
            <a href="#/care" className="btn btn-primary">
              <Icon name="search" size={18} /> ปรึกษาอาการใหม่
            </a>
            <Button variant="secondary" onClick={() => setShowAddModal(true)}>
              <Icon name="plus" size={18} stroke={2.6} /> จดบันทึกอาการ
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="symptom-filter-bar">
          <span className="muted small">กรองตามผลประเมิน:</span>
          <div className="chips">
            <button
              type="button"
              className={`chip ${filter === 'all' ? 'on' : ''}`}
              onClick={() => setFilter('all')}
            >
              ทั้งหมด ({history.length})
            </button>
            <button
              type="button"
              className={`chip ${filter === 'self_care' ? 'on' : ''}`}
              onClick={() => setFilter('self_care')}
            >
              ดูแลตัวเองได้ ({history.filter((h) => h.route === 'self_care').length})
            </button>
            <button
              type="button"
              className={`chip ${filter === 'pharmacist' ? 'on' : ''}`}
              onClick={() => setFilter('pharmacist')}
            >
              ปรึกษาเภสัชกร ({history.filter((h) => h.route === 'pharmacist' || h.route === 'urgent').length})
            </button>
          </div>
        </div>
      </Card>

      {/* ── SYMPTOM CARDS LIST ── */}
      <div className="stack">
        {filtered.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🩺</div>
            <h3>ยังไม่มีประวัติอาการในหมวดนี้</h3>
            <p className="muted small">คุณสามารถเริ่มทำแบบประเมินอาการเพื่อรับคำแนะนำ หรือกด "จดบันทึกอาการ" ด้านบนได้</p>
            <a href="#/care" className="btn btn-primary" style={{ marginTop: 12 }}>
              เริ่มประเมินอาการ
            </a>
          </Card>
        ) : (
          filtered.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <Card key={item.id} className="symptom-item-card stack">
                <div className="symptom-card-header">
                  <div className="symptom-main-info">
                    <div className="symptom-date-line">
                      <span className="symptom-date">
                        <Icon name="clock" size={14} /> {formatDate(item.date)}
                      </span>
                      {getRouteBadge(item.route)}
                      {item.source === 'chat' ? (
                        <span className="badge badge-neutral small">AI ปรึกษา</span>
                      ) : item.source === 'manual' ? (
                        <span className="badge badge-neutral small">จดบันทึกเอง</span>
                      ) : (
                        <span className="badge badge-neutral small">แบบประเมิน</span>
                      )}
                    </div>
                    <h3 className="symptom-item-title">{item.title}</h3>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(item.id)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'ย่อรายละเอียด' : 'ดูคำแนะนำและรายละเอียด'}
                    <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-flex', alignItems: 'center', transition: 'transform 0.2s', marginLeft: 6 }}>
                      <Icon name="chevron" size={16} stroke={2.4} />
                    </span>
                  </Button>
                </div>

                {/* Quick Symptom Chips */}
                {item.symptoms?.length ? (
                  <div className="symptom-tags-row">
                    <span className="muted small">อาการที่ระบุ:</span>
                    {item.symptoms.map((s, idx) => (
                      <span key={idx} className="chip chip-text">
                        {s}
                      </span>
                    ))}
                    {item.duration ? (
                      <span className="badge badge-neutral small">ระยะเวลา: {item.duration}</span>
                    ) : null}
                  </div>
                ) : null}

                {/* Expanded Details */}
                {isExpanded ? (
                  <div className="symptom-detail-panel stack">
                    {/* Home care advice */}
                    {item.advice?.length ? (
                      <div className="symptom-advice-box">
                        <strong className="advice-box-title">
                          <Icon name="check" size={18} /> คำแนะนำการดูแลตัวเองเบื้องต้น:
                        </strong>
                        <ul className="advice-list">
                          {item.advice.map((adv, aIdx) => (
                            <li key={aIdx}>{adv}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* Suggested Meds */}
                    {item.suggestedMeds?.length ? (
                      <div className="suggested-meds-box">
                        <strong>
                          <Icon name="pill" size={18} /> กลุ่มยาและวิธีบรรเทาอาการ:
                        </strong>
                        <div className="chips" style={{ marginTop: 6 }}>
                          {item.suggestedMeds.map((medName, mIdx) => (
                            <span key={mIdx} className="chip on">
                              {medName}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Red flag status */}
                    <div className="symptom-safety-note">
                      <span className="muted small">
                        🛡️ <strong>ความปลอดภัย:</strong> {item.redFlags}
                      </span>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })
        )}
      </div>

      {/* ── MANUAL LOG MODAL ── */}
      {showAddModal ? (
        <div className="symptom-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div
            className="symptom-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-symptom-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="between">
              <h3 id="modal-symptom-title">จดบันทึกอาการที่เคยเป็น</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>
            <p className="muted small">
              บันทึกอาการเพื่อเป็นประวัติสุขภาพของ {patientName} ช่วยให้ไม่ลืมเมื่อต้องมาปรึกษาเภสัชกร
            </p>

            <form onSubmit={handleAddSymptom} className="stack">
              <Field label="ชื่ออาการหลัก *" hint="เช่น ปวดศีรษะ, มีไข้หวัด, ผื่นคัน">
                <input
                  required
                  autoFocus
                  autoComplete="off"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="ระบุอาการหลัก..."
                />
              </Field>

              <div className="birth-row">
                <Field label="ระยะเวลาที่เป็น">
                  <input
                    autoComplete="off"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    placeholder="เช่น 2 วัน, 1 สัปดาห์"
                  />
                </Field>
                <Field label="ความรุนแรง">
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value)}
                  >
                    <option value="เล็กน้อย">เล็กน้อย (ไม่กระทบชีวิตประจำวัน)</option>
                    <option value="ปานกลาง">ปานกลาง</option>
                    <option value="มาก">มาก (ควรพบแพทย์)</option>
                  </select>
                </Field>
              </div>

              <Field label="อาการร่วม (คั่นด้วยจุลภาค ,)">
                <input
                  autoComplete="off"
                  value={newSymptoms}
                  onChange={(e) => setNewSymptoms(e.target.value)}
                  placeholder="เช่น มีน้ำมูก, เจ็บคอ, เบื่ออาหาร"
                />
              </Field>

              <Field label="วิธีดูแลหรือยาที่กินไปแล้ว (บรรทัดละข้อ)">
                <textarea
                  rows={3}
                  value={newAdvice}
                  onChange={(e) => setNewAdvice(e.target.value)}
                  placeholder="เช่น ดื่มน้ำอุ่น, กินพาราเซตามอล 1 เม็ด..."
                />
              </Field>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <Button variant="ghost" onClick={() => setShowAddModal(false)}>
                  ยกเลิก
                </Button>
                <Button type="submit">
                  <Icon name="check" size={18} stroke={2.6} /> บันทึกประวัติอาการ
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
