/**
 * What can go wrong at a provider, as the jobs need to tell it apart. Messages name the path and
 * status only, so a key can't end up in a log.
 */

/** The provider has no such record. Fails that asset and keeps its last good data. */
export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}

/** A timeout, 429 or 5xx that outlasted its retries. */
export class TransientError extends Error {
  override readonly name = "TransientError";
}

/** The response isn't the shape we expect. Fails that asset, because the next one may be fine. */
export class ContractBrokenError extends Error {
  override readonly name = "ContractBrokenError";
}

/** The key was rejected or the quota is used up. Every later call would fail too, so the run stops. */
export class AuthOrQuotaError extends Error {
  override readonly name = "AuthOrQuotaError";
}
