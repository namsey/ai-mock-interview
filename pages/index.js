/**
 * pages/index.js — Phase 3
 *
 * New UI elements:
 *  - Interview mode badge (Normal / Probing / Pressure) with color
 *  - Current topic indicator
 *  - Contradiction alert when AI surfaces one
 *  - Topics coverage panel in feedback
 *  - Claims count + contradictions note in feedback meta
 */

import { useState, useRef, useEffect } from 'react';

const STAGE_LABELS = {
  intro: '👋 Intro',
  cv_deep_dive: '📄 CV Deep Dive',
  technical: '⚙️ Technical',
  behavioral: '🧠 Behavioral',
  wrap_up: '✅ Wrap Up'
};

const MODE_STYLES = {
  normal:   { bg: '#f3f4f6', color: '#374151', label: '⚖️ Normal' },
  probing:  { bg: '#ede9fe', color: '#5b21b6', label: '🔬 Probing' },
  pressure: { bg: '#fee2e2', color: '#991b1b', label: '🔥 Pressure' }
};

const DIFFICULTY_STYLES = {
  easy:   { bg: '#dcfce7', color: '#15803d' },
  medium: { bg: '#fef9c3', color: '#854d0e' },
  hard:   { bg: '#fee2e2', color: '#991b1b' }
};

