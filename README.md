# bsky-verified-account-tracker

[Follow Account on Bluesky](https://bsky.app/profile/did:plc:k3lft27u2pjqp2ptidkne7xr)

To install dependencies:

```bash
pnpm install
```

Environment Variables

```env
BSKY_USERNAME=username.bsky.social
BSKY_PASSWORD=whatever
```

optional:

```env
BSKY_PDS=https://your.pds.here
```

To run:

```bash
pnpm build && pnpm start
```

## Backfilling Verification Records

To backfill historical verification records from all verifiers into the database:

```bash
pnpm backfill
```

This script will:

- Fetch all verification records from each verifier's repository
- Check for backlinks (for non-Bluesky verifiers)
- Skip already recorded verifications
- Add new records to the database
- Show progress and summary statistics

The script processes records in batches with rate limiting to avoid API limits.

For manual cursor backfilling in the main bot:

You can start the cursor at `1745254303985050`, that's around the time verification records start getting spit out.
