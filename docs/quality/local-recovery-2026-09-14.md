# Local Recovery Drill — 2026-09-14

The local Blog database and media volume were backed up and restored into a
network-isolated PostgreSQL container using `scripts/check-local-recovery.py`.

- Source: `sso-blog-db` and `sso-blog-backend`
- Result: passed
- Restored: 12 posts, 33 post versions, 18 media assets, 18 media files
- Database table content hashes and media file content hashes matched
- Elapsed time: 2.68 seconds
- Credentials decryption: not verified; key material remains separately controlled
- Production source: not confirmed; this was a local environment drill

The generated dump and media archives remain outside the repository under an
owner-only temporary directory. No application, scheduler, external delivery,
or model provider was started by the drill.
