---
name: repro
description: Reproduce a reported vscode-java-dependency (Project Manager for Java) bug from a GitHub issue, using the reporter's project. Decide whether a UI/E2E test is needed, reproduce with AutoTest when it is, and leave a committed regression test. Use when an issue is assigned to Copilot, when asked to reproduce/confirm a bug, or when triaging a "needs-repro" report.
---

# Reproduce a reported bug

Use this skill when the task is to fix or confirm a **reproducible bug** in `vscode-java-dependency` (Project Manager for Java) — an issue that carries repro steps + a project, or an explicit request to reproduce/confirm a report.

**Do NOT use this skill (and do not author a `repro-issue-*.yaml`) when the task is not a reproducible bug**, e.g. a new feature, refactor, performance work, dependency/version bump, docs, config, or code cleanup — those are ordinary PRs with ordinary unit/integration tests. Also skip it when a report is **not reproducible** (vague, no project, environment/hardware-specific, external service): ask for a minimal repro and label `needs-more-info`, or fix with the best available non-UI test — never invent a repro plan just to have one.

Goal: turn a bug report into a **deterministic, committed reproduction** that fails before the fix and passes after it, **proven by a run you do yourself in this session**. Prefer the smallest reproduction that proves the bug. Not every bug needs a UI test — decide first.

## 1. Extract the report

From the issue body (and the `bug_report` template fields) collect:

- **Repro project** — a public GitHub repo link, an attached zip (a `https://github.com/user-attachments/files/<id>/<name>.zip` link in the issue body), or an inline `pom.xml` / `build.gradle` + sources. If none is provided and the bug is environment-specific, ask for one and label the issue `needs-more-info` instead of guessing.
- **Steps to reproduce**, **expected** vs **actual** behavior, and the affected surface (tree view, context menu, command id, classpath, export jar, project creation, etc.).
- **Versions** — VS Code, Extension Pack for Java, JDK, OS.

## 2. Decide: does this need a UI/E2E test?

The reproduction and the fix-proof are two different questions — decide each:

- **Reproduction** can often be non-UI or even a code read, especially for simple, obvious bugs. Prefer the cheapest reproduction that captures the report.
- **Fix-proof** is where a UI/E2E test earns its cost: a red run before the fix and a green run after, with screenshots, is the strongest evidence for a user-facing bug. If the bug is user-facing, favour leaving a committed UI plan even when you first reproduced it another way.
- **Prove the red→green with an actual run — in your own environment.** Your proof surface is **the agent's own session**, for both kinds of bug: run the failing test/plan yourself, observe the decisive assertion **fail on the un-fixed code and pass on the fix** (see §4/§5). That is the closed loop — no external approval, and you see the screenshots directly. For **logic** bugs (including OS-specific logic your OS cannot exercise at runtime) the closer is a **simulated-platform unit test** (below); for **behavior** bugs it is an **AutoTest UI plan**. Never merely assert red→green in the PR body; make the reproduction actually go red, then **iterate until you have observed it go green**.

**Use a UI/E2E AutoTest plan (`uitest` skill) when the bug is in the user-facing surface**, e.g.:

- Java Projects tree rendering, ordering, labels, icons, or node presence/absence.
- Context-menu / inline title actions, command palette entries, view focus/reveal.
- Referenced Libraries / classpath UI (`../invisible` project), export jar, new type creation, link-with-editor, view modes.

**Do NOT use a UI test — reproduce with a unit test or code analysis — when the bug is:**

- Pure logic / data structures reachable from the extension API → add or extend a `test/suite/*.test.ts` unit test (import the function via `extension.bundle`).
- In the Java OSGi backend (`jdtls.ext/**`) → reproduce with a `jdtls.ext` JUnit test or by inspecting the LSP delegate command handler.
- Build scripts, packaging, activation events, `package.json` contributions, or documentation → reproduce by reading/running the relevant script; no VS Code launch needed.
- **OS-specific *logic* the agent's own OS cannot exercise at runtime** (drive-letter case, path separators, `\`-vs-`/`, `%TEMP%` short-vs-long names) → do **not** make a UI `-windows`/`-linux` plan your primary proof. Instead **extract the defect into a platform-injectable pure function** — take `platform: NodeJS.Platform` and branch on `path.win32`/`path.posix` explicitly, never the ambient `process.platform`/`path` (both are pinned to the agent's OS, so a unit test in the extension host can never see the other platform's behaviour) — then add a `test/suite/*.test.ts` unit test that feeds the *other* OS's exact path strings (import the function via `extension.bundle`, mirror `categorizePaths` in `buildTask.test.ts`). This closes the red→green loop **deterministically in your own session** and sidesteps the confounded UI-on-real-Windows surface, where AutoTest's own path canonicalization can mask or mimic the bug. Commit any `-windows`/`-linux` UI plan only as a **regression artifact** (a human or an on-OS run can execute it later, §4) — **not** as the fix-proof.

