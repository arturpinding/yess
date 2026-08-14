import { PgDialect } from "drizzle-orm/pg-core";
import { notificationInboxScope } from "./notification-access";

describe("notification inbox access", () => {
  it("requires both user and selected profile and never matches nullable global rows", () => {
    const query = new PgDialect().sqlToQuery(
      notificationInboxScope("user-from-session", "profile-from-session"),
    );

    expect(query.sql).toContain('\"notifications\".\"user_id\" = $1');
    expect(query.sql).toContain('\"notifications\".\"profile_id\" = $2');
    expect(query.sql.toLowerCase()).not.toContain("is null");
    expect(query.params).toEqual(["user-from-session", "profile-from-session"]);
  });
});
