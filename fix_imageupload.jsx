<div>
  <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
  <div className="flex gap-2">
    <div className="relative flex-1">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <Link size={14} className="text-gray-300" />
      </div>
      <input
        className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500 bg-white"
        placeholder="Paste an image URL"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={uploading}
      />
    </div>
    <button
      type="button"
      onClick={openLibrary}
      disabled={uploading}
      aria-label="Browse media library"
      title="Browse media library"
      className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0 bg-white hover:bg-gray-50 transition disabled:opacity-50"
    >
      <Images size={14} className="text-gray-500" />
    </button>
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading}
      aria-label="Upload from device"
      title="Upload from device"
      className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0 bg-white hover:bg-gray-50 transition disabled:opacity-50"
    >
      {uploading ? (
        <Loader size={14} className="text-gray-400 animate-spin" />
      ) : (
        <Upload size={14} className="text-gray-500" />
      )}
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFileSelect}
    />
    <div
      className="w-10 h-10 rounded-lg border border-dashed border-gray-200 flex items-center justify-center flex-shrink-0 bg-gray-50 overflow-hidden"
      style={value ? { borderStyle: 'solid', borderColor: PRIMARY } : {}}
    >
      {value ? (
        <img src={value} alt="" className="w-full h-full object-cover" />
      ) : (
        <Image size={14} className="text-gray-300" />
      )}
    </div>
  </div>
  {error ? (
    <p className="text-xs text-red-500 mt-1">{error}</p>
  ) : hint ? (
    <p className="text-xs text-gray-400 italic mt-1">{hint}</p>
  ) : null}

  {libraryOpen && (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) setLibraryOpen(false) }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-900">Media Library</span>
          <button onClick={() => setLibraryOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600 p-1 -m-1">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {libraryLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <Loader size={14} className="animate-spin" /> Loading...
            </div>
          ) : libraryError ? (
            <p className="text-xs text-red-500 text-center py-8">{libraryError}</p>
          ) : libraryItems.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No images uploaded yet — use "Upload from device" first.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {libraryItems.map(item => (
                <div key={item.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => selectFromLibrary(item)}
                    className="w-full aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-500 transition"
                  >
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteFromLibrary(item)}
                    disabled={deletingId === item.id}
                    aria-label="Delete from library"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition disabled:opacity-60"
                  >
                    {deletingId === item.id ? <Loader size={11} className="animate-spin text-gray-500" /> : <Trash2 size={11} className="text-red-500" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )}
</div>
}
