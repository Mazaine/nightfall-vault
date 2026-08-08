import { Fragment, type ReactNode } from "react";

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return parts.map((part, index) => {
    const bold = part.match(/^\*\*(.+)\*\*$/);
    if (bold) return <strong key={index}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const external = /^https?:\/\//.test(link[2]);
      return <a href={link[2]} rel={external ? "noreferrer" : undefined} target={external ? "_blank" : undefined} key={index}>{link[1]}</a>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MarkdownDocument({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}</ul>);
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^\*\s+(.+)$/);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 4);
      if (level === 1) blocks.push(<h1 key={`h-${blocks.length}`}>{inlineMarkdown(heading[2])}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h-${blocks.length}`}>{inlineMarkdown(heading[2])}</h2>);
      else if (level === 3) blocks.push(<h3 key={`h-${blocks.length}`}>{inlineMarkdown(heading[2])}</h3>);
      else blocks.push(<h4 key={`h-${blocks.length}`}>{inlineMarkdown(heading[2])}</h4>);
    } else if (/^-{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div className="legal-document">{blocks}</div>;
}
