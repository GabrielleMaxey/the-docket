const renderInline = (text, keyPrefix) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyPrefix}-b-${i}`}>{part}</strong> : part
  );

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
