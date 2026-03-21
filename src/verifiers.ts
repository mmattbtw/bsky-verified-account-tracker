export const BLACKLISTED_VERIFIER_DIDS = [
  "did:plc:aajyn6qzw67cnmwf7zxzbjdy",
] as const;

const BLACKLISTED_VERIFIER_DID_SET = new Set<string>(BLACKLISTED_VERIFIER_DIDS);
const TRUSTED_VERIFIER_STATUS_VALID = "valid";
const trustedVerifierCache = new Map<string, boolean>();

type ProfileResponse = {
  trustedVerifierStatus?: string;
  verification?: {
    trustedVerifierStatus?: string;
  };
};

export function isBlacklistedVerifierDid(did: string): boolean {
  return BLACKLISTED_VERIFIER_DID_SET.has(did);
}

export async function isTrustedVerifierDid(did: string): Promise<boolean> {
  const cachedValue = trustedVerifierCache.get(did);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  try {
    const url = new URL(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile",
    );
    url.searchParams.set("actor", did);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const profile = (await response.json()) as ProfileResponse;
    const trustedVerifierStatus =
      profile.verification?.trustedVerifierStatus ??
      profile.trustedVerifierStatus;
    const isTrusted =
      trustedVerifierStatus === TRUSTED_VERIFIER_STATUS_VALID;

    trustedVerifierCache.set(did, isTrusted);
    return isTrusted;
  } catch (error) {
    console.error(`Failed to verify trusted verifier status for ${did}:`, error);
    trustedVerifierCache.set(did, false);
    return false;
  }
}
