import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { AppError } from "../errors";

export type ColumnField = "email" | "firstName" | "lastName" | "name" | "company" | "jobTitle" | "tags";

const ALIASES: Record<ColumnField, string[]> = {
  email: ["email", "e-mail", "email address", "mail", "email id", "mail id"],
  firstName: ["first name", "firstname", "first_name", "given name", "forename", "fname"],
  lastName: ["last name", "lastname", "last_name", "surname", "family name", "lname"],
  name: ["name", "full name", "fullname", "contact name", "username", "user name"],
  company: ["company", "company name", "organization", "organisation", "org"],
  jobTitle: ["job title", "jobtitle", "designation", "position", "title"],
  tags: ["tags", "tag", "tag name", "tagname", "category", "categories", "label", "labels"],
};

const CANONICAL_TAGS: Record<string, string> = {
  lead: "Lead",
  leads: "Lead",
  customer: "Customer",
  customers: "Customer",
  eventattendee: "Event attendee",
  eventattendees: "Event attendee",
  demorequested: "Demo requested",
  demorequest: "Demo requested",
  demodata: "Demo data",
};

export const LIST_CATEGORIES = {
  lead: "Lead",
  customer: "Customer",
  event_attendee: "Event attendee",
  demo_requested: "Demo requested",
} as const;

export type ListCategory = keyof typeof LIST_CATEGORIES;

export function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function matchColumns(headers: string[]): Partial<Record<ColumnField, string>> {
  const matched: Partial<Record<ColumnField, string>> = {};
  for (const header of headers) {
    const key = headerKey(header);
    if (!key) continue;
    for (const field of Object.keys(ALIASES) as ColumnField[]) {
      if (matched[field]) continue;
      if (ALIASES[field].some((alias) => headerKey(alias) === key)) matched[field] = header.trim();
    }
  }
  return matched;
}

export function resolveColumns(headers: string[], requested: Partial<Record<ColumnField, string>>): Partial<Record<ColumnField, string>> {
  const detected = matchColumns(headers);
  const resolved: Partial<Record<ColumnField, string>> = { ...detected };
  for (const field of Object.keys(requested) as ColumnField[]) {
    const wanted = requested[field]?.trim();
    if (!wanted) continue;
    const actual = headers.find((header) => headerKey(header) === headerKey(wanted));
    if (actual) resolved[field] = actual.trim();
  }
  return resolved;
}

export function splitPersonName(value: string): { firstName: string | null; lastName: string | null } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function canonicalTagName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return CANONICAL_TAGS[headerKey(cleaned)] ?? cleaned.slice(0, 80);
}

export function splitTags(value: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of value.split(/[,;|]/)) {
    const name = canonicalTagName(part);
    if (!name) continue;
    const key = headerKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function readImportRows(filename: string, buffer: Buffer): Record<string, string>[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return readCsv(buffer);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return readExcel(buffer);
  throw new AppError(400, "Upload a CSV or Excel file");
}

function readCsv(buffer: Buffer): Record<string, string>[] {
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[];
  return rows.map(cleanRow);
}

function readExcel(buffer: Buffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false });
  return rows.map(cleanRow);
}

function cleanRow(row: Record<string, unknown>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const header = key.trim();
    if (!header) continue;
    cleaned[header] = String(value ?? "").trim();
  }
  return cleaned;
}
