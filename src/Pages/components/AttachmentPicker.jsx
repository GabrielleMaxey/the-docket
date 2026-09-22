import React from "react";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_DEFAULT_MAX_MB,
  ATTACHMENT_MAX_COUNT,
  attachmentExtension,
  formatBytes,
  validateAttachmentSelection,
} from "../../../shared/attachmentLimits.mjs";

const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

const kindLabel = (name) => {
  const ext = attachmentExtension(name);
  if (IMAGE_EXTENSIONS.has(ext) || ext === ".heic") return "Image";
  if (VIDEO_EXTENSIONS.has(ext)) return "Video";
  return ext ? ext.slice(1).toUpperCase() : "File";
};

const styles = {
  drop: (active, disabled) => ({
    border: `1.5px dashed ${active ? "#0c93d9" : "#cbd5e1"}`,
    background: active ? "rgba(12, 147, 217, 0.06)" : "transparent",
    borderRadius: "8px",
    padding: "0.75rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    opacity: disabled ? 0.55 : 1,
  }),
  hint: { fontSize: "0.8rem", color: "#64748b", margin: 0 },
  addBtn: {
    background: "#fff",
    color: "#0c93d9",
    border: "1px solid #0c93d9",
    borderRadius: "6px",
    padding: "0.35em 0.85em",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  list: { listStyle: "none", margin: "0.5rem 0 0", padding: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: "40px 1fr auto auto",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.3rem 0",
    borderBottom: "1px solid #f1f5f9",
  },
  thumb: {
    width: 40,
    height: 30,
    borderRadius: 4,
    objectFit: "cover",
    background: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.62rem",
    fontWeight: 700,
    color: "#475569",
  },
  name: { fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  size: { fontSize: "0.78rem", color: "#64748b" },
  remove: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: "1.1rem",
    lineHeight: 1,
    cursor: "pointer",
    padding: "0 0.25rem",
  },
  errors: { fontSize: "0.8rem", color: "#b91c1c", margin: "0.4rem 0 0", paddingLeft: "1rem" },
  progressTrack: { height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: "0.5rem", overflow: "hidden" },
};

/**
 * Controlled file picker for Jira attachments: click or drop to add, × to remove.
 * Image files get a thumbnail so a screenshot is recognizable before upload.
 */
const AttachmentPicker = ({
  files,
  onChange,
  disabled = false,
  maxMb = ATTACHMENT_DEFAULT_MAX_MB,
  maxCount = ATTACHMENT_MAX_COUNT,
  progress = null,
}) => {
  const inputRef = React.useRef(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [previews, setPreviews] = React.useState({});

  // Object URLs for image thumbnails; revoked when a file leaves the list or on unmount.
  React.useEffect(() => {
    const next = {};
    for (const file of files) {
      if (IMAGE_EXTENSIONS.has(attachmentExtension(file.name))) {
        next[`${file.name}:${file.size}`] = URL.createObjectURL(file);
      }
    }
    setPreviews(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const addFiles = (incoming) => {
    const { accepted, errors: nextErrors } = validateAttachmentSelection(
      Array.from(incoming || []),
      files,
      { maxCount, maxMb }
    );
    setErrors(nextErrors);
    if (accepted.length > 0) {
      onChange([...files, ...accepted]);
    }
  };

  const removeAt = (index) => {
    setErrors([]);
    onChange(files.filter((_file, i) => i !== index));
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    if (!disabled) addFiles(event.dataTransfer.files);
  };

  const uploading = typeof progress === "number";

  return (
    <div>
      <div
        style={styles.drop(dragActive, disabled)}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <p style={styles.hint}>
          Drop screenshots, recordings, or files here. Up to {maxCount} files, {maxMb} MB each.
        </p>
        <button
          type="button"
          style={styles.addBtn}
          disabled={disabled || files.length >= maxCount}
          onClick={() => inputRef.current?.click()}
        >
          Add files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          style={{ display: "none" }}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = ""; // allow re-picking the same file after removing it
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul style={styles.list}>
          {files.map((file, index) => {
            const preview = previews[`${file.name}:${file.size}`];
            return (
              <li key={`${file.name}:${file.size}`} style={styles.row}>
                {preview ? (
                  <img src={preview} alt="" style={styles.thumb} />
                ) : (
                  <span style={styles.thumb}>{kindLabel(file.name)}</span>
                )}
                <span style={styles.name} title={file.name}>{file.name}</span>
                <span style={styles.size}>{formatBytes(file.size)}</span>
                <button
                  type="button"
                  style={styles.remove}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {uploading ? (
        <div style={styles.progressTrack} role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <div
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: "100%",
              background: "#0c93d9",
              transition: "width 0.2s linear",
            }}
          />
        </div>
      ) : null}

      {errors.length > 0 ? (
        <ul style={styles.errors}>
          {errors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export default AttachmentPicker;
