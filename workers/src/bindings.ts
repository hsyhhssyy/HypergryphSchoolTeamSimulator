/** Shared Workers env bindings. Single source of truth for Hono `Bindings` generics. */
export type AppBindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  /** 'false' enables manual moderation; absent/'true' (default) auto-approves submissions. */
  AUTO_APPROVE_WORKSHOP?: string;
};
