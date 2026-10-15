import React from "react";
import { Button, Modal } from "semantic-ui-react";

const ACCEPT_TYPES =
  "image/png,image/jpeg,image/gif,image/webp,text/plain,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/vnd.ms-excel,.txt,.md,.pdf,.doc,.docx,.xlsx,.csv";

const formatByteSize = (byteSize) => `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;

const NoteImagesStrip = ({
  children,
  images,
  disabled,
  error,
  onAddFiles,
  onRemove,
  keepOnMachine,
  keepPending,
  onKeepChange,
}) => {
  const fileInputRef = React.useRef(null);
  const [preview, setPreview] = React.useState(null);

  const addFiles = (files) => {
    if (!disabled && files?.length > 0) {
      onAddFiles(files);
    }
  };

  const handleFileChange = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const handlePaste = (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    addFiles(event.dataTransfer?.files);
  };

  return (
    <div
      className="ww-note-images-strip"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      {children}
      <div className="ww-note-images-list">
        {(images || []).map((image) => {
          const isImage = (image.mimeType || image.type || "").startsWith("image/");

          return (
            <div className="ww-note-image-thumb" key={image.localId}>
              {isImage ? (
                <>
                  <a href={image.previewUrl} onClick={(event) => { event.preventDefault(); setPreview(image); }} title={`Preview ${image.filename}`}>
                    <img src={image.previewUrl} alt={image.filename} />
                  </a>
                  <span>{formatByteSize(image.byteSize)}</span>
                </>
              ) : (
                <a
                  className="ww-note-file-chip"
                  href={image.previewUrl}
                  onClick={(event) => { event.preventDefault(); setPreview(image); }}
                  title={image.filename}
                >
                  <span className="ww-note-file-chip-name">{image.filename}</span>
                  <span>{formatByteSize(image.byteSize)}</span>
                </a>
              )}
              <button
                type="button"
                className="ww-note-image-remove"
                onClick={() => onRemove(image.localId)}
                disabled={disabled}
                aria-label={`Remove ${image.filename}`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <input
        ref={fileInputRef}
        className="ww-note-image-input"
        type="file"
        accept={ACCEPT_TYPES}
        multiple
        onChange={handleFileChange}
        disabled={disabled}
      />
      <button
        type="button"
        className="ww-note-image-add"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        Add file
      </button>
      {onKeepChange ? (
        <label className="ww-note-image-keep">
          <input
            type="checkbox"
            checked={Boolean(keepOnMachine)}
            onChange={(event) => onKeepChange(event.target.checked)}
            disabled={disabled || keepPending}
          />
          Keep on this machine
        </label>
      ) : null}
      {error ? <p className="ww-inline-error">{error}</p> : null}
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} size="large">
        <Modal.Header>{preview?.filename}</Modal.Header>
        <Modal.Content scrolling>
          {(preview?.mimeType || preview?.type || "").startsWith("image/") ? (
            <img src={preview.previewUrl} alt={preview.filename} style={{ maxWidth: "100%" }} />
          ) : preview ? (
            <>
              <iframe src={preview.previewUrl} title={preview.filename} sandbox="" style={{ width: "100%", height: "60vh", border: 0 }} />
              <p>If this file cannot be previewed, download it to open it.</p>
            </>
          ) : null}
        </Modal.Content>
        <Modal.Actions>
          <Button as="a" href={preview?.previewUrl} download={preview?.filename}>Download</Button>
          <Button onClick={() => setPreview(null)}>Close</Button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default NoteImagesStrip;
