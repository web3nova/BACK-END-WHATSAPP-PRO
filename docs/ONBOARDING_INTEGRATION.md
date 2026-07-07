# Onboarding — Frontend Integration Guide

## Base URL

```
http://localhost:4000/api/v1
```

## Headers

All requests require the JWT access token:

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

## Endpoints

### 1. Check Onboarding Status — `GET /onboarding/status`

Used on page load to determine if the user has already onboarded.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "steps": {
      "account": true,
      "business": false,
      "whatsapp": false,
      "subscription": false
    },
    "nextStep": "business",
    "completed": false,
    "subscription": null,
    "overriddenSteps": []
  }
}
```

→ If `data.completed === true` or `data.steps.business === true`, navigate away (e.g. to `/business-profile`).

---

### 2. Create Business Profile — `POST /onboarding`

Send the full wizard payload. `businessName`, `phone`, and `location` are required. All other fields (including `cacRegNo` and `taxId`) are optional.

**Request body:**
```json
{
  "businessName": "Chukwu Logistics Ltd",
  "phone": "+234 801 234 5678",
  "locationState": "Lagos",
  "locationCity": "Ikeja",
  "location": "Ikeja, Lagos",
  "countryIso2": "NG",

  "cacRegNo": "RC 1234567",
  "taxId": "1234567-0001",

  "numClients": 120,
  "numStaff": 8,
  "avgMonthlyIncome": 500000,
  "deliveryStructure": "self",

  "instagram": "yourbusiness",
  "twitter": "yourbusiness",
  "facebook": "facebook.com/yourbusiness",
  "tiktok": "yourbusiness",
  "availableDays": ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "openTime": "08:00",
  "closeTime": "18:00"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "business": { ... },
    "panelsCompleted": ["identity"],
    "allPanelsDone": false
  }
}
```

**Error (400)** — missing required fields:
```json
{
  "success": false,
  "error": "..."
}
```

---

### 3. Get Existing Profile — `GET /onboarding`

Return the current saved business data.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "business": { ... } | null,
    "panelsCompleted": ["identity", "compliance"],
    "allPanelsDone": false
  }
}
```

---

### 4. Update Profile — `PUT /onboarding`

Send only the fields you want to change. Every field is optional.

**Example — update only the delivery structure and hours:**
```json
{
  "deliveryStructure": "third-party",
  "openTime": "09:00",
  "closeTime": "17:00"
}
```

**Response (200):** same shape as POST.

---

## Field Mapping

| Frontend field      | DB column           | Required |
|---------------------|---------------------|----------|
| `businessName`      | `displayName`       | Yes      |
| `phone`             | `phone`             | Yes      |
| `location`          | `location`          | Yes      |
| `locationState`     | `settings.locationState` | No   |
| `locationCity`      | `settings.locationCity`  | No   |
| `countryIso2`       | `settings.countryIso2`   | No   |
| `cacRegNo`          | `cacNumber`         | No       |
| `taxId`             | `tin`               | No       |
| `numClients`        | `activeClients`     | No       |
| `numStaff`          | `staffCount`        | No       |
| `avgMonthlyIncome`  | `monthlyRevenue`    | No       |
| `deliveryStructure` | `deliveryStructure` | No       |
| `instagram`         | `instagram`         | No       |
| `twitter`           | `twitter`           | No       |
| `facebook`          | `facebook`          | No       |
| `tiktok`            | `tiktok`            | No       |
| `availableDays`     | `availableDays`     | No       |
| `openTime`          | `openingTime`       | No       |
| `closeTime`         | `closingTime`       | No       |

---

## Error Handling

All errors return:

```json
{
  "success": false,
  "error": "Human-readable message"
}
```

Common HTTP status codes: `400` (validation), `401` (bad/expired token), `500` (server error).
