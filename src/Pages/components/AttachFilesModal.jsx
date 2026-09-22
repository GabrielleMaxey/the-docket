import React from "react";
import { Button, Message, Modal } from "semantic-ui-react";
import AttachmentPicker from "./AttachmentPicker";
import {
  fetchAttachmentLimits,
  fetchIssueAttachments,
  uploadIssueAttachments,
} from "../../services/jiraClient";
import {
  ATTACHMENT_DEFAULT_MAX_MB,
  ATTACHMENT_MAX_COUNT,
  formatBytes,
} from "../../../shared/attachmentLimits.mjs";

/** Server-configured limits (ATTACHMENT_MAX_MB), falling back to the shared defaults. */
export const useAttachmentLimits = (enabled) => {
  const [limits, setLimits] = React.useState({
    maxMb: ATTACHMENT_DEFAULT_MAX_MB,
    maxCount: ATTACHMENT_MAX_COUNT,
  });
  React.useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchAttachmentLimits()
      .then((data) => {
        if (!cancelled && data?.maxMb) {
          setLimits({ maxMb: Number(data.maxMb), maxCount: Number(data.maxCount) || ATTACHMENT_MAX_COUNT });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return limits;
};

const AttachFilesModal = ({ issueKey, issueSummary = "", browseUrl = "", open, onClose }) => {
  const [files, setFiles] = React.useState([]);
  const [existing, setExisting] = React.useState([]);
  const [loadingExisting, setLoadingExisting] = React.useState(false);
  const [existingError, setExistingError] = React.useState("");
  const [progress, setProgress] = React.useState(null);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);
  const limits = useAttachmentLimits(open);

  const loadExisting = React.useCallback(async () => {
    if (!issueKey) return;
    setLoadingExisting(true);
    setExistingError("");
    try {
      const data = await fetchIssueAttachments(issueKey);
      setExisting(Array.isArray(data?.attachments) ? data.attachments : []);
    } catch (loadError) {
      setExistingError(loadError instanceof Error ? loadError.message : "Could not load attachments");
    } finally {
      setLoadingExisting(false);
    }
  }, [issueKey]);

  React.useEffect(() => {
    if (!open) return;
    setFiles([]);
    setError("");
    setResult(null);
    setProgress(null);
    void loadExisting();
  }, [open, loadExisting]);

  const uploading = progress !== null;

  const handleUpload = async () => {
    setError("");
    setResult(null);
    setProgress(0);
    try {
      const data = await uploadIssueAttachments(issueKey, files, { onProgress: setProgress });
      setResult(data);
      // Keep only the files that failed so they can be retried or removed.
      const failedNames = new Set((data?.failed || []).map((item) => item.filename));
      setFiles((prev) => prev.filter((file) => failedNames.has(file.name)));
      void loadExisting();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Attachment upload failed");
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal open={open} onClose={uploading ? undefined : onClose} size="small">
      <Modal.Header>
        Attach files to {issueKey}
        {issueSummary ? (
          <div style={{ fontSize: "0.85rem", fontWeight: 400, color: "#64748b", marginTop: "0.2rem" }}>
            {issueSummary}
          </div>
        ) : null}
      </Modal.Header>
      <Modal.Content>
        {error ? <Message negative size="small">{error}</Message> : null}
        {result?.uploaded?.length ? (
          <Message positive size="small">
            Attached {result.uploaded.length} file{result.uploaded.length === 1 ? "" : "s"} to {issueKey}.
            {result.failed?.length ? (
              <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem", color: "#991b1b" }}>
                {result.failed.map((item) => (
                  <li key={item.filename}>{item.error}</li>
                ))}
              </ul>
            ) : null}
          </Message>
        ) : null}

        <AttachmentPicker
          files={files}
          onChange={setFiles}
          disabled={uploading}
          maxMb={limits.maxMb}
          maxCount={limits.maxCount}
          progress={progress}
        />

        <div style={{ marginTop: "1rem" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
            Already on this issue
          </div>
          {loadingExisting ? (
            <p style={{ fontSize: "0.82rem", color: "#64748b" }}>Loading…</p>
          ) : existingError ? (
            <p style={{ fontSize: "0.82rem", color: "#b91c1c" }}>{existingError}</p>
          ) : existing.length === 0 ? (
            <p style={{ fontSize: "0.82rem", color: "#64748b" }}>No attachments yet.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.82rem", maxHeight: 140, overflowY: "auto" }}>
              {existing.map((item) => (
                <li key={item.id}>
                  {item.filename} <span style={{ color: "#64748b" }}>({formatBytes(item.size)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal.Content>
      <Modal.Actions>
        {browseUrl ? (
          <a
            href={browseUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ float: "left", fontSize: "0.85rem", lineHeight: "2.4em" }}
          >
            Open {issueKey} in Jira
          </a>
        ) : null}
        <Button type="button" onClick={onClose} disabled={uploading}>
          Close
        </Button>
        <Button
          type="button"
          primary
          disabled={uploading || files.length === 0}
          onClick={handleUpload}
          style={{ backgroundColor: "#0c93d9" }}
        >
          {uploading
            ? `Uploading ${Math.round((progress || 0) * 100)}%`
            : `Attach ${files.length || ""} file${files.length === 1 ? "" : "s"}`.replace("  ", " ")}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default AttachFilesModal;
