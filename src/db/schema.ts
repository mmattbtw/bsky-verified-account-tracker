import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const verifiedUsers = sqliteTable(
  "verified_users",
  {
    subjectDid: text("subject_did").notNull(), // The user being verified
    verifierDid: text("verifier_did").notNull(), // The organization/person doing the verification
    verifiedAt: integer("verified_at").notNull(), // Timestamp of verification
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.subjectDid, table.verifierDid] }),
  })
);

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectDid: text("subject_did").notNull(),
  verifierDid: text("verifier_did").notNull(),
  postUri: text("post_uri").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const listItems = sqliteTable(
  "list_items",
  {
    subjectDid: text("subject_did").notNull(), // The user being added to list
    verifierDid: text("verifier_did").notNull(), // The organization that verified them
    listDid: text("list_did").notNull(), // The list they were added to
    listUri: text("list_uri").notNull(), // The AT URI of the list item
    addedAt: integer("added_at").notNull(), // Timestamp of when they were verified
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.subjectDid, table.verifierDid, table.listDid],
    }),
  })
);