export default function Home() {
  const [phase, setPhase]           = useState('upload');
  const [cvText, setCvText]         = useState('');
  const [sessionId, setSessionId]   = useState(null);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [feedback, setFeedback]     = useState(null);
  const [feedbackMeta, setFeedbackMeta] = useState(null);
  const [meta, setMeta]             = useState({ jobTitle: '', seniorityLevel: '', skills: [], skillGroups: {} });
  const [iState, setIState]         = useState({
    currentStage: 'intro', difficulty: 'easy', interviewMode: 'normal',
    currentTopic: '', questionNum: 0, actionType: ''
  });
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, feedback]);

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['txt','pdf','doc','docx'].includes(ext)) { alert('Please upload .txt, .pdf, or .docx'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('File too large (max 5MB)'); return; }
    setLoading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setCvText(d.text);
    } catch (err) { alert('File error: ' + err.message); }
    setLoading(false);
  };

  // ── Start ──────────────────────────────────────────────────────────────────
  const startInterview = async () => {
    if (cvText.trim().length < 50) { alert('Please add more CV content (min 50 chars).'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSessionId(d.sessionId);
      setMeta({ jobTitle: d.jobTitle, seniorityLevel: d.seniorityLevel || '', skills: d.skills || [], skillGroups: d.skillGroups || {} });
      setIState({ currentStage: d.currentStage, difficulty: d.difficulty, interviewMode: d.interviewMode || 'normal', currentTopic: d.currentTopic || '', questionNum: 1, actionType: '' });
      setMessages([{ role: 'assistant', content: d.question }]);
      setPhase('interview');
    } catch (err) { alert('Error: ' + err.message); }
    setLoading(false);
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendAnswer = async () => {
    const answer = input.trim();
    if (!answer || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: answer }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, answer })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      if (d.type === 'feedback') {
        setMessages(prev => [...prev, { role: 'assistant', content: "That wraps up our interview. Here's my full assessment:" }]);
        setFeedback(d.content);
        setFeedbackMeta({
          averageScore: d.averageScore,
          scores: d.scores || [],
          claimsCount: d.claimsCount || 0,
          contradictionsFound: d.contradictionsFound || 0,
          topicsCovered: d.topicsCovered || []
        });
        setPhase('feedback');
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: d.content, actionType: d.actionType }]);
        setIState(prev => ({
          ...prev,
          currentStage: d.stage || prev.currentStage,
          difficulty: d.difficulty || prev.difficulty,
          interviewMode: d.interviewMode || prev.interviewMode,
          questionNum: d.questionNum || prev.questionNum + 1,
          actionType: d.actionType || ''
        }));
      }
    } catch (err) {
      setMessages(prev => prev.slice(0, -1));
      setInput(answer);
      alert('Error: ' + err.message);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAnswer(); }
  };

  const reset = () => {
    setPhase('upload'); setCvText(''); setSessionId(null); setMessages([]);
    setInput(''); setFeedback(null); setFeedbackMeta(null);
    setMeta({ jobTitle: '', seniorityLevel: '', skills: [], skillGroups: {} });
    setIState({ currentStage: 'intro', difficulty: 'easy', interviewMode: 'normal', currentTopic: '', questionNum: 0, actionType: '' });
  };

  const renderFeedback = (text) =>
    text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : <span key={j}>{p}</span>)}
          {'\n'}
        </span>
      );
    });

  // ────────────────────────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div style={S.container}>
        <h1 style={S.heading}>🎙 AI Mock Interview</h1>
        <p style={S.subtext}>Upload your CV for an adaptive, human-like interview. The AI tracks your claims, detects inconsistencies, and adapts pressure based on your answers.</p>
        <div style={S.card}>
          <label style={S.label}>Upload CV (.txt, .pdf, .docx)</label>
          <input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleFileUpload} disabled={loading} style={{ marginTop: 6, display: 'block', fontSize: 14 }} />
          {loading && <p style={{ color: '#6366f1', fontSize: 13, marginTop: 6, fontStyle: 'italic' }}>Processing...</p>}
          <div style={{ margin: '18px 0', borderTop: '1px solid #e5e7eb' }} />
          <label style={S.label}>Or paste CV text</label>
          <textarea rows={12} style={S.textarea} placeholder="Paste your resume — roles, skills, projects, education..." value={cvText} onChange={e => setCvText(e.target.value)} />
          <button onClick={startInterview} disabled={loading || cvText.trim().length < 50}
            style={{ ...S.button, opacity: loading || cvText.trim().length < 50 ? 0.5 : 1 }}>
            {loading ? 'Preparing...' : 'Start Interview →'}
          </button>
          {cvText.length > 0 && cvText.trim().length < 50 && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{cvText.trim().length}/50 chars minimum.</p>
          )}
        </div>
      </div>
    );
  }

  const modeStyle = MODE_STYLES[iState.interviewMode] || MODE_STYLES.normal;
  const diffStyle = DIFFICULTY_STYLES[iState.difficulty] || DIFFICULTY_STYLES.easy;

  return (
    <div style={S.container}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={S.heading}>
            {phase === 'feedback' ? '✅ Interview Complete' : '🎙 Interview in Progress'}
          </h1>
          {meta.jobTitle && (
            <p style={S.subtext}>
              <strong>{meta.jobTitle}</strong>
              {meta.seniorityLevel && <span style={S.badge('#ede9fe','#5b21b6')}>{meta.seniorityLevel}</span>}
            </p>
          )}

          {/* Phase 3 live status row */}
          {phase === 'interview' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={S.badge('#e0e7ff','#3730a3')}>{STAGE_LABELS[iState.currentStage]}</span>
              <span style={S.badge(diffStyle.bg, diffStyle.color)}>
                {iState.difficulty.charAt(0).toUpperCase() + iState.difficulty.slice(1)}
              </span>
              <span style={S.badge(modeStyle.bg, modeStyle.color)}>{modeStyle.label}</span>
              {iState.currentTopic && (
                <span style={S.badge('#f0fdf4','#166534')}>🏷 {iState.currentTopic}</span>
              )}
            </div>
          )}

          {/* Skill groups */}
          {Object.keys(meta.skillGroups).length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {Object.entries(meta.skillGroups).slice(0, 2).map(([cat, list]) => (
                <div key={cat} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', minWidth: 56 }}>{cat}</span>
                  {list.slice(0, 4).map(s => <span key={s} style={S.skillTag}>{s}</span>)}
                </div>
              ))}
            </div>
          )}
        </div>

        {phase === 'feedback' && (
          <button onClick={reset} style={{ ...S.button, padding: '8px 16px', fontSize: 13, flexShrink: 0 }}>
            New Interview →
          </button>
        )}
      </div>

      {/* ── Chat window ───────────────────────────────────────────────────── */}
      <div style={S.chatWindow}>
        {messages.map((msg, i) => {
          const isContradiction = msg.actionType === 'contradiction';
          const isChallenge = msg.actionType === 'challenge';
          return (
            <div key={i} style={{ ...S.messageRow, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <span style={S.avatar}>{msg.role === 'assistant' ? (isContradiction ? '🔍' : isChallenge ? '⚡' : '🎙') : '👤'}</span>
              <div style={{
                ...S.bubble,
                background: msg.role === 'user' ? '#dbeafe' : isContradiction ? '#fff7ed' : isChallenge ? '#fef3c7' : '#f3f4f6',
                borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                borderLeft: isContradiction ? '3px solid #f97316' : isChallenge ? '3px solid #f59e0b' : 'none'
              }}>
                {msg.content}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ ...S.messageRow, flexDirection: 'row' }}>
            <span style={S.avatar}>🎙</span>
            <div style={{ ...S.bubble, background: '#f3f4f6', fontStyle: 'italic', color: '#9ca3af', borderRadius: '4px 16px 16px 16px' }}>
              Thinking...
            </div>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div style={S.feedbackPanel}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#92400e' }}>📋 Interview Assessment</h3>

            {/* Score pills */}
            {feedbackMeta?.scores?.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Per-Answer Scores</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>
                    {feedbackMeta.averageScore}/5 ({Math.round(feedbackMeta.averageScore * 2)}/10)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {feedbackMeta.scores.map((s, i) => {
                    const c = { 5:'#dcfce7', 4:'#d1fae5', 3:'#fef9c3', 2:'#fed7aa', 1:'#fee2e2' }[s.score] || '#f3f4f6';
                    const tc = { 5:'#15803d', 4:'#065f46', 3:'#854d0e', 2:'#9a3412', 1:'#991b1b' }[s.score] || '#374151';
                    return (
                      <div key={i} style={{ background: c, color: tc, padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, textAlign: 'center', minWidth: 40 }}>
                        Q{i+1}<br/>{s.score}/5
                      </div>
                    );
                  })}
                </div>
                {/* Phase 3 meta */}
                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', display: 'flex', gap: 12 }}>
                  <span>💬 {feedbackMeta.claimsCount} claims tracked</span>
                  {feedbackMeta.contradictionsFound > 0 && <span>⚠️ {feedbackMeta.contradictionsFound} inconsistency detected</span>}
                  <span>🏷 {feedbackMeta.topicsCovered?.length || 0} topics covered</span>
                </div>
              </div>
            )}

            {/* Topics depth panel */}
            {feedbackMeta?.topicsCovered?.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Topic Coverage</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {feedbackMeta.topicsCovered.map((t, i) => (
                    <div key={i} style={{ fontSize: 11, background: '#f3f4f6', borderRadius: 6, padding: '3px 8px', color: '#374151' }}>
                      <strong>{t.topic}</strong> depth {t.depth}/5 · {t.confidence}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 14, lineHeight: 1.75 }}>{renderFeedback(feedback)}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      {phase === 'interview' && (
        <div style={S.inputRow}>
          <textarea rows={3} style={{ ...S.textarea, flex: 1, marginBottom: 0 }}
            placeholder="Type your answer... (Enter to send, Shift+Enter for newline)"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown} disabled={loading} autoFocus />
          <button onClick={sendAnswer} disabled={loading || !input.trim()}
            style={{ ...S.button, padding: '0 20px', height: 'auto', alignSelf: 'stretch', opacity: loading || !input.trim() ? 0.5 : 1 }}>
            Send →
          </button>
        </div>
      )}

      {/* ── Progress ──────────────────────────────────────────────────────── */}
      {phase === 'interview' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 4 }}>
            <div style={{ background: '#6366f1', height: 4, borderRadius: 4, width: `${Math.min((iState.questionNum / 10) * 100, 100)}%`, transition: 'width 0.5s ease' }} />
          </div>
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 5 }}>
            Question {iState.questionNum} · {STAGE_LABELS[iState.currentStage]} · {iState.currentTopic && `Topic: ${iState.currentTopic}`}
          </p>
        </div>
      )}
    </div>
  );
}

