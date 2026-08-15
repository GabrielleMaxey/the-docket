// Matches **bold** or [label](url). Internal hash-router links (starting
// with "/#/" or "#/") navigate in place; anything else (a real https:// Jira
// browse link, for example) opens in a new tab.
const INLINE_PATTERN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

const renderInline = (text, keyPrefix) => {
  const nodes = [];
  let lastIndex = 0;
  let match;
  let i = 0;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${i}`}>{match[1]}</strong>);
    } else {
      const label = match[2];
      const url = match[3];
      const isInternal = url.startsWith("/#/") || url.startsWith("#/");
      nodes.push(
        <a
          key={`${keyPrefix}-a-${i}`}
          href={url}
          {...(isInternal ? {} : { target: "_blank", rel: "noreferrer" })}
        >
          {label}
        </a>
      );
    }
    i += 1;
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
};

const SimpleMarkdown = ({ text }) => {
  if (!text) {
    return null;
  }

  const elements = [];
  const lines = text.split("\n");
  let listItems = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${listKey}`} className="report-list">
          {listItems}
        </ul>
      );
      listItems = [];
      listKey += 1;
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={i} className="report-h3">{renderInline(line.slice(4), `h4-${i}`)}</h4>);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={i} className="report-h2">{renderInline(line.slice(3), `h3-${i}`)}</h3>);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={i} className="report-h1">{renderInline(line.slice(2), `h2-${i}`)}</h2>);
    } else if (line.match(/^[-*] /)) {
      listItems.push(<li key={i}>{renderInline(line.slice(2), `li-${i}`)}</li>);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(<p key={i} className="report-p">{renderInline(line, `p-${i}`)}</p>);
    }
  });

  flushList();
  return <div className="app-report-markdown">{elements}</div>;
};

export default SimpleMarkdown;
