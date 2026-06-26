# Security Policy

## Supported versions

`@pingaura/telemetry` is pre-1.0. Security fixes are released against the
latest published version on npm. Run the most recent 0.x release.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | yes       |
| < 0.1   | no        |

## Reporting a vulnerability

Do not open public issues for security problems.

Report privately through GitHub's "Report a vulnerability" button on the
[Security tab](https://github.com/pingaura-ai/pingaura-telemetry-sdk/security/advisories/new),
or email security@pingaura.ai.

Where possible, include:

- the affected version and runtime (Node, Next.js, or Cloudflare Workers),
- a description of the issue and its impact,
- steps to reproduce or a proof of concept.

We acknowledge reports within 3 business days. For confirmed issues we ship a
fix or mitigation prioritized by severity and keep you updated. We credit
reporters in the release notes unless they prefer to stay anonymous.

## Scope

This policy covers the `@pingaura/telemetry` SDK in this repository. Report
issues in the PingAura collector or web service through the same channels.

## Data handling

The SDK is built to avoid collecting PII: custom event properties are sent
verbatim to the collector, and the documentation requires that PII never be
placed in them. If you find a path where the SDK transmits data beyond what is
documented, treat it as a security issue and report it privately.
