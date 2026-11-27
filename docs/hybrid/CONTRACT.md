# Tickmark Hybrid: data contract

The case workbench (`index.html`) and the team inbox (`inbox.html`) share one Firebase project and must agree on the data below. Change this file first, in the same commit as any code that depends on the change, and note it in the change log at the bottom.

## Roles

| Platform | Person | Job |
|---|---|---|
| Case workbench (Chrome, Gemini Nano) | Servicing analyst who owns the exception | Reads evidence privately, redacts, sends a check to another team, accepts or returns the reply |
| Team inbox (Chrome, Gemini Nano) | The other team: Payments, Servicing Approvals, or a lawyer's office | Receives checks live, drafts the reply on device, answers with the decision values |

## Firebase products

- **Firebase AI Logic** with hybrid inference on both platforms. Cloud backend: Gemini Developer API. Cloud model from Remote Config `ai_cloud_model`.
- **App Check**: reCAPTCHA on the hosted site, the debug provider in development. Debug tokens are never committed.
- **Authentication**: anonymous sign-in. The user picks a team when joining a room; it is stored in `rooms/{roomId}/members/{uid}`.
- **Firestore**: collections below.
- **Remote Config**: the AI policy below.

## Firestore

Every demo session is a **room** with a random id (12+ characters, shared through a link or code). Knowing the room id is what lets a person in; this keeps judges' sessions apart. In production, membership and teams would come from the bank's identity provider (custom claims), not from the person.

Teams: `servicing`, `payments`, `approvals`, `legal`.

`rooms/{roomId}/members/{uid}` (written only by that user)
```
{ team: "servicing" | "payments" | "approvals" | "legal", displayName: string (1-60), platform: "web", joinedAt: timestamp (server time) }
```

`rooms/{roomId}/checks/{checkId}`: a question from one team to another about one case. **Only redacted text is ever stored here.**
```
{
  caseId: string (1-20),                // e.g. "MS-0011"
  caseTitle: string (1-140),            // redacted
  fromTeam: team, toTeam: team,         // must differ
  createdBy: uid, createdAt: timestamp (server time), due: timestamp,
  question: string (1-1200),            // redacted
  whyItMatters: string (0-600),         // redacted
  classification: "timing" | "source-error" | "business" | "insufficient",   // the model's suggestion
  expected: map, max 12 keys,           // what the case expects, e.g. { payout_amount: 412880, bank: "2026-10-30 14:02" }
  evidence: list of up to 5 maps { docType: string, summary: string (0-600), facts: map (max 12 keys) },
  requested: list of up to 4 strings,   // e.g. ["Settlement date decision"]
  status: "open" | "answered" | "accepted" | "returned",
  reply: null | { text: string (1-1200), facts: map (max 12 keys), by: uid, byName: string, at: timestamp (server time),
                  ranOn: "on_device" | "in_cloud" | "none" },
  updatedAt: timestamp (server time)
}
```

Lifecycle and who may do what (enforced by `firestore.rules`):
- Any room member reads the room's checks and members.
- A member of `fromTeam` creates a check: status `open`, reply `null`, `createdBy` = their uid.
- A member of `toTeam` replies: sets only `reply`, `status` = `answered` and `updatedAt`, from `open` or `returned`; `reply.by` = their uid.
- A member of `fromTeam` accepts or returns: sets only `status` (`accepted` or `returned`) and `updatedAt`, from `answered`.
- Nobody deletes. Everything else is denied.

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

`ai/redact.js` (tested in `tests/redact.test.js`) runs before any text can reach a cloud model, on both pages.

## Change log

- Nov 23, 2026: v0 drafted by the web side.
- Nov 26, 2026: v1.1. Web only (iOS dropped by the owner); `platform` is `web`.
- Nov 25, 2026: v1. Checks and members live under `rooms/{roomId}` (session isolation); team `approvals` added; `classification`, `requested`, `updatedAt` added; `events` removed; reply carries `byName`; timestamps are server time. Rules in `firestore.rules`.
