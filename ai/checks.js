// Tickmark Hybrid: checks between teams, live through Firestore (see docs/hybrid/CONTRACT.md and
// firestore.rules). A demo session is a room with a random id; a person joins it as one team. Only redacted
// text is ever written here; the leak check runs again on every outgoing string as a last guard.
import { db, fs, signedIn } from './firebase.js';
import './redact.js';

const Redact = self.TickmarkRedact;
export const TEAMS = {
  servicing: 'Mortgage Servicing', payments: 'Payments', approvals: 'Servicing Approvals', legal: "Lawyer's office",
};
const ROOM_KEY = 'tickmark.hybrid.room';

// What the answering team can fill in, by what was requested (the team inbox renders these as form fields).
// `apply` is how the asking side turns the value into a correction of the case's inputs.
export const REQUEST_FIELDS = {
  'Settlement date decision': { key: 'settlement', label: 'Settlement date that applies', type: 'date', apply: (v, ref) => [{ path: 'settlement', value: { date: v, by: 'daniel', ref }, label: 'Settlement date' }] },
  'Settlement date and per diem': { key: 'settlement', label: 'Settlement date that applies', type: 'date', apply: (v, ref) => [{ path: 'settlement', value: { date: v, by: 'daniel', ref }, label: 'Settlement date' }] },
  'Bank receipt time': { key: 'bank', label: 'When the bank received the funds', type: 'datetime-local', apply: (v) => [{ path: 'funds.0.bank', value: v.slice(0, 16), label: 'Bank received' }] },
};
export const fieldsFor = (requested = []) => requested.map((r) => REQUEST_FIELDS[r]).filter(Boolean);

// The room: from the link (#room=… or ?room=…), else the one this browser used last, else a new one.
export function currentRoom() {
  const fromUrl = (location.hash.match(/room=([A-Za-z0-9_-]{12,40})/) || location.search.match(/room=([A-Za-z0-9_-]{12,40})/) || [])[1];
  if (fromUrl) { try { localStorage.setItem(ROOM_KEY, fromUrl); } catch {} return fromUrl; }
  try { const saved = localStorage.getItem(ROOM_KEY); if (saved) return saved; } catch {}
  return newRoom();
}
export function newRoom() {
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  const id = Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  try { localStorage.setItem(ROOM_KEY, id); } catch {}
  return id;
}
export const inboxLink = (room, team) => new URL(`inbox.html#room=${room}&team=${team}`, location.href).href;

const membersRef = (room) => fs.collection(db, 'rooms', room, 'members');
const checksRef = (room) => fs.collection(db, 'rooms', room, 'checks');

// Join the room as a team (writes rooms/{room}/members/{uid}). Returns the uid.
export async function join(room, team, displayName, platform = 'web') {
  const user = await signedIn;
  if (!user.uid) throw new Error(`Sign-in failed: ${user.error || 'unknown error'}`);
  const ref = fs.doc(membersRef(room), user.uid);
  const snap = await fs.getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    if (d.team !== team || d.displayName !== displayName) await fs.updateDoc(ref, { team, displayName, platform });
  } else {
    await fs.setDoc(ref, { team, displayName, platform, joinedAt: fs.serverTimestamp() });
  }
  return user.uid;
}

function assertNoLeaks(obj) {
  const text = JSON.stringify(obj);
  const leaks = Redact.leaks(text);
  if (leaks.length) throw new Error(`Not sent: ${leaks.length} identifier(s) still in the text (${[...new Set(leaks.map((l) => l.type))].join(', ')}).`);
}

// Send a check. All text must already be redacted; it is checked once more here.
export async function sendCheck(room, c) {
  const user = await signedIn;
  const data = {
    caseId: c.caseId, caseTitle: c.caseTitle, fromTeam: c.fromTeam, toTeam: c.toTeam,
    createdBy: user.uid, createdAt: fs.serverTimestamp(), due: fs.Timestamp.fromDate(new Date(c.due)),
    question: c.question, whyItMatters: c.whyItMatters || '', classification: c.classification,
    expected: c.expected || {}, evidence: (c.evidence || []).slice(0, 5), requested: (c.requested || []).slice(0, 4),
    status: 'open', reply: null, updatedAt: fs.serverTimestamp(),
  };
  assertNoLeaks({ q: data.question, w: data.whyItMatters, t: data.caseTitle, e: data.evidence, x: data.expected });
  const ref = await fs.addDoc(checksRef(room), data);
  return ref.id;
}

// Live views.
export const watchCheck = (room, id, fn) => fs.onSnapshot(fs.doc(checksRef(room), id), (s) => fn(s.exists() ? { id: s.id, ...s.data() } : null), (e) => fn(null, e));
export const watchInbox = (room, team, fn) => fs.onSnapshot(fs.query(checksRef(room), fs.where('toTeam', '==', team)),
  (s) => fn(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), (e) => fn(null, e));
export const watchSent = (room, team, fn) => fs.onSnapshot(fs.query(checksRef(room), fs.where('fromTeam', '==', team)),
  (s) => fn(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => fn(null, e));

// The answering team replies.
export async function reply(room, id, { text, facts = {}, byName, ranOn = 'none' }) {
  const user = await signedIn;
  assertNoLeaks({ text, facts });
  await fs.updateDoc(fs.doc(checksRef(room), id), {
    reply: { text, facts, by: user.uid, byName, at: fs.serverTimestamp(), ranOn }, status: 'answered', updatedAt: fs.serverTimestamp(),
  });
}

// The asking team accepts the reply or sends it back.
export const decide = (room, id, status) => fs.updateDoc(fs.doc(checksRef(room), id), { status, updatedAt: fs.serverTimestamp() });
