/**
 * Version constants embedded in the binary.
 *
 * `CLI_VERSION` follows SemVer independent of Firefly III.
 * `API_SPEC_VERSION` is the pinned vendored OpenAPI version (see spec/10).
 */
export const CLI_VERSION = '0.2.0';

/** Pinned Firefly III API spec the generated types come from (reference/*.yaml). */
export const API_SPEC_VERSION = 'v6.6.2';

/** Firefly API major version path segment used by modelled commands. */
export const API_VERSION = 'v1';