// Helper for inline badge style
const S = {
  container: { maxWidth: 760, margin: '36px auto', padding: '0 20px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#111827' },
  heading: { fontSize: 25, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.3px' },
  subtext: { color: '#6b7280', marginBottom: 10, lineHeight: 1.6, fontSize: 14 },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 26, background: '#fafafa' },
  label: { fontWeight: 600, fontSize: 14, color: '#374151' },
  textarea: { width: '100%', fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, marginTop: 8, marginBottom: 16, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, color: '#111827', background: '#fff' },
  button: { background: '#6366f1', color: '#fff', border: 'none', padding: '12px 26px', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 600 },
  badge: (bg, color) => ({ background: bg, color, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, display: 'inline-block', marginLeft: 6 }),
  skillTag: { background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 },
  chatWindow: { border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 16px', minHeight: 400, maxHeight: 530, overflowY: 'auto', background: '#fff', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 16 },
  messageRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  avatar: { fontSize: 21, flexShrink: 0, marginTop: 2 },
  bubble: { padding: '10px 14px', maxWidth: '78%', lineHeight: 1.65, fontSize: 14, color: '#111827' },
  feedbackPanel: { background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '18px 20px', marginTop: 6, fontSize: 14 },
  inputRow: { display: 'flex', gap: 10, alignItems: 'flex-start' }
};
