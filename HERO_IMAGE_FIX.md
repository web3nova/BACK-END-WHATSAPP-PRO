# Issue: Hero Section Image Fetching from Wrong Source

## Problem
The hero section in `/dashboard/website` is incorrectly fetching the image from:
```
http://localhost:5173/assets/website-images/...
```

This should be:
```
http://localhost:40000/assets/website-images/...
```

## Root Cause
In Vite applications, static assets are served from `/assets/` path from the frontend's build distribution (`dist/assets/`). The hero section `bgImage` is being populated with frontend paths instead of backend URLs.

## Investigation
1. **Both servers running**: Frontend on port 5173, Backend on port 40000 ✅
2. **Image exists**: Can access through backend 302 redirect ✅
3. **Problem location**: Hero section `bgImage` in `Website.jsx`

## Files Modified (NEW IMAGES)

### 1. src/components/ImageUploadField.jsx
- Added `onUploadStart`/`onUploadComplete` props for controlled upload
- Enhanced upload flow for gallery sections

### 2. src/pages/dashboard/Website.jsx
- Gallery section integrated with direct backend upload
- Hero section updated with proper backend image URL handling
- Added "Upload & Add" button for direct upload control

## Expected vs Actual

### Before (Broken)
```
Frontend uploads to /api/v1/website/image
Result: URL contains /assets/...
Hero section tries to fetch from: http://localhost:5173/assets/...
❌ FAIL: 200 OK but from frontend distribution
```

### After (Fixed)
```
Frontend uploads to /api/v1/website/image  
Result: URL from backend API response
Hero section receives: http://localhost:40000/assets/...
✅ PASS: Backend redirects to S3, accessible from anywhere
```

## Backend Configuration
```javascript
// src/modules/website/website.service.js:128
return { url: publicAssetUrl(asset.storageKey), storageKey: asset.storageKey }

// src/common/utils/uploadAsset.js:78  
return `${config.appUrl}/assets/${storageKey.replaceAll('\\\\', '/')}`
```

- Config `appUrl` defaults to `http://localhost:40000` ✅
- All uploaded images get stable backend URLs

## vite.config.js and asset distribution

The hero section image handling:
1. Sets `bgImage: b.hero?.bgImage` (from settings)
2. Displays via `<img src={sectionForm.bgImage || settings?.theme?.builder?.hero?.bgImage} />`
3. Should resolve to backend URL when properly uploaded