/**
 * Onboarding & Business Profile API Service
 *
 * Usage:
 *   import onboardingApi from './onboardingService';
 *
 *   // 1. Check if user needs onboarding
 *   const { needsOnboarding, currentStep } = await onboardingApi.checkStatus();
 *
 *   // 2. Submit wizard data
 *   await onboardingApi.submitWizard({
 *     businessName: "Chukwu Logistics",
 *     phone: "+234 801 234 5678",
 *     location: "Ikeja, Lagos",
 *     ...
 *   });
 *
 *   // 3. Submit business profile
 *   await onboardingApi.submitProfile({
 *     displayName: "Chukwu Logistics",
 *     category: "logistics",
 *     tagline: "Fast & reliable delivery",
 *     ...
 *   });
 *
 *   // 4. Upload logo
 *   await onboardingApi.uploadLogo(file);
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

class OnboardingApiError extends Error {
  constructor(message, status, fieldErrors) {
    super(message);
    this.name = 'OnboardingApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request(method, path, options = {}) {
  const token = options.token || getToken();
  const { body, formData } = options;

  const headers = { accept: 'application/json' };
  if (!formData) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 || res.status === 403) {
    clearAuth();
    throw new OnboardingApiError('Session expired. Please sign in again.', res.status);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed (${res.status})`;
    const fieldErrors = data?.errors?.fieldErrors || data?.details?.fieldErrors;
    throw new OnboardingApiError(message, res.status, fieldErrors);
  }

  return data?.data ?? data;
}

function getToken() {
  const stored = localStorage.getItem('accessToken');
  if (stored) return stored;
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user?.accessToken || user?.token || null;
  } catch {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  localStorage.removeItem('refreshToken');
}

const onboardingApi = {

  /** Check onboarding status → returns { completed, steps, nextStep } */
  async checkStatus(token) {
    return request('GET', '/onboarding/status', { token });
  },

  /** Submit the full onboarding wizard (business identity, compliance, operations, presence) */
  async submitWizard(data, token) {
    return request('POST', '/onboarding', { body: data, token });
  },

  /** Fetch saved wizard data */
  async getWizard(token) {
    return request('GET', '/onboarding', { token });
  },

  /** Update wizard data (partial) */
  async updateWizard(data, token) {
    return request('PUT', '/onboarding', { body: data, token });
  },

  // ── Business profile ──────────────────────────────────────────────

  /** Create or update the business profile */
  async submitProfile(data, token) {
    return request('POST', '/business', { body: data, token });
  },

  /** Fetch the current business profile */
  async getProfile(token) {
    return request('GET', '/business', { token });
  },

  /** Upload business logo (accepts a File object) */
  async uploadLogo(file, token) {
    const formData = new FormData();
    formData.append('image', file);
    return request('POST', '/business/logo', { formData, token });
  },

  // ── Convenience: run full flow ────────────────────────────────────

  /**
   * Complete flow: checks status, submits wizard if needed,
   * submits business profile, uploads logo.
   * Returns { wizardResult, profileResult, logoResult }
   */
  async completeOnboarding({ wizardData, profileData, logoFile, token } = {}) {
    let wizardResult, profileResult, logoResult;

    if (wizardData) {
      wizardResult = await this.submitWizard(wizardData, token);
    }

    if (profileData) {
      profileResult = await this.submitProfile(profileData, token);
    }

    if (logoFile) {
      logoResult = await this.uploadLogo(logoFile, token);
    }

    return { wizardResult, profileResult, logoResult };
  },
};

export default onboardingApi;
export { OnboardingApiError };
