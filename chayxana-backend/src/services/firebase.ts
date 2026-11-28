import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

export const EXPECTED_FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || "cayxana-9dc39";

export interface AuthUser {
  uid: string;
  name?: string;
  isAnonymous?: boolean;
}

export type TokenVerifier = (
  token: string,
  options?: Record<string, unknown>
) => Promise<AuthUser>;

let firebaseApp: App | null = null;
let customVerifier: TokenVerifier | null = null;

/**
 * Firebase Admin SDK tətbiqini inisializasiya edir (singleton).
 * Service account məlumatları:
 * 1. FIREBASE_SERVICE_ACCOUNT_JSON (JSON string və ya Base64)
 * 2. GOOGLE_APPLICATION_CREDENTIALS (fayl yolu) / Google Cloud ADC
 *
 * Layihə ID-si mütləq cayxana-9dc39 ilə uyğun olmalıdır.
 */
export function getFirebaseApp(): App {
  if (firebaseApp) return firebaseApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    const existing = existingApps[0];
    if (
      existing.options.projectId &&
      existing.options.projectId !== EXPECTED_FIREBASE_PROJECT_ID
    ) {
      throw new Error(
        `Firebase project mismatch: expected ${EXPECTED_FIREBASE_PROJECT_ID}`
      );
    }
    firebaseApp = existing;
    return firebaseApp;
  }

  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (rawCredentials && rawCredentials.trim().length > 0) {
    let parsed: Record<string, unknown>;
    try {
      const trimmed = rawCredentials.trim();
      parsed = trimmed.startsWith("{")
        ? JSON.parse(trimmed)
        : JSON.parse(Buffer.from(trimmed, "base64").toString("utf-8"));
    } catch {
      throw new Error(
        "Invalid FIREBASE_SERVICE_ACCOUNT_JSON configuration: failed to parse JSON"
      );
    }

    if (parsed.project_id !== EXPECTED_FIREBASE_PROJECT_ID) {
      throw new Error(
        `Firebase project mismatch: expected ${EXPECTED_FIREBASE_PROJECT_ID}`
      );
    }

    firebaseApp = initializeApp({
      credential: cert(parsed),
      projectId: EXPECTED_FIREBASE_PROJECT_ID,
    });
    console.log(
      `Firebase Admin initialized for project ${EXPECTED_FIREBASE_PROJECT_ID}`
    );
    return firebaseApp;
  }

  // GOOGLE_APPLICATION_CREDENTIALS və ya Google Cloud ADC
  firebaseApp = initializeApp({
    projectId: EXPECTED_FIREBASE_PROJECT_ID,
  });
  console.log(
    `Firebase Admin initialized via ADC for project ${EXPECTED_FIREBASE_PROJECT_ID}`
  );
  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

/**
 * Real Firebase ID token-i yoxlayır.
 * Token-in imzasını, vaxtını və cayxana-9dc39 layihə identifikasiyasını təsdiq edir.
 */
export async function verifyFirebaseIdToken(token: string): Promise<AuthUser> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Missing or invalid authentication token");
  }

  const auth = getFirebaseAuth();
  const decoded = await auth.verifyIdToken(token);

  if (decoded.aud !== EXPECTED_FIREBASE_PROJECT_ID) {
    throw new Error("Token does not belong to expected Firebase project");
  }

  const isAnonymous =
    decoded.firebase?.sign_in_provider === "anonymous";

  return {
    uid: decoded.uid,
    name:
      decoded.name ||
      (isAnonymous ? "Qonaq" : undefined),
    isAnonymous,
  };
}

/**
 * Test mühitlərində təhlükəsiz mock verifier təyin etmək üçün istifadə olunur.
 * Production mühitində null olmalıdır.
 */
export function setTokenVerifier(verifier: TokenVerifier | null): void {
  customVerifier = verifier;
}

export function getTokenVerifier(): TokenVerifier | null {
  return customVerifier;
}

/**
 * Token-i təsdiqləyir:
 * - Əgər testlər üçün xüsusi verifier təyin edilibsə, onu çağırır.
 * - Əks halda (production) birbaşa real verifyFirebaseIdToken işə düşür.
 */
export async function verifyToken(
  token: string | undefined,
  options?: Record<string, unknown>
): Promise<AuthUser> {
  if (customVerifier) {
    return customVerifier(token ?? "", options);
  }

  if (!token || typeof token !== "string") {
    throw new Error("Authentication token is required");
  }

  return verifyFirebaseIdToken(token);
}
