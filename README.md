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

For backfilling:

You can start the cursor at `1745254303985050`, that's around the time verification records start getting spit out.
