import { XMarkdown } from '@ant-design/x-markdown';

type MarkdownContentProps = {
  content: string;
  streaming?: boolean;
};

export function MarkdownContent({ content, streaming = false }: MarkdownContentProps) {
  return (
    <XMarkdown
      className="assistant-markdown"
      content={content}
      streaming={{
        hasNextChunk: streaming,
        enableAnimation: streaming,
        tail: streaming,
      }}
    />
  );
}
