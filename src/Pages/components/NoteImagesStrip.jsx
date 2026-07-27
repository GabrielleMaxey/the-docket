import React from "react";

const IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

const formatByteSize = (byteSize) => `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;

const NoteImagesStrip = ({ children, images, disabled, error, onAddFiles, onRemove }) => {
  const fileInputRef = React.useRef(null);

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
        {(images || []).map((image) => (
          <div className="ww-note-image-thumb" key={image.localId}>
            <a href={image.previewUrl} target="_blank" rel="noreferrer" title={`Preview ${image.filename}`}>
              <img src={image.previewUrl} alt={image.filename} />
            </a>
            <button
              type="button"
              className="ww-note-image-remove"
              onClick={() => onRemove(image.localId)}
              disabled={disabled}
              aria-label={`Remove ${image.filename}`}
            >
              ×
            </button>
            <span>{formatByteSize(image.byteSize)}</span>
          </div>
        ))}
      </div>
      <input
        ref={fileInputRef}
        className="ww-note-image-input"
        type="file"
        accept={IMAGE_TYPES}
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
        Add image
      </button>
      {error ? <p className="ww-inline-error">{error}</p> : null}
    </div>
  );
};

export default NoteImagesStrip;
