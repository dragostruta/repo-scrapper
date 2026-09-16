'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

/**
 * Renders an LLM answer as markdown with syntax-highlighted code blocks.
 * The answer text is model output grounded in retrieved code (see the
 * prompt's grounding rules), not raw untrusted repository content, so
 * rendering it as markdown here is a display choice, not a security one -
 * the untrusted-content handling happens earlier, in what the model is
 * allowed to treat as instructions (see answering/prompt.ts).
 */
export function MarkdownAnswer({ text }: { text: string }) {
  return (
    <div className="markdown-answer text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
