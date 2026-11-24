# Tickmark Hybrid for iOS

The iOS side of Tickmark Hybrid, built for #BuildHybridAI 2026 (Firebase AI Logic hybrid inference). Status: not started.

## What it is

Finance exceptions are a cross-team communication problem, and banks do not allow staff to send customer documents to cloud AI. The web workbench (Chrome, Gemini Nano) is used by the analyst who owns an exception. **This app is used by the team that has to answer**: Payments, or a lawyer's office.

1. Sign in anonymously and pick a team (`payments` or `legal`).
2. See the checks sent to that team, live from Firestore.
3. Open a check: the question, why it matters, what the case expects, and the attached evidence (already redacted).
4. Attach your own evidence (paste text, or a photo of a document): **Apple Foundation Models reads it on the device** and extracts the facts to a fixed schema. Raw text never leaves the phone.
5. Draft the reply **on device**; if the on-device model is not available, redact locally first and only then use the cloud, with a clear "what leaves this phone" preview.
6. Send: the reply and facts go to Firestore, and the web case re-checks itself live.
7. A small "where did the AI run" record on every AI result: on device, in the cloud, or not at all.

The shared data model, Remote Config policy and team rules are in [`docs/hybrid/CONTRACT.md`](../docs/hybrid/CONTRACT.md). Follow it exactly.

## Requirements

- Mac with Apple silicon, Xcode 26 or newer, Swift Package Manager (hybrid support is SPM only).
- On-device inference needs a device (or the Mac running the simulator) with **Apple Intelligence enabled**. The app cannot enable it; it can only check availability and explain how to turn it on.
- Firebase iOS SDK via SPM: FirebaseAI (with hybrid / Foundation Models support), FirebaseAppCheck, FirebaseAuth, FirebaseFirestore, FirebaseRemoteConfig.
- App Check: debug provider in development (debug token passed through the Xcode scheme, never committed), App Attest for devices.
- `GoogleService-Info.plist` is downloaded from the Firebase console and **not committed** (see `.gitignore`).

## Milestones

| ID | Target | Done when |
|---|---|---|
| I1 | Wed Nov 25 | Xcode project in `ios/TickmarkHybrid`, Firebase via SPM, App Check debug, anonymous auth; one prompt on device and one in the cloud, each showing where it ran |
| I2 | Thu Nov 26 to Fri Nov 27 | Team picker, live inbox of checks, check detail, on-device evidence reading to a schema, on-device reply draft, redaction port with tests, reply written to Firestore |
| I3 | Sat Nov 28 | Design polish (native SwiftUI, Dynamic Type, dark mode), no-Apple-Intelligence path, offline behaviour, QA from the judge and user seats |

Cut rule: if I1 is not working by Wednesday night, iOS is dropped and the web app is submitted alone.

## Run

1. Open `ios/TickmarkHybrid/TickmarkHybrid.xcodeproj` in Xcode.
2. Put `GoogleService-Info.plist` in `ios/TickmarkHybrid/TickmarkHybrid/`.
3. Add your App Check debug token to the scheme (Run > Arguments > Environment: `FIRAAppCheckDebugToken`) and register it in the Firebase console.
4. Run on a device or simulator with Apple Intelligence enabled.
