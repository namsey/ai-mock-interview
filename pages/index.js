/**
 * pages/index.js
 *
 * PHASE 2 UI CHANGES:
 *  - Stage indicator badge (Intro → CV Deep Dive → Technical → Behavioral)
 *  - Difficulty badge (Easy / Medium / Hard) that updates live
 *  - Skill groups displayed by category (not just a flat tag list)
 *  - Score panel in feedback: per-answer scores + average
 *  - Seniority level shown in header
 *  - Feedback renders markdown bold (**text**) properly
 *
 * UI remains minimal — no external CSS dependencies.
 */

import { useState, useRef, useEffect } from 'react';

// Stage labels shown in the UI
const STAGE_LABELS = {
  intro: '👋 Intro',
  cv_deep_dive: '📄 CV Deep Dive',
  technical: '⚙️ Technical',
  behavioral: '🧠 Behavioral',
  wrap_up: '✅ Wrap Up'
};

const DIFFICULTY_COLORS = {
  easy: { bg: '#dcfce7', color: '#15803d' },
  medium: { bg: '#fef9c3', color: '#854d0e' },
  hard: { bg: '#fee2e2', color: '#991b1b' }
};

export default function Home() {
  const [phase, setPhase] = useState('upload');
  const [cvText, setCvText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [scoreData, setScoreData] = useState(null);  // { scores, averageScore }

  // Phase 2 meta — richer than v1
  const [meta, setMeta] = useState({
    jobTitle: '',
    seniorityLevel: '',
    estimatedYears: 0,
    skills: [],
    skillGroups: {}
  });
  const [interviewState, setInterviewState] = useState({
    currentStage: 'intro',
    difficulty: 'easy',
    questionNum: 0
  });

  const bottomRef = useRef(null);
  const TOTAL_QUESTIONS = 6;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, feedback]);

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowed = ['txt', 'pdf', 'doc', 'docx'];
    const ext = file.name.toLowerCase().split('.').pop();
    if (!allowed.includes(ext)) {
      alert('Please upload a .txt, .pdf, or .docx file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Max 5MB.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCvText(data.text);
    } catch (err) {
      alert('Failed to process file: ' + err.message);
    }
    setLoading(false);
  };

  // ── Start interview ────────────────────────────────────────────────────────
  const startInterview = async () => {
    if (!cvText.trim() || cvText.trim().length < 50) {
      alert('Please paste more CV content (at least 50 characters).');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSessionId(data.sessionId);
      setMeta({
        jobTitle: data.jobTitle,
        seniorityLevel: data.seniorityLevel || '',
        estimatedYears: data.estimatedYears || 0,
        skills: data.skills || [],
        skillGroups: data.skillGroups || {}
      });
      setInterviewState({
        currentStage: data.currentStage || 'intro',
        difficulty: data.difficulty || 'easy',
        questionNum: 1
      });
      setMessages([{ role: 'assistant', content: data.question }]);
      setPhase('interview');
    } catch (err) {
      alert('Error starting interview: ' + err.message);
    }
    setLoading(false);
  };

  // ── Send answer ────────────────────────────────────────────────────────────
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.type === 'feedback') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "That wraps up our interview. Thank you — here's my full assessment:"
        }]);
        setFeedback(data.content);
        setScoreData({
          scores: data.scores || [],
          averageScore: data.averageScore || 0,
          totalAnswered: data.totalAnswered || 0
        });
        setPhase('feedback');
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
        // Update live stage + difficulty badges from API response
        setInterviewState({
          currentStage: data.stage || interviewState.currentStage,
          difficulty: data.difficulty || interviewState.difficulty,
          questionNum: data.questionNum || interviewState.questionNum + 1
        });
      }
    } catch (err) {
      setMessages(prev => prev.slice(0, -1));
      setInput(answer);
      alert('Error: ' + err.message);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAnswer();
    }
  };

  const resetInterview = () => {
    setPhase('upload');
    setCvText('');
    setSessionId(null);
    setMessages([]);
    setInput('');
    setFeedback(null);
    setScoreData(null);
    setMeta({ jobTitle: '', seniorityLevel: '', estimatedYears: 0, skills: [], skillGroups: {} });
    setInterviewState({ currentStage: 'intro', difficulty: 'easy', questionNum: 0 });
  };

  // ── Render feedback text with **bold** markdown support ───────────────────
  const renderFeedbackLine = (line, idx) => {
    // Replace **text** with <strong>text</strong>
    const parts = line.split(/\*\*(.+?)\*\*/g);
    return (
      <span key={idx}>
        {parts.map((part, i) =>
          i % 2 === 1
            ? <strong key={i}>{part}</strong>
            : <span key={i}>{part}</span>
        )}
        {'\n'}
      </span>
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: Upload Screen
  // ────────────────────────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div style={styles.container}>
        <h1 style={styles.heading}>🎙 AI Mock Interview</h1>
        <p style={styles.subtext}>
          Upload your CV for an adaptive interview. Questions deepen based on your answers —
          just like a real interviewer.
        </p>

        <div style={styles.card}>
          <label style={styles.label}>Upload CV (.txt, .pdf, .docx)</label>
          <input
            type="file"
            accept=".txt,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            disabled={loading}
            style={{ marginTop: 6, display: 'block', fontSize: 14 }}
          />
          {loading && <p style={styles.hint}>Processing file...</p>}

          <div style={{ margin: '20px 0', borderTop: '1px solid #e5e7eb' }} />

          <label style={styles.label}>Or paste your CV text</label>
          <textarea
            rows={12}
            style={styles.textarea}
            placeholder="Paste your resume/CV here — roles, skills, projects, education..."
            value={cvText}
            onChange={e => setCvText(e.target.value)}
          />

          <button
            onClick={startInterview}
            disabled={loading || cvText.trim().length < 50}
            style={{
              ...styles.button,
              opacity: loading || cvText.trim().length < 50 ? 0.5 : 1
            }}
          >
            {loading ? 'Preparing interview...' : 'Start Interview →'}
          </button>

          {cvText.length > 0 && cvText.trim().length < 50 && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>
              Add more CV content ({cvText.trim().length}/50 min characters).
            </p>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: Interview + Feedback
  // ────────────────────────────────────────────────────────────────────────────
  const diffStyle = DIFFICULTY_COLORS[interviewState.difficulty] || DIFFICULTY_COLORS.easy;

  return (
    <div style={styles.container}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <h1 style={styles.heading}>
            {phase === 'feedback' ? '✅ Interview Complete' : '🎙 Interview in Progress'}
          </h1>

          {/* Role + seniority line */}
          {meta.jobTitle && (
            <p style={styles.subtext}>
              <strong>{meta.jobTitle}</strong>
              {meta.seniorityLevel && (
                <span style={styles.seniorityBadge}>{meta.seniorityLevel}</span>
              )}
              {meta.estimatedYears > 0 && (
                <span style={{ color: '#9ca3af', fontSize: 13 }}> · ~{meta.estimatedYears} yrs exp</span>
              )}
            </p>
          )}

          {/* Stage + difficulty badges (only during interview) */}
          {phase === 'interview' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={styles.stageBadge}>
                {STAGE_LABELS[interviewState.currentStage] || interviewState.currentStage}
              </span>
              <span style={{ ...styles.difficultyBadge, background: diffStyle.bg, color: diffStyle.color }}>
                {interviewState.difficulty.charAt(0).toUpperCase() + interviewState.difficulty.slice(1)}
              </span>
            </div>
          )}

          {/* Skill group chips — grouped by category */}
          {Object.keys(meta.skillGroups).length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              {Object.entries(meta.skillGroups).slice(0, 3).map(([cat, skillList]) => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={styles.categoryLabel}>{cat}</span>
                  {skillList.slice(0, 4).map(s => (
                    <span key={s} style={styles.skillTag}>{s}</span>
                  ))}
                  {skillList.length > 4 && <span style={styles.skillTag}>+{skillList.length - 4}</span>}
                </div>
              ))}
            </div>
          ) : (
            // Fallback: flat skill list from v1
            meta.skills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {meta.skills.slice(0, 8).map(s => (
                  <span key={s} style={styles.skillTag}>{s}</span>
                ))}
              </div>
            )
          )}
        </div>

        {phase === 'feedback' && (
          <button
            onClick={resetInterview}
            style={{ ...styles.button, padding: '8px 16px', fontSize: 13, flexShrink: 0 }}
          >
            New Interview →
          </button>
        )}
      </div>

      {/* ── Chat window ───────────────────────────────────────────────────── */}
      <div style={styles.chatWindow}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.messageRow,
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}
          >
            <span style={styles.avatar}>{msg.role === 'assistant' ? '🎙' : '👤'}</span>
            <div style={{
              ...styles.bubble,
              background: msg.role === 'user' ? '#dbeafe' : '#f3f4f6',
              borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px'
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {loading && (
          <div style={{ ...styles.messageRow, flexDirection: 'row' }}>
            <span style={styles.avatar}>🎙</span>
            <div style={{ ...styles.bubble, background: '#f3f4f6', fontStyle: 'italic', color: '#9ca3af', borderRadius: '4px 16px 16px 16px' }}>
              Thinking...
            </div>
          </div>
        )}

        {/* ── Feedback panel ─────────────────────────────────────────────── */}
        {feedback && (
          <div style={styles.feedbackPanel}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#92400e' }}>
              📋 Interview Assessment
            </h3>

            {/* Score summary bar (Phase 2 new) */}
            {scoreData && scoreData.scores.length > 0 && (
              <div style={styles.scoreSummary}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Per-Answer Scores</span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#1d4ed8' }}>
                    Avg: {scoreData.averageScore}/5
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                      ({Math.round(scoreData.averageScore * 2)}/10)
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {scoreData.scores.map((s, i) => (
                    <div key={i} style={getScorePillStyle(s.score)}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>Q{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{s.score}/5</span>
                      <span style={{ fontSize: 10, opacity: 0.8 }}>{s.stage?.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback text with **bold** markdown rendered */}
            <div style={{ fontSize: 14, lineHeight: 1.75, marginTop: 12 }}>
              {feedback.split('\n').map((line, i) => renderFeedbackLine(line, i))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      {phase === 'interview' && (
        <div style={styles.inputRow}>
          <textarea
            rows={3}
            style={{ ...styles.textarea, flex: 1, marginBottom: 0 }}
            placeholder="Type your answer... (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            autoFocus
          />
          <button
            onClick={sendAnswer}
            disabled={loading || !input.trim()}
            style={{
              ...styles.button,
              padding: '0 22px',
              height: 'auto',
              alignSelf: 'stretch',
              opacity: loading || !input.trim() ? 0.5 : 1
            }}
          >
            Send →
          </button>
        </div>
      )}

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      {phase === 'interview' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
            <div style={{
              background: '#6366f1',
              height: 5,
              borderRadius: 4,
              width: `${(interviewState.questionNum / TOTAL_QUESTIONS) * 100}%`,
              transition: 'width 0.5s ease'
            }} />
          </div>
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 5 }}>
            Question {interviewState.questionNum} of {TOTAL_QUESTIONS} ·{' '}
            Stage: {STAGE_LABELS[interviewState.currentStage] || interviewState.currentStage}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Score pill color by score value ──────────────────────────────────────────
function getScorePillStyle(score) {
  const colorMap = {
    5: { bg: '#dcfce7', color: '#15803d' },
    4: { bg: '#d1fae5', color: '#065f46' },
    3: { bg: '#fef9c3', color: '#854d0e' },
    2: { bg: '#fed7aa', color: '#9a3412' },
    1: { bg: '#fee2e2', color: '#991b1b' }
  };
  const c = colorMap[score] || colorMap[3];
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 8,
    background: c.bg,
    color: c.color,
    minWidth: 52,
    gap: 1
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  container: {
    maxWidth: 760,
    margin: '36px auto',
    padding: '0 20px 80px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#111827'
  },
  heading: { fontSize: 25, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.3px' },
  subtext: { color: '#6b7280', marginBottom: 10, lineHeight: 1.6, fontSize: 14 },
  hint: { color: '#6366f1', fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 26, background: '#fafafa' },
  label: { fontWeight: 600, fontSize: 14, color: '#374151' },
  textarea: {
    width: '100%',
    fontFamily: 'inherit',
    fontSize: 14,
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 16,
    resize: 'vertical',
    boxSizing: 'border-box',
    lineHeight: 1.6,
    color: '#111827',
    background: '#fff'
  },
  button: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    padding: '12px 26px',
    borderRadius: 8,
    fontSize: 15,
    cursor: 'pointer',
    fontWeight: 600
  },
  seniorityBadge: {
    background: '#ede9fe',
    color: '#5b21b6',
    padding: '2px 8px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    marginLeft: 8,
    textTransform: 'capitalize'
  },
  stageBadge: {
    background: '#e0e7ff',
    color: '#3730a3',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600
  },
  difficultyBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    minWidth: 60
  },
  skillTag: {
    background: '#e0e7ff',
    color: '#4338ca',
    padding: '2px 8px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500
  },
  chatWindow: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '18px 16px',
    minHeight: 400,
    maxHeight: 520,
    overflowY: 'auto',
    background: '#fff',
    marginBottom: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  messageRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  avatar: { fontSize: 21, flexShrink: 0, marginTop: 2 },
  bubble: { padding: '10px 14px', maxWidth: '78%', lineHeight: 1.65, fontSize: 14, color: '#111827' },
  feedbackPanel: {
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: 10,
    padding: '18px 20px',
    marginTop: 6,
    fontSize: 14
  },
  scoreSummary: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '12px 14px'
  },
  inputRow: { display: 'flex', gap: 10, alignItems: 'flex-start' }
};
