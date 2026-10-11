import { Link } from "react-router-dom";

const isSafeHref = (href) => {
  const value = String(href || "").trim();
  return (
    value.startsWith("/#/") ||
    value.startsWith("/work-week") ||
    value.startsWith("https://") ||
    value.startsWith("http://localhost") ||
    value.startsWith("http://127.0.0.1")
  );
};

const routerPathFromHref = (href) => {
  const value = String(href || "").trim();
  if (value.startsWith("/#/")) {
    return value.slice(2);
  }
  if (value.startsWith("/work-week") || value.startsWith("/dashboard") || value.startsWith("/reports")) {
    return value;
  }
  return null;
};

const INLINE_PATTERN =
  /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]+)\]\(([^)]+)\)/g;

const renderInline = (text, keyPrefix) => {
  const nodes = [];
  const source = String(text || "");
  let part = 0;
  let remaining = source;

  while (remaining.length > 0) {
    INLINE_PATTERN.lastIndex = 0;
    const match = INLINE_PATTERN.exec(remaining);
    if (!match) {
      nodes.push(remaining);
      break;
    }

    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }

    if (match[1] !== undefined) {
      nodes.push(<code key={`${keyPrefix}-code-${part}`}>{match[1]}</code>);
    } else if (match[2] !== undefined || match[3] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${part}`}>{match[2] ?? match[3]}</strong>);
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i-${part}`}>{match[4] ?? match[5]}</em>);
    } else if (match[6] !== undefined) {
      const label = match[6];
      const href = String(match[7] || "").trim();
      if (isSafeHref(href)) {
        const to = routerPathFromHref(href);
        if (to) {
          nodes.push(
            <Link key={`${keyPrefix}-a-${part}`} to={to} className="report-link">
              {label}
            </Link>
          );
        } else {
          nodes.push(
            <a
              key={`${keyPrefix}-a-${part}`}
              href={href}
              className="report-link"
              target="_blank"
              rel="noreferrer"
            >
              {label}
            </a>
          );
        }
      } else {
        nodes.push(match[0]);
      }
    }

    remaining = remaining.slice(match.index + match[0].length);
    part += 1;
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
  let listType = null; // "ul" | "ol" | null
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      const ListTag = listType === "ol" ? "ol" : "ul";
      elements.push(
        <ListTag
          key={`list-${listKey}`}
          className={`report-list${listType === "ol" ? " report-list--ordered" : ""}`}
        >
          {listItems}
        </ListTag>
      );
      listItems = [];
      listKey += 1;
    }
    listType = null;
  };

  lines.forEach((line, i) => {
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={i} className="report-h3">{renderInline(line.slice(4), `h4-${i}`)}</h4>);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={i} className="report-h2">{renderInline(line.slice(3), `h3-${i}`)}</h3>);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={i} className="report-h1">{renderInline(line.slice(2), `h2-${i}`)}</h2>);
    } else if (/^(---|\*\*\*|___)\s*$/.test(line.trim()) && line.trim().length >= 3) {
      flushList();
      elements.push(<hr key={i} className="report-hr" />);
    } else if (line.match(/^[-*] /)) {
      if (listType === "ol") flushList();
      listType = "ul";
      listItems.push(<li key={i}>{renderInline(line.slice(2), `li-${i}`)}</li>);
    } else if (orderedMatch) {
      if (listType === "ul") flushList();
      listType = "ol";
      listItems.push(<li key={i}>{renderInline(orderedMatch[2], `li-${i}`)}</li>);
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
