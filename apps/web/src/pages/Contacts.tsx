import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Badge, Button, Field, PageHeader, inputClass, statusTone } from "../components/ui";
import { api, downloadCsv, type Contact } from "../lib/api";

const columnHelper = createColumnHelper<Contact>();
const emptyContacts: Contact[] = [];

export function ContactsPage() {
  const [search, setSearch] = useState("");
  const [tagId, setTagId] = useState(0);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<Contact | null>(null);
  const queryClient = useQueryClient();
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const contacts = useQuery({
    queryKey: ["contacts", search, tagId],
    queryFn: () => api.contacts(`?search=${encodeURIComponent(search)}&tagId=${tagId || ""}&pageSize=100`),
    placeholderData: keepPreviousData,
  });
  const rows = contacts.data?.contacts ?? emptyContacts;
  const total = contacts.data?.total ?? 0;
  const pageIds = useMemo(() => rows.map((contact) => contact.id), [rows]);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const selectedTag = tags.data?.tags.find((tag) => tag.id === tagId);
  const selectedTagIsEmpty = tagId !== 0 && tags.isSuccess && (!selectedTag || selectedTag.count === 0);
  const filteredTagListIsEmpty =
    tagId !== 0 &&
    search.trim() === "" &&
    contacts.isSuccess &&
    !contacts.isPlaceholderData &&
    !contacts.isFetching &&
    total === 0;
  useEffect(() => {
    if (selectedTagIsEmpty || filteredTagListIsEmpty) setTagId(0);
  }, [selectedTagIsEmpty, filteredTagListIsEmpty]);
  useEffect(() => {
    setSelected([]);
  }, [search, tagId]);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    await queryClient.invalidateQueries({ queryKey: ["overview"] });
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
  };
  const remove = useMutation({
    mutationFn: (body: { ids?: number[]; allMatching?: boolean }) =>
      api.deleteContacts({ ...body, search, tagId, allMatching: body.allMatching }),
    onSuccess: async (result) => {
      toast.success(`Deleted ${result.deleted} contacts`);
      setSelected([]);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const columns = useMemo(() => [
    columnHelper.display({
      id: "select",
      header: () => (
        <input
          type="checkbox"
          checked={allOnPage}
          onChange={() => setSelected(allOnPage ? [] : pageIds)}
          aria-label="Select contacts on this page"
        />
      ),
      cell: (info) => {
        const id = info.row.original.id;
        return (
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={() => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
            aria-label={`Select ${info.row.original.email}`}
          />
        );
      },
    }),
    columnHelper.accessor("email", { header: "Email", cell: (info) => <Link className="font-medium text-tide-700" to={`/contacts/${info.row.original.id}`}>{info.getValue()}</Link> }),
    columnHelper.accessor((row) => [row.firstName, row.lastName].filter(Boolean).join(" "), { id: "name", header: "Name" }),
    columnHelper.accessor("company", { header: "Company", cell: (info) => info.getValue() ?? "" }),
    columnHelper.accessor("status", { header: "Status", cell: (info) => <Badge tone={statusTone(info.getValue())}>{info.getValue()}</Badge> }),
    columnHelper.accessor("score", { header: "Score", cell: (info) => info.getValue() ?? 0 }),
    columnHelper.accessor("tags", { header: "Tags", cell: (info) => info.getValue().map((tag) => tag.name).join(", ") }),
    columnHelper.display({
      id: "edit",
      header: "",
      cell: (info) => <Button variant="ghost" onClick={() => setEditing(info.row.original)}>Edit</Button>,
    }),
  ], [allOnPage, pageIds, selected]);
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div>
      <PageHeader title="Contacts & Audience">
        <Button variant="ghost" onClick={() => downloadCsv("/api/contacts/export", "contacts.csv").catch((error: Error) => toast.error(error.message))}>Export</Button>
        <Button variant="ghost" onClick={() => setAddOpen(true)}>Add contact</Button>
        <Button onClick={() => setOpen(true)}>Import list</Button>
      </PageHeader>
      <section className="panel mb-4 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Tags</h2>
          <span className="text-xs text-slate-500">Click a tag to see its customers</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTagId(0)}
            className={`rounded-full border px-3 py-1 text-sm ${tagId === 0 ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
          >
            All tags
          </button>
          {(tags.data?.tags ?? []).filter((tag) => tag.count > 0).map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => setTagId(tag.id)}
              className={`rounded-full border px-3 py-1 text-sm ${tagId === tag.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
            >
              {tag.name} · {tag.count} customer{tag.count === 1 ? "" : "s"}
            </button>
          ))}
          {(tags.data?.tags.filter((tag) => tag.count > 0).length ?? 0) === 0 && (
            <span className="text-sm text-slate-500">No tags yet. Import a list with a category, or add a tag while adding/editing a contact.</span>
          )}
        </div>
      </section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${inputClass} max-w-sm`} placeholder="Search name, email, company" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Button
          variant="danger"
          disabled={selected.length === 0 || remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete ${selected.length} selected contact${selected.length === 1 ? "" : "s"}?`)) {
              remove.mutate({ ids: selected });
            }
          }}
        >
          Delete selected
        </Button>
        <Button
          variant="danger"
          disabled={total === 0 || remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete all ${total} contacts matching this filter?`)) remove.mutate({ allMatching: true });
          }}
        >
          Delete all matching
        </Button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        {total} contacts{rows.length < total ? `. Showing ${rows.length}. Delete all matching removes the full filter, not only this page.` : ""}
      </p>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>{group.headers.map((header) => <th key={header.id} className="px-3 py-2 font-medium">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                {row.getVisibleCells().map((cell) => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {total === 0 && <p className="p-6 text-sm text-slate-500">No contacts yet. Import a CSV or Excel file, or sync Zoho.</p>}
      </div>
      {open && (
        <ImportDialog
          onClose={() => {
            setOpen(false);
            void refresh();
          }}
        />
      )}
      {editing && <EditContact contact={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {addOpen && (
        <AddContact
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            await refresh();
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddContact({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagText, setNewTagText] = useState("");
  const allTags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const toggleTag = (tagId: number) =>
    setSelectedTagIds((current) => (current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId]));
  const save = useMutation({
    mutationFn: () => api.createContact({
      email: email.trim(),
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      company: company.trim() || null,
      jobTitle: jobTitle.trim() || null,
      tagIds: selectedTagIds,
      newTags: newTagText.split(",").map((tag) => tag.trim()).filter(Boolean),
    }),
    onSuccess: async () => {
      toast.success("Contact added");
      await onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink-950/40 p-4">
      <form className="panel max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <h2 className="text-lg font-semibold">Add contact</h2>
        <Field label="Email (required)"><input className={inputClass} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><input className={inputClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field>
          <Field label="Last name"><input className={inputClass} value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field>
          <Field label="Company"><input className={inputClass} value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
          <Field label="Job title"><input className={inputClass} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></Field>
        </div>
        <Field label="Tags">
          <div>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {(allTags.data?.tags ?? []).map((tag) => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                  <span className="flex-1">{tag.name}</span>
                  <span className="text-slate-400">{tag.count}</span>
                </label>
              ))}
              {(allTags.data?.tags.length ?? 0) === 0 && <p className="text-sm text-slate-500">No tags exist yet. Create the first one below.</p>}
            </div>
            <input
              className={`${inputClass} mt-2`}
              value={newTagText}
              onChange={(event) => setNewTagText(event.target.value)}
              placeholder="New tag, e.g. October 2026 launch"
              aria-label="New tag"
            />
            <p className="mt-1 text-xs text-slate-500">Use a comma for more than one new tag. Created when you press Save.</p>
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !email.trim()}>Save</Button>
        </div>
      </form>
    </div>
  );
}

function EditContact({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState(contact.email);
  const [firstName, setFirstName] = useState(contact.firstName ?? "");
  const [lastName, setLastName] = useState(contact.lastName ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [jobTitle, setJobTitle] = useState(contact.jobTitle ?? "");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(() => contact.tags.map((tag) => tag.id));
  const [newTagText, setNewTagText] = useState("");
  const allTags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const toggleTag = (tagId: number) =>
    setSelectedTagIds((current) => (current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId]));
  const tagNameById = new Map([...contact.tags, ...(allTags.data?.tags ?? [])].map((tag) => [tag.id, tag.name]));
  const save = useMutation({
    mutationFn: () => api.updateContact(contact.id, {
      email,
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      company: company.trim() || null,
      jobTitle: jobTitle.trim() || null,
      tagIds: selectedTagIds,
      newTags: newTagText.split(",").map((tag) => tag.trim()).filter(Boolean),
    }),
    onSuccess: async () => {
      toast.success("Contact updated");
      await onSaved();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink-950/40 p-4">
      <form className="panel max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <h2 className="text-lg font-semibold">Edit contact</h2>
        <Field label="Email"><input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><input className={inputClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field>
          <Field label="Last name"><input className={inputClass} value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field>
          <Field label="Company"><input className={inputClass} value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
          <Field label="Job title"><input className={inputClass} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></Field>
        </div>
        <Field label="Tags">
          <div>
            {selectedTagIds.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedTagIds.map((tagId) => (
                  <span key={tagId} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {tagNameById.get(tagId) ?? tagId}
                    <button type="button" className="text-slate-500 hover:text-slate-800" aria-label={`Remove tag ${tagNameById.get(tagId) ?? tagId}`} onClick={() => toggleTag(tagId)}>×</button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mb-2 text-sm text-slate-500">No tags. Tick a tag below or type a new one.</p>
            )}
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {(allTags.data?.tags ?? []).map((tag) => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                  <span className="flex-1">{tag.name}</span>
                  <span className="text-slate-400">{tag.count}</span>
                </label>
              ))}
              {(allTags.data?.tags.length ?? 0) === 0 && <p className="text-sm text-slate-500">No tags exist yet. Create the first one below.</p>}
            </div>
            <input
              className={`${inputClass} mt-2`}
              value={newTagText}
              onChange={(event) => setNewTagText(event.target.value)}
              placeholder="New tag, e.g. October 2026 launch"
              aria-label="New tag"
            />
            <p className="mt-1 text-xs text-slate-500">Categorize this customer into a new tag. Use a comma for more than one. Created when you press Save, then usable in campaigns.</p>
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save</Button>
        </div>
      </form>
    </div>
  );
}

const LIST_CATEGORIES = [
  { id: "", label: "No category for this file" },
  { id: "lead", label: "Lead" },
  { id: "customer", label: "Customer" },
  { id: "event_attendee", label: "Event attendee" },
  { id: "demo_requested", label: "Demo requested" },
];

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [demo, setDemo] = useState(false);
  const importCsv = useMutation({
    mutationFn: () => api.importContacts(file!, { duplicate: "update", category, label: label.trim(), demo }),
    onSuccess: (result) => {
      const used = Object.entries(result.columns).map(([field, header]) => `${field} from “${header}”`).join(", ");
      const categoryNote = result.category ? ` Tagged ${result.category}.` : "";
      const labelNote = result.labels.length > 0 ? ` Also tagged ${result.labels.join(", ")}.` : "";
      const demoNote = result.demo ? " Marked Demo data." : "";
      toast.success(`Created ${result.created}, updated ${result.updated}, invalid ${result.invalid}.${categoryNote}${labelNote}${demoNote} ${used}`);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink-950/40 p-4">
      <form className="panel w-full max-w-lg space-y-3 p-5" onSubmit={(event) => { event.preventDefault(); if (file) importCsv.mutate(); }}>
        <h2 className="text-lg font-semibold">Import contacts</h2>
        <p className="text-sm text-slate-500">CSV or Excel. Headers such as Email, E-mail, Name, First Name, last_name, and tags are recognized in any case. A tags column is optional.</p>
        <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <Field label="File category">
          <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
            {LIST_CATEGORIES.map((item) => <option key={item.id || "none"} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <p className="text-sm text-slate-500">The category is applied to every row. Tags already in the file are kept as well.</p>
        <Field label="Event, month, or other tag">
          <input className={inputClass} value={label} maxLength={240} placeholder="October 2026 launch" onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <p className="text-sm text-slate-500">Optional. This name is added to every row, then shows up in the tag filter and in campaign audiences. Use a comma for more than one, such as Diwali meetup, October 2026.</p>
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} />
          <span>This is a demo file. Every row is also tagged Demo data, so the trial list can be filtered and deleted later.</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!file || importCsv.isPending}>Import</Button>
        </div>
      </form>
    </div>
  );
}
