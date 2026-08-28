/** Shared Workers env bindings. Single source of truth for Hono `Bindings` generics. */
export type AppBindings = {
  DB: D1Database;
  /** Private quarantine bucket: pending submissions and legacy flat-key images. */
  IMAGES: R2Bucket;
  /** Public approved-image bucket. No unreviewed object may be written here. */
  PUBLIC_IMAGES: R2Bucket;
  /** 'false' enables manual moderation; absent/'true' (default) auto-approves submissions. */
  AUTO_APPROVE_WORKSHOP?: string;
  /**
   * Admin secret, compared against the X-Admin-Key REQUEST HEADER (never a URL
   * param or GET body). Absent => all admin routes deny (fail closed).
   */
  ADMIN_KEY?: string;
};
