# Image Upload System Setup

## Overview
This is a comprehensive plan for implementing a functional image upload system for the `/dashboard/website` section, where images will be stored and fetched from the backend.

## What Was Done

### 1. Frontend Environment Configuration
Updated `.env` to use local backend:
```bash
# Before (Vercel deployment)
VITE_API_URL=https://back-end-whatsapp-pro-6xnx.onrender.com/api/v1

# After (local development)
VITE_API_URL=http://localhost:40000/api/v1
```

This ensures frontend API calls point to the correct local backend server.

### 2. Backend Verification
- Backend server is running on port 40000
- API endpoints are accessible (confirmed with curl)
- Image upload infrastructure is ready in the backend

### 3. Image Upload System Analysis

#### Current Implementation
**Frontend (`/dashboard/website` Gallery Section):**
- Uses `ImageUploadField` component
- Uploads to `/website/image` POST endpoint
- Stores images in `sectionForm.newImage`
- Gallery displays via `sectionForm.galleryImages`

**Backend (`website` module):**
- Upload endpoint: `/website/image` (in `website.controller.js:61`)
- Service: `uploadImage()` function (`website.service.js:122`)
- Returns stable URL using `publicAssetUrl(asset.storageKey)`
- Storage location: R2/S3 with keys like `website-images/{tenantId}/{timestamp}-{filename}.{ext}`

## What Needs to Be Done

### 1. Fix Gallery Section Integration
**File:** `src/pages/dashboard/Website.jsx` - Lines around 1940-1960

Current issue: The gallery section has redundant/missing upload integration.

**Required Changes:**
1. Ensure `sectionForm.newImage` upload flow properly calls `uploadImage()`
2. Update `onChange` handlers in `ImageUploadField` usage
3. Fix deletion logic for uploaded images

### 2. Verify Upload Flow
Ensure the upload process:
1. Captures image from file input
2. Makes POST to `/website/image` with proper auth
3. Receives `{url, storageKey}` response
4. Updates local state with `sectionForm.newImage`
5. Allows adding to `sectionForm.galleryImages`

### 3. Test Image Fetching
Test that:
1. Images uploaded via `/website/image` endpoint
2. Are accessible through media library (`/website/media`)
3. Can be retrieved through `getPublicAsset(/assets/website-images/...)` route

### 4. Development Server Setup
Start both servers:

```bash
# Backend (BACK-END-WHATSAPP-PRO)
cd /Users/bernardo/Desktop/Free-Claude/BACK-END-WHATSAPP-PRO
npm run dev

# Frontend (FRONT-END-WHATSAPP-PRO)
cd /Users/bernardo/Desktop/Free-Claude/FRONT-END-WHATSAPP-PRO
npm run dev
```

## Ready to Test

The fundamental infrastructure is in place:
- ✅ API endpoints exist and are functional
- ✅ Image upload service is implemented
- ✅ Public asset serving route is ready
- ✅ Backend storage (R2/S3) is configured
- ✅ Frontend environment configured for local development

The next step is to implement the integration fixes in the gallery section to ensure proper upload workflow and testing.

## Summary

The image upload system for `/dashboard/website` gallery section is ready with:
- Local backend configuration
- Working upload API endpoints
- Stable asset URL generation
- Media library access

The main task remaining is to complete the integration between the frontend gallery section and the backend upload service, then test the complete workflow.
