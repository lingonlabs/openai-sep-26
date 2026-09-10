import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Circle, CircleCheck, ExternalLink, Loader2, X } from 'lucide-react';
import { findingsForMessage, taskProgress, taskStateLabel, taskPresence, type Task } from '@ambient/shared';
import { Button } from './Button';
import { Markdown } from './Markdown';
import { TaskHandoff } from './TaskHandoff';

export function TaskView({ task, onOpen, onPrepare, canPrepare, onResume, onReply, canReply = false }: { task: Task; onOpen: (url: string) => void; onPrepare: (finding: Task['findings'][number]) => void; canPrepare: boolean; onResume?: () => Promise<void>; onReply?: (text: string) => Promise<void>; canReply?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (task.status !== 'running') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [task.status]);
  const issues = task.activity.filter(a => a.status === 'error');
  return <div className="task-view"><div className={'task-status ' + task.status}>{task.status === 'running' ? <Loader2 size={13} className="spin"/> : task.status === 'completed' ? <CircleCheck size={13}/> : <Circle size={13}/>} {taskStateLabel(task)}{task.status !== 'running' && ' · agent not running'}</div>
    {task.status === 'running' && <div className="live-progress" role="status"><Loader2 size={16} className="spin"/><div><strong>{taskProgress(task)}</strong><small>{task.activity.filter(a => a.status === 'done').length} actions completed · {Math.max(0, Math.floor((now - (task.runStartedAt ?? task.createdAt)) / 1000))}s elapsed</small></div></div>}
    {issues.length > 0 && <div className="issue-summary">{issues.length} browser {issues.length === 1 ? 'action failed' : 'actions failed'}. {task.status === 'running' ? 'The agent is reviewing what it can do next.' : 'Review the result for incomplete checks.'} Details are in Browser activity below.</div>}
    {task.error && <div className="error-box">{task.error}</div>}
    {task.activity.length > 0 && <details className="activity-log"><summary>Browser activity <span>{task.activity.length} actions</span></summary>{[...task.activity].reverse().map(a => <div key={a.id} className={'activity-event ' + a.status}>{a.status === 'working' ? <Loader2 size={13} className="spin"/> : a.status === 'done' ? <Check size={13}/> : <X size={13}/>}<div className="event-body"><strong>{a.text}</strong><small>{a.status === 'working' ? 'In progress' : a.status === 'done' ? 'Done' : 'Failed'} · {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>{a.detail && <p>{a.detail}</p>}{a.status === 'error' && <p className="event-error">{a.error || 'This older run did not retain the error detail. Retry with the updated extension for a precise error.'}</p>}</div></div>)}</details>}
    {task.messages.map((message, index) => {
      const attached = findingsForMessage(task, index);
      if (!message.text && !attached.findings.length) return null;
      const content = <>
        {message.role === 'assistant' ? <Markdown text={message.text} onOpen={onOpen}/> : <p>{message.text}</p>}
        {attached.findings.length > 0 && <details className="message-findings"><summary>{attached.legacy ? 'Findings (includes earlier task evidence)' : 'Findings'} <span>{attached.findings.length}</span></summary>
          <div className="findings">{attached.findings.map(f => <article className="finding-card" key={f.id}><div className="finding-top"><span className={'finding-status ' + f.status}>{({ candidate: 'No match found', recorded: 'Already recorded', onboarding: 'Check onboarding', uncertain: 'Needs review' })[f.status]}</span><strong>{f.amount}</strong></div><h3>{f.vendor}</h3><div className="invoice-ref">Invoice {f.invoice}</div><p>{f.explanation}</p><div className="sources">{f.sources.map((s, i) => <button key={i} onClick={() => onOpen(s.url)}><ExternalLink size={11}/>{s.title}</button>)}</div>{f.status === 'candidate' && <Button variant="secondary" size="small" disabled={!canPrepare} onClick={() => onPrepare(f)}>Prepare for review <ArrowUpRight size={13}/></Button>}</article>)}</div>
        </details>}
      </>;
      return <div key={message.id ?? index} className={'message ' + message.role}>
        <div className="message-author">{message.role === 'user' ? 'YOU' : 'AMBIENT'}</div>
        {message.interim ? <details className="interim-response"><summary>Earlier attempt · continued working</summary>{content}</details> : content}
      </div>;
    })}
    {(task.queuedReplies?.length ?? 0) > 0 && <div role="status" className="queued-reply">Update received. Ambient will use it when the current step finishes.</div>}
    {task.status !== 'running' && task.status !== 'completed' && onResume && onReply && <TaskHandoff key={task.id} task={taskPresence(task)} disabled={!canReply} onResume={onResume} onReply={onReply}/>}
  </div>;
}
