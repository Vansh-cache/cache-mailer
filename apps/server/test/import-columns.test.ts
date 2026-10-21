import assert from "node:assert/strict";
import test from "node:test";
import { canonicalTagName, matchColumns, splitPersonName, splitTags } from "../src/lib/import-columns";

test("column headers match regardless of case and punctuation", () => {
  const matched = matchColumns(["Name", " First Name ", "tags", "last_name", "E-mail", "Company"]);
  assert.equal(matched.email, "E-mail");
  assert.equal(matched.firstName, "First Name");
  assert.equal(matched.lastName, "last_name");
  assert.equal(matched.name, "Name");
  assert.equal(matched.tags, "tags");
  assert.equal(matchColumns(["Tag Name"]).tags, "Tag Name");
  assert.equal(matched.company, "Company");
  assert.equal(matchColumns(["e mail"])["email"], "e mail");
  assert.equal(matchColumns(["EMAIL ADDRESS"]).email, "EMAIL ADDRESS");
});

test("a full name splits into first and last", () => {
  assert.deepEqual(splitPersonName("Asha Rao"), { firstName: "Asha", lastName: "Rao" });
  assert.deepEqual(splitPersonName("Asha"), { firstName: "Asha", lastName: null });
});

test("tag text and list categories share one spelling", () => {
  assert.equal(canonicalTagName(" lead "), "Lead");
  assert.equal(canonicalTagName("demo data"), "Demo data");
  assert.deepEqual(splitTags("customer; VIP | lead"), ["Customer", "VIP", "Lead"]);
  assert.deepEqual(splitTags("October 2026 launch, Diwali meetup"), ["October 2026 launch", "Diwali meetup"]);
  assert.equal(canonicalTagName("October 2026 launch"), "October 2026 launch");
});
