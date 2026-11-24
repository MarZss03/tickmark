# Tickmark Hybrid: shared contract (web and iOS)

Both apps use one Firebase project and must agree on the data below. Change this file first, in the same commit as any code that depends on the change, and note it in the change log at the bottom.

## Roles

| Platform | Person | Job |
|---|---|---|
| Web (Chrome, Gemini Nano) | Servicing analyst who owns the exception | Reads evidence privately, redacts, sends a check to another team, accepts or returns the reply |
| iOS (Apple Foundation Models) | The other team: Payments, or a lawyer's office | Receives checks live, reads attached evidence on device, drafts the reply on device, answers |

Teams: `servicing`, `payments`, `legal`.

## Firebase products

- **Firebase AI Logic** with hybrid inference on both platforms. Cloud backend: Gemini Developer API. Cloud model from Remote Config `ai_cloud_model`.
- **App Check**: reCAPTCHA Enterprise on web, App Attest on iOS devices, debug providers in development. Debug tokens are never committed.
- **Authentication**: anonymous sign-in. The user picks a team; it is stored in `users/{uid}`.
- **Firestore**: collections below.
- **Remote Config**: the AI policy below.

## Firestore

`users/{uid}`
```
{ team: "servicing" | "payments" | "legal", displayName: string, createdAt: timestamp }
```

`checks/{checkId}`: a question from one team to another about one case. Only redacted text is ever stored here.
```
{
  caseId: string,                    // e.g. "MS-0011"
  caseTitle: string,                 // redacted, e.g. "Wire posted 3 days after value date"
  fromTeam: string, toTeam: string,
  createdBy: uid, createdAt: timestamp, due: timestamp,
  question: string,                  // redacted
  whyItMatters: string,              // redacted
  expected: { [field]: string|number },   // what the case expects, e.g. { amount: 412860.17, valueDate: "2026-11-02" }
  evidence: [ { docType: "wire_confirmation" | "payout_statement" | "discharge_statement" | "bank_statement" | "other",
                redactedText: string, facts: { [field]: string|number } } ],
  status: "open" | "answered" | "accepted" | "returned",
  reply: null | { text: string, facts: { [field]: string|number }, by: uid, at: timestamp,
                  ranOn: "device" | "cloud" | "none" },
  events: [ { at: timestamp, by: uid, kind: string, note: string } ]
}
```

Security rules (to be written with the firestore-rules-creation skill): a user reads checks where `fromTeam` or `toTeam` is their team; only `fromTeam` creates; only `toTeam` writes `reply` and sets `answered`; only `fromTeam` sets `accepted` or `returned`; field types and sizes enforced.

## Remote Config: the AI policy

| Key | Default | Meaning |
|---|---|---|
| `ai_policy_raw_documents` | `device_only` | Raw customer documents: on-device only. If no on-device model, redact locally first, then cloud only with the user's confirmation |
| `ai_policy_redacted_text` | `prefer_device` | Redacted text: on device if available, else cloud |
| `ai_policy_case_history` | `prefer_cloud` | Long, redacted case history: cloud first |
| `ai_cloud_model` | `gemini-3.5-flash-lite` | Cloud fallback model |
| `ai_prompt_version` | `v1` | Prompt set in use |
| `ai_enabled` | `true` | Kill switch |

Values map to inference modes: `device_only` = ONLY_ON_DEVICE, `prefer_device` = PREFER_ON_DEVICE, `prefer_cloud` = PREFER_IN_CLOUD, `cloud_only` = ONLY_IN_CLOUD.

## Redaction

Web: `ai/redact.js` (tested in `tests/redact.test.js`). iOS must port the same rules and pass the same cases (`ios/` test target), so a reply drafted on the phone never sends raw identifiers to the cloud either.

## Change log

- Nov 23, 2026: v0 drafted by the web side.
