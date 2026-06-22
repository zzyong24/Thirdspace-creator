// query-services errors. This composition module throws nothing of its own; it
// only RE-RAISES upstream ownership failures so a cross-user project read 404s
// (SPEC §20; foundation §2 — never render an empty page for another tenant).
// `OwnershipError` is the identity module's typed class (code → HTTP 404), reached
// here via the public identity entry (no deep import). Re-exported so the service
// + tests reference one class.

export { OwnershipError } from "@/server/modules/identity";