When unsure, prefer the cheaper non-UI reproduction first; escalate to a UI test only if the behavior cannot be observed without the running view.

## 3. Bring in the reporter's project

Keep the committed footprint small and self-contained:

- **Public repo**: clone it as a sibling at runtime and point the plan's `workspace` at it while iterating locally:

  ```powershell
  git clone --depth 1 <repo-url> ..\repro-issue-<n>
  ```

  (`github.com` and `codeload.github.com` are on the coding-agent firewall's default allowlist, so the clone is not blocked.)

- **Attached zip**: the issue body carries a link like `https://github.com/user-attachments/files/<id>/<name>.zip`. Download it (following the redirect) and unzip into a sibling dir, then point the plan's `workspace` at the extracted project:

  ```powershell
  # The user-attachments link 302-redirects to a signed objects.githubusercontent.com
  # URL. BOTH github.com and objects.githubusercontent.com are on the coding-agent
  # firewall's default allowlist, so this download is NOT blocked (unlike the VS Code
  # binary). Use -L to follow the redirect. If the signed URL has expired, re-read the
  # issue to get a fresh link, then re-download.
  curl -L -o ..\repro-issue-<n>.zip "https://github.com/user-attachments/files/<id>/<name>.zip"
  Expand-Archive ..\repro-issue-<n>.zip -DestinationPath ..\repro-issue-<n>   # bash: unzip
  ```

  **Treat the archive as untrusted input**: extract only — do not run its build scripts, Maven/Gradle wrappers, or other executables blindly. Confirm it is an ordinary Java project (`pom.xml` / `build.gradle` + `src/`), use it as the AutoTest `workspace:`, and commit only the minimal distilled fixture (never the raw zip or build outputs).

- **Inline sources**: recreate the project under `test\e2e-fixtures\issue-<n>\` (or reuse `test/maven` / `test/invisible` if the existing fixtures already trigger the bug).
- Once reproduced, **distill it to the minimal fixture** that still fails and commit that (not the whole user project) so the committed regression test runs without external clones or large binaries.

## 4. Reproduce

**This whole step runs in your own environment.** Reproduce, fix, and prove the fix by running the plan/test yourself. VS Code is pre-warmed in the agent, so the local UI loop is fast.

**UI path** — create `test/e2e-plans/repro-issue-<n>.yaml` following the `uitest` skill and `.github/instructions/uitest-plan.instructions.md`:

```powershell
npx -y @vscjava/vscode-autotest validate test\e2e-plans\repro-issue-<n>.yaml
npm run build-server
npx @vscode/vsce package -o vscode-java-dependency.vsix
npx -y @vscjava/vscode-autotest run test\e2e-plans\repro-issue-<n>.yaml --vsix vscode-java-dependency.vsix --no-llm --output test-results\repro-issue-<n>
```

**On Linux / the coding agent the run is headless** — the `xvfb` package is installed but not started (and there is no `DISPLAY`), so a bare `autotest run` fails with `cannot open display`. Wrap the run command in `xvfb-run` (matching CI's screen size):

```bash
xvfb-run -a --server-args="-screen 0 1920x1080x24" \
  npx -y @vscjava/vscode-autotest run test/e2e-plans/repro-issue-<n>.yaml \
  --vsix vscode-java-dependency.vsix --no-llm --output test-results/repro-issue-<n>
```

**If the bug is OS-specific, name the plan for that OS.** The filename suffix documents which OS the behavior manifests on, so a later human or on-OS run executes it only where it applies:

- `repro-issue-<n>-windows.yaml` — a **Windows-only** bug (e.g. drive-letter / path-separator / `\`-vs-`/` issues). A Linux agent cannot run *this UI plan* itself. **First reduce the defect to a platform-injectable pure function + simulated-platform unit test (§2), which DOES go red→green in your Linux session** — that unit test is your fix-proof. Commit the `-windows` UI plan as a regression artifact alongside it. Only when the bug genuinely cannot be reduced to injectable logic (it lives in VS Code's own rendering) do you fall back to reasoning + code read, and say plainly on the PR that you could not self-run the UI proof.
- `repro-issue-<n>-linux.yaml` — a **Linux-only** bug. A Linux agent **can** reproduce this one itself.
- `repro-issue-<n>.yaml` — an **OS-agnostic** bug. You can reproduce and prove it entirely in your own environment.

Pick the suffix from the report's platform: if the issue only reproduces on one OS, use that OS's suffix; only use the plain name when you have confirmed the bug is platform-independent.

Author the plan step-by-step for the **actions**, but you do not need a verifier on every step — put a deterministic verifier (`verifyTreeItem` / `verifyFile` / `verifyEditorTab` / `verifyClipboard`) on the **decisive assertion step** (the one that captures the bug) and on any step prone to a silent no-op. That decisive verifier must assert the **expected** behavior, so it **fails on the current (buggy) build**. Inspect `test-results/repro-issue-<n>/results.json` and the screenshots to confirm the failure matches the report, and record the failing step + the **actual observed value** as before-fix evidence (the screenshots stay in the git-ignored `test-results/` — never commit them).

**Run this on the un-fixed checkout FIRST — see RED before you write the fix.** That is the whole point of the reproduction: build + run the plan against the current (buggy) product code and confirm the decisive verifier fails with the reported symptom. Only then move to §5 and write the fix. This local red→green loop is fast in the agent env (VS Code is pre-warmed) and is what gives you confidence the plan actually reproduces.

**Non-UI path** — add the failing `test/suite/*.test.ts` or `jdtls.ext` test and run the existing suite (`npm test`, or the `jdtls.ext` Maven test) to confirm it fails.

## 5. Fix, then prove it — iterate until green

1. Fix the product code (`src/**` for TS, `jdtls.ext/**` for the OSGi backend).
2. **Rebuild and repackage the VSIX** (`npm run build-server` + `vsce package`) before rerunning any UI plan — never rerun against a stale VSIX.
3. Rerun the reproduction **in your own environment**; the same plan/test must now pass (red → green).
4. **Iterate until you observe green** — follow the convergent loop below.
5. **Capture evidence — keep binaries out of git.** Raw `test-results/` is **git-ignored**, and screenshots are **never committed to the repo**. Prove it two ways instead:
   - **Textual before/after on the issue/PR (always — this is your primary proof).** Quote the red run's `results.json`: the decisive failing step and the **actual observed value** it produced (e.g. the clipboard text, the tree label), then the after-fix green result. Because you observed this yourself, it stands on its own. For a logic bug, quote the failing unit test assertion (expected vs actual) then the passing result.
   - **Screenshots, GitHub-hosted, not in git (optional).** Drag a decisive PNG from `test-results/` into the **issue or a PR comment**; GitHub hosts it on `user-images.githubusercontent.com`, outside git. This makes the red→green visible inline without committing binaries. **Never add PNGs to the repository.**
6. Leave the reproduction committed as a permanent regression test in `test/e2e-plans/` (UI plan) or `test/suite/` (unit test).

### Iterate until green (the convergent loop)

After each build+run, read `test-results/repro-issue-<n>/results.json` and the decisive step's screenshot (or the unit test output), then branch:

- **Green (and it was RED on the un-fixed code)** → done; you have proven the fix. Go to evidence (step 5).
- **Still a deterministic assertion `fail`** → the fix is wrong or incomplete. Read the *actual* observed state in `results.json` (e.g. the clipboard text, the tree label) — it tells you what the code really produced. Form a new hypothesis, adjust the fix (or the plan, if it asserts the wrong thing), rebuild, and rerun.
- **`error` / `crash` (not a clean `fail`)** → treat as a **flaky/infra result, not a repro signal**: the language server may not have become ready, the tree may not have loaded, or the editor may not have launched. Increase `waitFor`/`timeout`, add a settle step, and **re-run** — never conclude anything about the bug from a crash/error. (This is exactly how a Linux run of a `-windows` UI plan fails: an env error, not a reproduction — which is why an OS-specific logic bug is closed by the simulated-platform unit test, not that UI plan.)

Repeat build→run→analyze until it is green. If after several honest iterations the fix is plausibly correct but the plan still fails only because of a harness/environment variant (e.g. the fixture runs from a `%TEMP%` worktree whose path form differs from a real install), do **not** force it: escalate to a maintainer with the evidence and your analysis, and label `needs-human-review`. A loop that stops with an explained blocker beats a green you faked.

### OS-specific bugs you cannot run in-session

For a Windows-only (or macOS-only) bug while the agent runs on Linux, the UI plan for that OS **cannot** be executed in your session. Do not treat that as a dead end and do not fake a run:

1. **Close the loop with logic instead.** Reduce the defect to a platform-injectable pure function and prove it red→green with a simulated-platform unit test (§2) — that is a real, deterministic run you *can* do on Linux. This is your fix-proof.
2. **Commit the OS-suffixed UI plan as a regression artifact** so a maintainer or a future on-OS run can execute it. State plainly on the PR that you authored but could not self-run it.
3. Only when the bug genuinely cannot be reduced to injectable logic (it lives in VS Code's own rendering) do you fall back to a careful code read + reasoning, and say so honestly — never claim a UI run you did not perform.

## 6. Report back

Every PR or comment must state **how you reproduced** (UI plan vs unit test vs code read) and the **execution status** (ran red→green yourself, or could not execute — and why). Never claim a green run you did not observe.

- **Reproduced + fixed**: open a **single PR containing the repro plan/test and the fix together**. State that you ran it red→green **in your own environment**, and show the proof as **text**: the decisive failing step and the **actual observed value** from your red run (`results.json` for UI, the failing assertion for a unit test), plus the green after-fix result. Optionally drag a decisive screenshot into the issue or a PR comment (GitHub-hosted, **not** committed). For an OS-specific bug you could not run in-session, make the simulated-platform unit test the proof and note that the committed `-windows`/`-linux` UI plan is a regression artifact you authored but could not self-run. Reference the issue.
- **Reproduced, report only**: comment with the reproduction (plan or test), the observed vs expected behavior, and the exact failing step.
- **Reproduced but could not run the UI test**: remember a `(dns block)` on `update.code.visualstudio.com` is expected and non-fatal (see Environment notes) — it is **not** a reason to skip the UI path. Only if the editor genuinely never launches, commit the plan, explain the real failure, and fall back to a non-UI proof or ask a maintainer to unblock.
- **Could not reproduce**: comment with what you tried and precisely what is missing; label `needs-more-info`. Do not fabricate a fix for an unreproduced bug.

## Environment notes

- The Copilot coding agent environment is prepared by `.github/workflows/copilot-setup-steps.yml` (JDK 21, Node 20, AutoTest, the `xvfb` package, a baseline VSIX). These are installed, but **Xvfb is NOT started for you and there is no `DISPLAY`** — on Linux you must launch every UI run under `xvfb-run -a --server-args="-screen 0 1920x1080x24"` (see §4), or VS Code cannot open a display and the run dies at launch.
- That setup runs **before the agent firewall**, and its final step pre-downloads the **latest** VS Code (`stable`) and the `vscjava.vscode-java-pack` extensions into AutoTest's `<repo>/.vscode-test` cache (via `.github/scripts/prewarm-vscode.js`). Keep the plans on `vscodeVersion: "stable"` (do **not** pin a version) — `stable` always means the current latest release, and it is exactly what the pre-warm cached.
- **A `(dns block)` on `update.code.visualstudio.com` at run time is EXPECTED and NON-FATAL — do not treat it as a UI-test failure or abandon the UI path.** AutoTest re-resolves `stable` over the network at launch; the firewall blocks that, but `@vscode/test-electron` catches it and **falls back to the already-cached latest VS Code**, and the Java extensions are already installed in `.vscode-test/extensions`. So the editor still launches offline. VS Code's own telemetry/Marketplace DNS calls are blocked too and are equally harmless.
- Only if the pre-warm genuinely did not run (e.g. an older branch, or a cold `.vscode-test` with no cached build) will the UI run actually fail to launch. In that case fall back to the non-UI path and note the limitation.
- **Evidence: your own self-run is the proof; keep binaries out of git.** Quote the decisive step and the **actual observed value** from the red run, then the green result, on the issue/PR. Screenshots are **not** committed to the repo — drag a PNG from the git-ignored `test-results/` into the issue or a PR comment for an inline view (`user-images.githubusercontent.com`), still out of git.
- Maintainer option: adding `update.code.visualstudio.com` to the Copilot coding-agent firewall allowlist (repo **Settings → Copilot → coding agent**, see https://gh.io/copilot/firewall-config) removes the version-resolution block entirely, so the run is clean and does not rely on the offline fallback. The pre-warm still makes the 276 MB binary + Marketplace pack a cache hit, so nothing large is re-fetched.
- **Issue attachments and repo clones are downloadable — they are NOT firewall-blocked.** `github.com`, `objects.githubusercontent.com`, `*.githubusercontent.com`, and `codeload.github.com` are all on the coding-agent's default allowlist, so cloning a linked public repo and `curl -L`-downloading an attached `user-attachments` zip both work at run time. (Only the VS Code binary host `update.code.visualstudio.com` is not allowlisted — that is why it is pre-warmed instead, see above.) Extract user-supplied zips as untrusted data: do not run their build scripts blindly.
- Always run AutoTest with `--no-llm` in the agent so pass/fail comes only from deterministic verifiers.
