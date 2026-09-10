import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ text, onOpen }: { text: string; onOpen: (url: string) => void }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml
    urlTransform={url => /^https?:\/\//i.test(url) ? url : ''}
    components={{
      a: ({ href, children }) => href ? <a href={href} onClick={event => { event.preventDefault(); onOpen(href); }}>{children}</a> : <span>{children}</span>,
      img: ({ alt }) => <span>{alt || 'Image'}</span>,
      table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
    }}>{text}</ReactMarkdown></div>;
}
