export const BLACKLISTED_VERIFIER_DIDS = [
  "did:plc:aajyn6qzw67cnmwf7zxzbjdy",
] as const;

const BLACKLISTED_VERIFIER_DID_SET = new Set<string>(BLACKLISTED_VERIFIER_DIDS);

export function isBlacklistedVerifierDid(did: string): boolean {
  return BLACKLISTED_VERIFIER_DID_SET.has(did);
}
