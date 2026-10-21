import { z } from "zod";
import { assertNever } from "../errors";

const conditionSchema = z
  .object({
    field: z.enum(["tag", "status", "company", "job_title", "first_name", "last_name", "email"]),
    op: z.enum(["eq", "neq", "contains"]),
    value: z.string().min(1),
  })
  .superRefine((condition, ctx) => {
    if (condition.field === "tag" && condition.op === "contains") {
      ctx.addIssue({ code: "custom", message: "Tag filters support eq or neq" });
    }
    if (condition.field === "status" && condition.op !== "eq") {
      ctx.addIssue({ code: "custom", message: "Status filters support eq only" });
    }
    if (
      condition.field === "status" &&
      condition.value !== "active" &&
      condition.value !== "unsubscribed" &&
      condition.value !== "bounced"
    ) {
      ctx.addIssue({ code: "custom", message: "Unknown contact status" });
    }
    if (condition.field !== "tag" && condition.field !== "status" && condition.op === "neq") {
      ctx.addIssue({ code: "custom", message: "This field supports eq or contains" });
    }
  });

export const rulesSchema = z.object({
  op: z.enum(["and", "or"]),
  conditions: z.array(conditionSchema).min(1),
});

export type Rules = z.infer<typeof rulesSchema>;

export type RuleContact = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  status: string;
  tags: string[];
};

function fieldValue(contact: RuleContact, field: "company" | "job_title" | "first_name" | "last_name" | "email"): string {
  switch (field) {
    case "company":
      return contact.company ?? "";
    case "job_title":
      return contact.jobTitle ?? "";
    case "first_name":
      return contact.firstName ?? "";
    case "last_name":
      return contact.lastName ?? "";
    case "email":
      return contact.email;
    default:
      return assertNever(field);
  }
}

function matchesCondition(contact: RuleContact, condition: Rules["conditions"][number]): boolean {
  switch (condition.field) {
    case "tag": {
      const has = contact.tags.some((tag) => tag.toLowerCase() === condition.value.toLowerCase());
      if (condition.op === "eq") return has;
      if (condition.op === "neq") return !has;
      return false;
    }
    case "status":
      return contact.status === condition.value;
    case "company":
    case "job_title":
    case "first_name":
    case "last_name":
    case "email": {
      const raw = fieldValue(contact, condition.field).toLowerCase();
      const expected = condition.value.toLowerCase();
      if (condition.op === "eq") return raw === expected;
      if (condition.op === "contains") return raw.includes(expected);
      return false;
    }
    default:
      return assertNever(condition.field);
  }
}

export function matchesRules(contact: RuleContact, rules: Rules): boolean {
  const results = rules.conditions.map((condition) => matchesCondition(contact, condition));
  if (rules.op === "and") return results.every(Boolean);
  return results.some(Boolean);
}
