# Repository maintenance instructions

## Canonical target

This project lives at **https://github.com/furqunali/ops-pilot-agent**. The same URL is recorded in [`REPOSITORY_URL.txt`](REPOSITORY_URL.txt).

When a coding CLI or automation agent is asked to continue work on this project:

1. Confirm the current checkout is this repository by checking its Git remote against `https://github.com/furqunali/ops-pilot-agent`.
2. If the remote is different or unavailable, stop instead of modifying another repository.
3. Work on a focused feature or documentation branch; do not commit directly to `main`.
4. Add or update regression tests for behavior changes and run `npm test`.
5. Open a pull request and wait for CI on the exact PR head to finish successfully.
6. Merge only after the green result and GitHub's merge confirmation. If checks fail or cannot be verified, report that honestly and leave the PR open.
7. Keep payment behavior simulation-only; never introduce real-money execution without explicit product/security review.
8. Prefer fixing the next real product or reliability gap over adding commits merely to increase activity.
