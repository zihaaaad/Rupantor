# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately by email to **zihad.connects@gmail.com** with `[SECURITY]`
in the subject line, or through GitHub's
[private vulnerability reporting](https://github.com/zihaaaad/Rupantor/security/advisories/new).

Please include:

- What the issue is and roughly how serious you think it is
- Steps to reproduce, or a proof of concept
- The Rupantor version and your OS
- Anything you already know about a fix

You will get an acknowledgement within a few days. This is a one-person project,
so please allow reasonable time for a fix before disclosing publicly.

## Supported versions

Only the latest release receives fixes. There are no long-term support branches.

## Why this matters for Rupantor specifically

Rupantor is not a sandboxed web app. It:

- writes to the Windows registry (`HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts`)
- copies files into OS font directories
- spawns PowerShell and `osascript`
- parses untrusted font binaries with a third-party library
- hands `.jsx` files to Adobe applications to execute

Anything that lets an attacker influence those paths is worth reporting, even
if you are not sure it is exploitable.

## What is already known

[AUDIT.md](AUDIT.md) documents the security posture, the trust boundaries, and
the open findings — including ones judged low risk with the reasoning for that
judgement. Please check it before reporting; if you disagree with a severity
call there, that is itself worth raising.

## Scope

**In scope:** the Rupantor desktop app, this repository, and the project site
under `docs/`.

**Out of scope:** vulnerabilities in Adobe applications themselves; issues that
require an attacker to already have code execution as the user; the installers
being unsigned, which is a known and documented limitation.

## A note on builds

Releases are **not code-signed**. Verify what you download against the source,
or build it yourself — the instructions are in the [README](README.md).
