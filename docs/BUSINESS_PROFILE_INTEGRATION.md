# Business Profile — Frontend Integration Guide

`BusinessProfilePage.jsx` uses two endpoints. Update your code to:

## 1. Create/Update Profile — `POST /api/v1/business`

```js
const payload = {
  displayName: 'Ada\'s Fashion House',  // required
  category: 'fashion',                  // optional — enum
  categoryOther: 'Event Planning',      // optional — only when category === 'others'
  tagline: 'Custom Made & Ready To Wear Fashion', // optional
  description: 'We design high-quality bespoke clothing.', // optional
  email: 'hello@adasfashion.com',       // optional
  whatsappNumber: '+2348012345678',     // optional
}
```

- If the business exists → updates it
- If it doesn't → creates it
- Returns `201` on creation, `200` on update (currently always `201`)

## 2. Upload Logo — `POST /api/v1/business/logo`

Send `multipart/form-data` with field `image`:

```js
const formData = new FormData()
formData.append('image', logoFile)

await fetch(`${API_BASE}/business/logo`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
})
```

Accepts: `jpeg`, `png`, `webp`, `gif` — max 5 MB.

## 3. Get Profile — `GET /api/v1/business`

Returns the full business row. Use on page load to pre-fill the form.

## Allowed Categories

```
fashion, beauty, food, electronics, home, health, services, others
```

## Swagger

All endpoints are documented at `/api/v1/docs` under the **Business** tag.
