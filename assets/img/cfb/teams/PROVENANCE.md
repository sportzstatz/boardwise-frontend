# CFB team-mark provenance

The PNG files in this directory are local display copies of the current-season
FBS team marks returned by the CollegeFootballData.com team metadata endpoint.
Their canonical source URLs, retrieval timestamp, dimensions, and SHA-256
digests are recorded in `assets/data/cfb-team-branding.json`.

The metadata and image host are documented at
<https://collegefootballdata.com/terms>. That service does not grant ownership
of third-party team marks. Each mark remains the property of its respective
school or rights holder and is used here only to identify that program. This
repository note is provenance documentation, not a grant of trademark or
copyright rights.

Run `npm run validate:cfb-branding` after any refresh. The validator fails when
the current FBS inventory and manifest diverge, a file is absent or corrupt, a
digest or dimension changes unexpectedly, or a probability color misses the
required contrast ratio.
