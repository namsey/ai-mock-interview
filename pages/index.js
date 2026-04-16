/**
 * pages/index.js
 *
 * Single-page UI. Three phases:
 *  'upload'    → CV input screen
 *  'interview' → Live chat with AI interviewer
 *  'feedback'  → Final assessment panel displayed below chat
 */

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [phase, setPhase] = useState('upload');
  const [cvText, setCvText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [meta, setMeta] = useState({ jobTitle: '', skills: [] });
  const [questionNum, setQuestionNum] = useState(0);
  const bottomRef = useRef(null);

  // Auto-scroll chat to bottom whenever messages or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, feedback]);

  // ── Handle file upload (TXT, PDF, DOCX) ──────────────────────────────────────
  const handleFileUpload = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validate file type
      const allowedExtensions = ['txt', 'pdf', 'doc', 'docx'];
      const fileExtension = file.name.toLowerCase().split('.').pop();
      
      if (!allowedExtensions.includes(fileExtension)) {
        alert('Please upload a .txt, .pdf, or .docx file.');
        return;
      }

      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File is too large. Please upload a file smaller than 5MB.');
        return;
      }

      // Show loading state
      setLoading(true);

      // Create FormData and upload to API
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to process file');
        }

        // Set the extracted text
        if (data.text) {
          setCvText(data.text);
          alert(`Successfully loaded ${data.fileName}`);
        } else {
          throw new Error('No text extracted from file');
        }

      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
        alert(uploadError.message || 'Failed to process file. Please paste your CV text instead.');
      } finally {
        setLoading(false);
      }

    } catch (err) {
      console.error('Error handling file upload:', err);
      alert('Failed to upload file. Please paste your CV instead.');
      setLoading(false);
    }
  };

  // ── Start interview: POST CV to /api/start ───────────────────────────────────
  const startInterview = async () => {
    if (!cvText.trim() || cvText.trim().length < 50) {
      alert('Please paste more CV content (at least a few sentences).');
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let data;
      try {
        data = await res.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }

      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      // Validate response structure
      if (!data.sessionId || !data.question || !data.jobTitle) {
        throw new Error('Invalid response format from server');
      }

      setSessionId(data.sessionId);
      setMeta({ jobTitle: data.jobTitle, skills: data.skills || [] });
      // Seed chat with the AI's opening question
      setMessages([{ role: 'assistant', content: data.question }]);
      setQuestionNum(1);
      setPhase('interview');

    } catch (err) {
      console.error('Error starting interview:', err);
      
      if (err.name === 'AbortError') {
        alert('Request timed out. The server might be busy. Please try again.');
      } else if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
        alert('Network error. Please check your internet connection and try again.');
      } else {
        alert('Error starting interview: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Send answer: POST to /api/chat ───────────────────────────────────────────
  const sendAnswer = async () => {
    const answer = input.trim();
    if (!answer || loading) return;

    // Validate answer length
    if (answer.length > 5000) {
      alert('Answer is too long. Please keep it under 5000 characters.');
      return;
    }

    // Optimistically render user's message immediately
    setMessages(prev => [...prev, { role: 'user', content: answer }]);
    setInput('');
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, answer }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let data;
      try {
        data = await res.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }

      if (!res.ok) {
        // Handle specific error codes
        if (res.status === 404) {
          throw new Error('Session expired. Please start a new interview.');
        } else if (res.status === 429) {
          throw new Error('Rate limit reached. Please wait a moment and try again.');
        } else if (res.status === 402) {
          throw new Error('Service quota exceeded. Please try again later.');
        }
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      // Validate response structure
      if (!data.type || !data.content) {
        throw new Error('Invalid response format from server');
      }

      if (data.type === 'feedback') {
        // Interview over — show a closing message then the feedback panel
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "That wraps up our interview. Thank you for your time — I appreciate your thoughtful answers. Here's my assessment:"
        }]);
        setFeedback(data.content);
        setPhase('feedback');
      } else if (data.type === 'question') {
        // Continue the interview with the next question
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
        setQuestionNum(prev => prev + 1);
      } else {
        throw new Error('Unexpected response type from server');
      }

    } catch (err) {
      console.error('Error sending answer:', err);

      // Roll back the optimistic user message on failure
      setMessages(prev => prev.slice(0, -1));
      setInput(answer);

      if (err.name === 'AbortError') {
        alert('Request timed out. The server might be busy. Please try again.');
      } else if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
        alert('Network error. Please check your internet connection and try again.');
      } else if (err.message.includes('Session expired')) {
        alert(err.message + ' The page will reload.');
        setTimeout(() => window.location.reload(), 2000);
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Enter to send, Shift+Enter for a new line in the textarea
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
    setMeta({ jobTitle: '', skills: [] });
    setQuestionNum(0);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: Upload / CV Input Screen
  // ────────────────────────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div style={styles.container}>
        <h1 style={styles.heading}>🎙 AI Mock Interview</h1>
        <p style={styles.subtext}>
          Upload or paste your CV. The AI will ask targeted questions based on
          your background and adapt follow-ups based on your answers — just like
          a real interviewer.
        </p>

        <div style={styles.card}>
          <label style={styles.label}>Upload CV (.txt, .pdf, or .docx)</label>
          <input
            type="file"
            accept=".txt,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            style={{ marginTop: 6, display: 'block', fontSize: 14 }}
            disabled={loading}
          />
          {loading && (
            <p style={{ color: '#6366f1', fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>
              Processing file...
            </p>
          )}

          <div style={{ margin: '20px 0', borderTop: '1px solid #e5e7eb' }} />

          <label style={styles.label}>Or paste your CV text directly</label>
          <textarea
            rows={14}
            style={styles.textarea}
            placeholder={`Paste your resume content here — work experience, skills, projects, education...\n\nExample:\nSoftware Engineer with 4 years experience in React, Node.js and PostgreSQL.\nWorked at Acme Corp on a real-time data pipeline that processed 1M events/day...`}
            value={cvText}
            onChange={e => setCvText(e.target.value)}
          />

          <button
            onClick={startInterview}
            disabled={loading || cvText.trim().length < 50}
            style={{
              ...styles.button,
              opacity: loading || cvText.trim().length < 50 ? 0.5 : 1,
              cursor: cvText.trim().length < 50 ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Preparing your interview...' : 'Start Interview →'}
          </button>

          {cvText.trim().length > 0 && cvText.trim().length < 50 && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>
              Please add more detail to your CV ({cvText.trim().length}/50 characters minimum).
            </p>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: Interview Chat + Feedback Screen
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={styles.heading}>
            {phase === 'feedback' ? '✅ Interview Complete' : '🎙 Interview in Progress'}
          </h1>
          {meta.jobTitle && (
            <p style={styles.subtext}>
              Role: <strong>{meta.jobTitle}</strong>
              {phase === 'interview' && ` · Question ${questionNum} of 6`}
            </p>
          )}
          {meta.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {meta.skills.slice(0, 8).map(s => (
                <span key={s} style={styles.skillTag}>{s}</span>
              ))}
              {meta.skills.length > 8 && (
                <span style={styles.skillTag}>+{meta.skills.length - 8} more</span>
              )}
            </div>
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

      {/* ── Chat Window ──────────────────────────────────────────────────── */}
      <div style={styles.chatWindow}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.messageRow,
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}
          >
            <span style={styles.avatar}>
              {msg.role === 'assistant' ? '🎙' : '👤'}
            </span>
            <div style={{
              ...styles.bubble,
              background: msg.role === 'user' ? '#dbeafe' : '#f3f4f6',
              borderRadius: msg.role === 'user'
                ? '16px 4px 16px 16px'
                : '4px 16px 16px 16px',
              textAlign: msg.role === 'user' ? 'right' : 'left'
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator — shows while waiting for Claude */}
        {loading && (
          <div style={{ ...styles.messageRow, flexDirection: 'row' }}>
            <span style={styles.avatar}>🎙</span>
            <div style={{
              ...styles.bubble,
              background: '#f3f4f6',
              fontStyle: 'italic',
              color: '#9ca3af',
              borderRadius: '4px 16px 16px 16px'
            }}>
              Thinking...
            </div>
          </div>
        )}

        {/* Feedback panel — rendered inline after the final message */}
        {feedback && (
          <div style={styles.feedbackPanel}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#92400e' }}>
              📋 Interview Assessment
            </h3>
            <pre style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              margin: 0,
              lineHeight: 1.75,
              fontSize: 14
            }}>
              {feedback}
            </pre>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Answer Input (hidden after interview completes) ───────────────── */}
      {phase === 'interview' && (
        <div style={styles.inputRow}>
          <textarea
            rows={3}
            style={{ ...styles.textarea, flex: 1, marginBottom: 0 }}
            placeholder="Type your answer here... (Enter to send, Shift+Enter for new line)"
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
              opacity: loading || !input.trim() ? 0.5 : 1,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            Send →
          </button>
        </div>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {phase === 'interview' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
            <div style={{
              background: '#6366f1',
              height: 5,
              borderRadius: 4,
              width: `${(questionNum / 6) * 100}%`,
              transition: 'width 0.5s ease'
            }} />
          </div>
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 6 }}>
            Question {questionNum} of 6 — {6 - questionNum} remaining
          </p>
        </div>
      )}
    </div>
  );
}

// ── Minimal inline styles (Phase 1: no external CSS needed) ──────────────────
const styles = {
  container: {
    maxWidth: 740,
    margin: '40px auto',
    padding: '0 20px 80px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#111827'
  },
  heading: {
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 6,
    letterSpacing: '-0.3px'
  },
  subtext: {
    color: '#6b7280',
    marginBottom: 20,
    lineHeight: 1.65,
    fontSize: 15
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 28,
    background: '#fafafa'
  },
  label: {
    fontWeight: 600,
    fontSize: 14,
    color: '#374151'
  },
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
    lineHeight: 1.65,
    color: '#111827',
    background: '#fff',
    outline: 'none'
  },
  button: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    padding: '12px 28px',
    borderRadius: 8,
    fontSize: 15,
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'background 0.2s'
  },
  skillTag: {
    background: '#e0e7ff',
    color: '#4338ca',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500
  },
  chatWindow: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '20px 16px',
    minHeight: 420,
    maxHeight: 540,
    overflowY: 'auto',
    background: '#fff',
    marginBottom: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 18
  },
  messageRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start'
  },
  avatar: {
    fontSize: 22,
    flexShrink: 0,
    marginTop: 1
  },
  bubble: {
    padding: '11px 15px',
    maxWidth: '78%',
    lineHeight: 1.65,
    fontSize: 14,
    color: '#111827'
  },
  feedbackPanel: {
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: 10,
    padding: '20px 22px',
    marginTop: 6,
    fontSize: 14,
    lineHeight: 1.7
  },
  inputRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start'
  }
};
