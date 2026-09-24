// Provider-agnostic video adapter (docs/DOMAIN-MODEL.md §5). No real video
// provider (Twilio/Daily/Agora/...) is wired up in this environment — MOCK
// is the only VideoProvider value the schema allows today, and this
// adapter is honest about what it can't do rather than faking a call: it
// never returns a join URL, only a message the UI shows plainly instead of
// launching a video window. Adding a real provider means adding a new
// VideoProvider enum value (a schema-visible decision) and a matching
// branch here — not a silent env-var switch.
export interface VideoJoinInfo {
  available: false;
  message: string;
}

export function resolveJoinInfo(): VideoJoinInfo {
  return {
    available: false,
    message: 'Video calling is not connected to a live provider in this environment yet. Please coordinate the call directly with the patient/doctor for now.',
  };
}
