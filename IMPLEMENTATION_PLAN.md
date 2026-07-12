# Image Upload System Implementation Plan

## Summary
This plan outlines a clear implementation for the image upload system where images are stored in the backend and fetched from the backend for the `/dashboard/website` gallery section.

## Current Status
✅ **Backend**: All infrastructure ready including upload endpoints, media library, and public asset serving
✅ **Environment**: `.env` updated for local backend (http://localhost:40000/api/v1)
✅ **Frontend**: Basic infrastructure in place with modifications

## Remaining Work
Implement working integration between Gallery Section and backend upload service.

## Implementation Steps

### 1. Fix ImageUploadField Component

**File**: `src/components/ImageUploadField.jsx`

Current behavior: Automatically uploads when file is selected and calls onChange with result

The component needs to maintain backward compatibility while allowing parent control.

**Modification**: Add a `uploadOnSelect` prop (default: true for backward compatibility)

### 2. Update Gallery Section Integration

**File**: `src/pages/dashboard/Website.jsx`

Update the gallery section to properly handle the upload flow:

```javascript
// When ImageUploadField needs to upload a file
handleGalleryImageUpload = async (file) => {
  const token = getStoredAccessToken()
  if (!token) return
  
  try {
    const uploadUrl = `${API_BASE}/website/image`
    const formData = new FormData()
    formData.append('image', file)
    
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    
    if (!res.ok) throw new Error('Upload failed')
    
    const data = await res.json()
    const uploadedImage = {
      url: data.url || data.data?.url,
      storageKey: data.storageKey || data.data?.storageKey,
    }
    
    // Add to gallery
    setSectionForm(f => ({
      ...f,
      galleryImages: [...(f.galleryImages || []), uploadedImage],
      newImage: null
    }))
    
  } catch (error) {
    console.error('Upload error:', error)
    setError('Failed to upload image')
  }
}
```

### 3. Gallery Section Upload Options

Provide multiple ways to upload:

**Option 1**: From File Input
- Click "Browse Media Library" -> "Upload from device"
- File automatically uploads via `ImageUploadField.handleFileSelect`
- Result automatically added to gallery

**Option 2**: Direct Upload
- Use "Upload & add" button when an image is in `newImage`
- Bypasses `ImageUploadField` for direct control

**Option 3**: URL Paste
- Use text input to paste image URL
- Manually "Add to gallery" (local only)

### 4. Component Structure

**ImageUploadField.jsx**:
- Keep existing upload behavior for backward compatibility
- Add `uploadOnSelect` prop to control upload behavior
- Add `onUploadStart`/`onUploadComplete` callbacks for parent control

**Website.jsx Gallery Section**:
- Gallery section state: `sectionForm.galleryImages`
- Upload button: "Upload & add" for direct control
- Managed upload: Via `ImageUploadField` internal button

### 5. Testing Plan

**Test Upload Flow**:
1. Upload image from Gallery section using "Upload from device"
2. Verify image appears in `galleryImages`
3. Check image URL points to stable backend URL
4. Verify storageKey is preserved for deletion

**Test Backend Integration**:
1. Verify POST `/website/image` returns correct response
2. Check media library `/website/media` contains uploaded image
3. Verify public asset route `/assets/website-images/...` works

**Test Download Flow**:
1. Save gallery to backend (via saveSection)
2. Reload page
3. Verify gallery images are restored
4. Check images load from stable URLs

### 6. Complete File with Updated Structure

**ImageUploadField.jsx** (with new props):
```javascript
export default function ImageUploadField({
  label,
  value,
  onChange,
  hint,
  aspect,
  uploadOnSelect = true,  // NEW: Control upload behavior
  onUploadStart,         // NEW: Callbacks for external control
  onUploadComplete,
}) {
  // ... existing implementation
  
  // Modified handleFileSelect to respect uploadOnSelect
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    
    if (uploadOnSelect) {
      // Original upload behavior
      setUploading(true)
      try {
        const token = getStoredAccessToken()
        // ... upload logic
        onChange(json?.data || json)
      } catch (err) {
        // ... error handling
      } finally {
        setUploading(false)
      }
    } else {
      // Just pass file to parent for external upload
      onUploadStart?.(file)
      // Parent must call onUploadComplete with result
    }
  }
}
```

**Website.jsx Gallery Section**: (with direct upload option)

```javascript
// Direct upload button implementation
const handleDirectUpload = async () => {
  if (!sectionForm.newImage?.url) return
  const token = getStoredAccessToken()
  if (!token) return
  
  // ... upload logic as above
}
```

### 7. Files Modified

1. **src/components/ImageUploadField.jsx**
   - Add `uploadOnSelect` prop
   - Add callback props for external control

2. **src/pages/dashboard/Website.jsx**
   - Update gallery section with proper upload integration
   - Add direct upload option
   - Ensure proper state management

### 8. Available Endpoints for Testing

```bash
# Test upload endpoint
curl -X POST http://localhost:40000/api/v1/website/image \
  -H "Authorization: Bearer <token>" \
  -F "image=@path/to/image.jpg"

# Test media library
curl "http://localhost:40000/api/v1/website/media?limit=10"

# Test public asset (must be backend-redirect route)
# GET /assets/website-images/...
```

## Ready to Implement

The implementation is straightforward:
1. Modify `ImageUploadField` for flexible upload behavior
2. Update Gallery section to integrate with backend upload service
3. Add direct upload option for better user control
4. Test complete upload workflow

The backend already has all the infrastructure needed; we just need to properly integrate it with the frontend.

## Next Steps

1. Implement the file modifications above
2. Test the upload flow end-to-end
3. Verify images are stored and fetchable from backend
4. Ensure the gallery section properly saves and restores uploads
5. Test public asset serving works correctly