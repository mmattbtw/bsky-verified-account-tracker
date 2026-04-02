import { execSync } from "node:child_process";

export const CONSTELLATION_BASE_URL = "https://constellation.microcosm.blue";

const GIT_COMMIT =
  process.env.GIT_COMMIT?.trim() ||
  (() => {
    try {
      return execSync("git rev-parse HEAD", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "unknown";
    }
  })();

export const CONSTELLATION_USER_AGENT =
  `bsky-verified-account-tracker/${GIT_COMMIT}`;

export async function fetchConstellation(
  path: string,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const url = new URL(path, CONSTELLATION_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return fetch(url.toString(), {
    headers: {
      "user-agent": CONSTELLATION_USER_AGENT,
    },
  });
}

export async function fetchConstellationJson<T>(
  path: string,
  params: Record<string, string | undefined>,
): Promise<T> {
  const response = await fetchConstellation(path, params);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${response.url}`);
  }

  return (await response.json()) as T;
}
