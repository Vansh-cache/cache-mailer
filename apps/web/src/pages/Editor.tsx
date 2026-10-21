import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor as useTipTap } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, Eye, GripVertical, Image as ImageIcon, LayoutTemplate, Minus, MousePointerClick, MoveVertical, Pencil, Plus, Redo2, Send, SlidersHorizontal, Sparkles, Trash2, Type, Undo2, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { Button, inputClass } from "../components/ui";
import { api, mediaPath, type Block, type Section } from "../lib/api";
import { uid } from "../lib/uid";
import { addBlock, blockSection, designFromStore, useEditor } from "../store/editor";

const compactInput = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-ink-900 shadow-sm transition placeholder:text-slate-400 focus:border-tide-600 focus:ring-2 focus:ring-tide-600/20";
const toolbarButton = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 shadow-sm transition hover:border-tide-600 hover:text-tide-700 disabled:cursor-not-allowed disabled:opacity-40";

export function EditorPage() {
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const template = useQuery({ queryKey: ["template", id], queryFn: () => api.template(id) });
  const load = useEditor((state) => state.load);
  const dirty = useEditor((state) => state.dirty);
  const canUndo = useEditor((state) => state.past.length > 0);
  const canRedo = useEditor((state) => state.future.length > 0);
  const name = useEditor((state) => state.name);
  const compose = useEditor((state) => state.settings.compose ?? "blocks");
  const [mode, setMode] = useState<"view" | "edit">("view");
  useEffect(() => {
    if (template.data) load(template.data.template.name, template.data.template.designJson);
  }, [template.data, load]);
  const save = useMutation({
    mutationFn: () => api.saveTemplate(id, { name: useEditor.getState().name, design: designFromStore() }),
    onSuccess: async () => {
      useEditor.getState().markClean();
      toast.success("Saved");
      await queryClient.invalidateQueries({ queryKey: ["template", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (useEditor.getState().dirty) save.mutate();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [save]);
  if (!template.data) return <div className="grid h-[calc(100vh-3rem)] place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">Loading editor...</div>;
  const nameInput = (
    <input
      className="h-9 min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-ink-950 transition placeholder:text-slate-400 hover:border-slate-200 focus:border-tide-600 focus:bg-white focus:ring-2 focus:ring-tide-600/20 sm:max-w-xs"
      value={name}
      onChange={(event) => useEditor.getState().setName(event.target.value)}
      aria-label="Template name"
      placeholder="Template name"
    />
  );
  const statusDot = (
    <span className={`hidden items-center gap-1.5 text-xs font-medium lg:inline-flex ${dirty ? "text-amber-600" : "text-emerald-600"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dirty ? "bg-amber-500" : "bg-emerald-500"}`} />
      {dirty ? "Unsaved changes" : "Saved"}
    </span>
  );
  const saveButton = (
    <Button className="h-8 rounded-lg px-3.5 py-0 text-[13px] shadow-sm" onClick={() => save.mutate()} disabled={save.isPending}>
      {dirty ? "Save" : <span className="inline-flex items-center gap-1"><Check size={14} /> Saved</span>}
    </Button>
  );
  const composeToggle = (
    <button
      type="button"
      className={toolbarButton}
      onClick={() => useEditor.getState().change((draft) => { draft.settings.compose = draft.settings.compose === "plain" ? "blocks" : "plain"; })}
    >
      <Type size={14} />
      {compose === "plain" ? "Block editor" : "Plain writing"}
    </button>
  );
  return (
    <div className="flex h-[calc(100vh-3rem)] min-w-0 flex-col gap-2.5 overflow-hidden">
      {mode === "view" ? (
        <header className="shrink-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div className="flex min-h-12 flex-wrap items-center gap-1.5 px-3 py-2">
            <button type="button" className={`${toolbarButton} w-8 px-0`} onClick={() => navigate("/templates")} title="Back to Email Templates" aria-label="Back to Email Templates">
              <ArrowLeft size={15} />
            </button>
            {nameInput}
            {statusDot}
            <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
            <PreviewButton />
            {composeToggle}
            <div className="ml-auto flex items-center gap-1.5">
              {saveButton}
              <Button className="h-8 rounded-lg px-4 py-0 text-[13px] shadow-sm" onClick={() => setMode("edit")}>
                <span className="inline-flex items-center gap-1.5"><Pencil size={14} /> Edit</span>
              </Button>
            </div>
          </div>
          <TestSend templateId={id} />
        </header>
      ) : (
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <button type="button" className={toolbarButton} onClick={() => setMode("view")} title="Back to template view" aria-label="Back to template view">
            <ArrowLeft size={14} /> Back
          </button>
          {nameInput}
          <span className="rounded-full bg-tide-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Editing</span>
          {statusDot}
          <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          <button type="button" className={`${toolbarButton} w-8 px-0`} onClick={() => useEditor.getState().undo()} disabled={!canUndo} title="Undo" aria-label="Undo">
            <Undo2 size={14} />
          </button>
          <button type="button" className={`${toolbarButton} w-8 px-0`} onClick={() => useEditor.getState().redo()} disabled={!canRedo} title="Redo" aria-label="Redo">
            <Redo2 size={14} />
          </button>
          <PreviewButton />
          {composeToggle}
          <div className="ml-auto">{saveButton}</div>
        </header>
      )}
      <EditorBody mode={mode} />
    </div>
  );
}

function EditorBody({ mode }: { mode: "view" | "edit" }) {
  const compose = useEditor((state) => state.settings.compose ?? "blocks");
  const plainBody = useEditor((state) => state.settings.plainBody ?? "");
  if (compose === "plain") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <div>
            <h2 className="text-[13px] font-semibold text-ink-950">Plain writing</h2>
            <p className="text-[11px] text-slate-500">Write naturally. Use {"{{first_name | there}}"} to personalise the greeting.</p>
          </div>
          <span className="rounded-full bg-tide-50 px-2 py-0.5 text-[11px] font-medium text-tide-700">{mode === "edit" ? "Editing" : "Text email"}</span>
        </div>
        <textarea
          readOnly={mode === "view"}
          className={`min-h-0 w-full flex-1 resize-none px-6 py-5 font-serif text-[17px] leading-8 text-ink-900 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-tide-600/20 ${mode === "view" ? "bg-slate-50/50" : "bg-white"}`}
          value={plainBody}
          placeholder="Write the email as plain text. Use {{first_name | there}} for a name."
          onChange={(event) => useEditor.getState().change((draft) => { draft.settings.plainBody = event.target.value; })}
        />
      </div>
    );
  }
  if (mode === "view") {
    return (
      <div className="min-h-0 min-w-0 flex-1">
        <Canvas editable={false} maxScale={1.6} />
      </div>
    );
  }
  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-2.5">
      <EditPanel />
      <Canvas editable maxScale={1.3} />
    </div>
  );
}

const SECTION_META: { id: Section; title: string; hint: string; addHint: string }[] = [
  { id: "header", title: "Header", hint: "Top of the email - banner image, logo or title. The first thing people see.", addHint: "Add to header" },
  { id: "body", title: "Body", hint: "Your main message - text, images and buttons.", addHint: "Add to body" },
  { id: "footer", title: "Footer", hint: "Closing lines, small print and links. Company name, address and unsubscribe are added automatically below.", addHint: "Add to footer" },
];

function sectionMeta(section: Section) {
  return SECTION_META.find((item) => item.id === section) ?? SECTION_META[1];
}
const BLOCK_BUTTONS: { type: Block["type"]; label: string; short: string; detail: string; icon: LucideIcon }[] = [
  { type: "text", label: "Text", short: "Text", detail: "Headline or paragraph", icon: Type },
  { type: "image", label: "Image", short: "Image", detail: "Banner, photo or logo", icon: ImageIcon },
  { type: "button", label: "Button", short: "Button", detail: "Clickable call-to-action", icon: MousePointerClick },
  { type: "divider", label: "Divider line", short: "Divider", detail: "Thin separator line", icon: Minus },
  { type: "spacer", label: "Empty space", short: "Space", detail: "Blank vertical gap", icon: MoveVertical },
];

const BLOCK_CARD_META: Record<Block["type"], { label: string; icon: LucideIcon }> = {
  text: { label: "Content section", icon: Type },
  image: { label: "Image section", icon: ImageIcon },
  button: { label: "CTA button", icon: MousePointerClick },
  divider: { label: "Divider", icon: Minus },
  spacer: { label: "Empty space", icon: MoveVertical },
};

function EditPanel() {
  const navigate = useNavigate();
  const activeSection = useEditor((state) => state.activeSection);
  const blocks = useEditor((state) => state.blocks);
  const selectedId = useEditor((state) => state.selectedId);
  const settings = useEditor((state) => state.settings);
  const meta = sectionMeta(activeSection);
  const sectionBlocks = blocks.filter((block) => blockSection(block) === activeSection);
  const countFor = (section: Section) => blocks.filter((block) => blockSection(block) === section).length;
  const [globalOpen, setGlobalOpen] = useState(false);
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`block-card-${selectedId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId, activeSection]);

  const move = (block: Block, direction: -1 | 1) => useEditor.getState().change((draft) => {
    const index = draft.blocks.findIndex((item) => item.id === block.id);
    const next = index + direction;
    if (next < 0 || next >= draft.blocks.length) return;
    const neighbor = draft.blocks[next];
    if (!neighbor || blockSection(neighbor) !== blockSection(block)) return;
    const [item] = draft.blocks.splice(index, 1);
    if (item) draft.blocks.splice(next, 0, item);
  });
  const duplicate = (block: Block) => useEditor.getState().change((draft) => {
    const index = draft.blocks.findIndex((item) => item.id === block.id);
    const original = draft.blocks[index];
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original)) as Block;
    copy.id = uid();
    draft.blocks.splice(index + 1, 0, copy);
    useEditor.getState().select(copy.id);
  });
  const remove = (block: Block) => useEditor.getState().change((draft) => {
    draft.blocks = draft.blocks.filter((item) => item.id !== block.id);
  });
  const cardAction = "grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-tide-600 hover:text-tide-700 disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <div className="shrink-0 border-b border-slate-100 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-tide-700 text-white"><LayoutTemplate size={12} /></span>
          <h3 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-950">Sections <span className="font-normal text-slate-400">({blocks.length})</span></h3>
          <span className="truncate text-[10px] text-slate-400" title={meta.hint}>{meta.title} selected</span>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-0.5">
          {SECTION_META.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => useEditor.getState().setActiveSection(item.id)}
              className={`rounded-md px-1 py-1 text-[11px] leading-tight transition ${activeSection === item.id ? "bg-tide-700 font-semibold text-white shadow-sm" : "font-medium text-slate-600 hover:bg-white hover:text-ink-950"}`}
            >
              {item.title} <span className={`text-[10px] font-normal ${activeSection === item.id ? "text-white/75" : "text-slate-400"}`}>({countFor(item.id)})</span>
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-tide-700 px-2 py-1 text-white shadow-sm">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white" />
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">Editing: {meta.title}</span>
          <span className="truncate text-[10px] text-white/70">{meta.hint}</span>
        </div>
        <div className="mt-1.5 flex flex-nowrap gap-1 overflow-x-auto pb-0.5">
          {BLOCK_BUTTONS.map((item) => (
            <button
              key={item.type}
              type="button"
              className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm transition hover:border-tide-600 hover:text-tide-700"
              onClick={() => addBlock(item.type, activeSection)}
              title={`Add ${item.label.toLowerCase()} to the ${meta.title.toLowerCase()} - ${item.detail.toLowerCase()}`}
            >
              <Plus size={12} className="text-tide-700" />
              <item.icon size={12} className="text-tide-700" />
              {item.short}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-2.5 py-2">
        {sectionBlocks.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-8 text-center">
            <LayoutTemplate size={28} className="mx-auto text-slate-300" />
            <p className="mt-2 text-[13px] font-semibold text-ink-900">Blank {meta.title} (No Sections Added)</p>
            <p className="mx-auto mt-1 max-w-60 text-[11px] leading-relaxed text-slate-500">Click any add button above to add Text, Image, Button, Divider or Empty space sections in whatever order you prefer.</p>
          </div>
        )}
        {sectionBlocks.map((block, index) => {
          const card = BLOCK_CARD_META[block.type];
          const selected = selectedId === block.id;
          return (
            <article
              key={block.id}
              id={`block-card-${block.id}`}
              className={`overflow-hidden rounded-2xl border bg-white transition ${selected ? "border-tide-600 shadow-[0_10px_28px_rgba(15,118,110,0.22)] ring-2 ring-tide-600" : "border-slate-200 shadow-sm"}`}
              onClick={() => useEditor.getState().select(block.id)}
            >
              <header className={`flex items-center gap-1.5 border-b px-2.5 py-2 ${selected ? "border-tide-700 bg-tide-700 text-white" : "border-slate-100"}`}>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${selected ? "bg-white text-tide-700" : "bg-tide-700 text-white"}`}>#{index + 1}</span>
                <card.icon size={13} className={`shrink-0 ${selected ? "text-white" : "text-tide-700"}`} />
                <span className={`min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide ${selected ? "text-white" : "text-ink-900"}`}>{card.label}</span>
                {selected && <span className="mr-0.5 hidden shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-white/85 sm:inline-flex"><span className="h-1 w-1 animate-pulse rounded-full bg-white" /> Editing</span>}
                <button type="button" className={cardAction} disabled={index === 0} onClick={(event) => { event.stopPropagation(); move(block, -1); }} title="Move up" aria-label="Move block up"><ArrowUp size={13} /></button>
                <button type="button" className={cardAction} disabled={index === sectionBlocks.length - 1} onClick={(event) => { event.stopPropagation(); move(block, 1); }} title="Move down" aria-label="Move block down"><ArrowDown size={13} /></button>
                <button type="button" className={cardAction} onClick={(event) => { event.stopPropagation(); duplicate(block); }} title="Duplicate block" aria-label="Duplicate block"><Copy size={13} /></button>
                <button type="button" className={`${cardAction} hover:border-rose-300 hover:text-rose-600`} onClick={(event) => { event.stopPropagation(); remove(block); }} title="Delete block" aria-label="Delete block"><Trash2 size={13} /></button>
              </header>
              {block.type !== "image" && (
                <div className="pointer-events-none max-h-24 overflow-hidden border-b border-slate-100 px-1 py-1" style={{ background: settings.contentBg }}>
                  <BlockView block={block} />
                </div>
              )}
              <div className="px-2.5 py-2 [&_label>span]:mb-1 [&_label>span]:text-[11px] [&_label>span]:font-semibold [&_label>span]:text-slate-600">
                <BlockSettings block={block} />
              </div>
            </article>
          );
        })}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setGlobalOpen((open) => !open)} aria-expanded={globalOpen}>
            <SlidersHorizontal size={14} className="shrink-0 text-tide-700" />
            <h4 className="flex-1 text-[12px] font-semibold text-ink-950">Global Container &amp; Font Styling</h4>
            <span className="text-[11px] font-medium text-tide-700">{globalOpen ? "Hide" : "Show"}</span>
          </button>
          {globalOpen && (
          <div className="space-y-3 border-t border-slate-100 px-3 py-3">
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">Email Container Width <span className="font-bold text-tide-700">{settings.width}px</span></span>
              <input
                type="range"
                min={320}
                max={800}
                step={10}
                value={settings.width}
                onChange={(event) => useEditor.getState().change((draft) => { draft.settings.width = Number(event.target.value); })}
                className="w-full accent-teal-700"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Outer Background</span>
                <span className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 shadow-sm">
                  <input type="color" value={settings.outerBg} onChange={(event) => useEditor.getState().change((draft) => { draft.settings.outerBg = event.target.value; })} className="h-6 w-8 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0" />
                  <span className="truncate text-[11px] text-slate-500">{settings.outerBg}</span>
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Content Background</span>
                <span className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 shadow-sm">
                  <input type="color" value={settings.contentBg} onChange={(event) => useEditor.getState().change((draft) => { draft.settings.contentBg = event.target.value; })} className="h-6 w-8 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0" />
                  <span className="truncate text-[11px] text-slate-500">{settings.contentBg}</span>
                </span>
              </label>
            </div>
            <UnsubscribeControl />
          </div>
          )}
        </section>

        <button type="button" className={`${toolbarButton} w-full`} onClick={() => navigate("/templates")}>
          <Sparkles size={14} /> Browse starter templates
        </button>
      </div>
    </aside>
  );
}

function Canvas({ editable, maxScale }: { editable: boolean; maxScale: number }) {
  const blocks = useEditor((state) => state.blocks);
  const settings = useEditor((state) => state.settings);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const sensors = useSensors(useSensor(PointerSensor));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeBlock = blocks.find((block) => block.id === active.id);
    const overBlock = blocks.find((block) => block.id === over.id);
    if (!activeBlock || !overBlock || blockSection(activeBlock) !== blockSection(overBlock)) return;
    useEditor.getState().change((draft) => {
      const from = draft.blocks.findIndex((block) => block.id === active.id);
      const to = draft.blocks.findIndex((block) => block.id === over.id);
      draft.blocks = arrayMove(draft.blocks, from, to);
    });
  };
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const styles = getComputedStyle(frame);
      const pad = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const available = frame.clientWidth - pad;
      const next = settings.width > 0 ? Math.min(maxScale, available / settings.width) : 1;
      setScale(next > 0 ? next : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [settings.width, maxScale]);
  return (
    <div ref={frameRef} className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-200/70 p-4 shadow-inner" style={{ background: settings.outerBg }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <div
            className="mx-auto overflow-hidden rounded-md shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/10"
            style={{
              width: settings.width,
              zoom: scale,
              background: settings.contentBg,
            }}
          >
            {SECTION_META.map((meta) => (
              <SectionBand key={meta.id} section={meta.id} blocks={blocks.filter((block) => blockSection(block) === meta.id)} editable={editable} />
            ))}
            <p className="border-t border-slate-100 px-6 py-3 text-center text-[11px] text-slate-400">
              Automatic footer: your company name and address{settings.includeUnsubscribe ? " · Unsubscribe" : ""} - change these in Settings.
            </p>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

const SECTION_EMPTY: Record<Section, { label: string; type: Block["type"] }> = {
  header: { label: "banner image", type: "image" },
  body: { label: "text block", type: "text" },
  footer: { label: "footer text", type: "text" },
};

function SectionBand({ section, blocks, editable }: { section: Section; blocks: Block[]; editable: boolean }) {
  const meta = sectionMeta(section);
  const selectedId = useEditor((state) => state.selectedId);
  const activeSection = useEditor((state) => state.activeSection);
  const hasSelected = blocks.some((block) => block.id === selectedId);
  const isActive = activeSection === section;
  const showActive = editable && isActive;
  return (
    <section
      className={`border-b transition-colors ${showActive ? "border-tide-600 bg-tide-50/70" : hasSelected ? "border-tide-600" : "border-slate-200"}`}
      style={showActive ? { boxShadow: "inset 5px 0 0 #0f766e" } : undefined}
    >
      <header
        className={`flex items-center justify-between gap-2 px-3 ${showActive ? "py-1.5" : "py-1"} ${editable ? "cursor-pointer" : ""} ${showActive ? "bg-tide-700 text-white shadow-sm" : "bg-slate-50 text-slate-600"}`}
        onClick={() => { if (editable) useEditor.getState().setActiveSection(section); }}
        title={editable ? `Add content to the ${meta.title.toLowerCase()}` : meta.title}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]">
          {showActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
          {meta.title}
        </span>
        {showActive ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="hidden truncate text-[10px] text-white/75 sm:inline">{meta.hint}</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-tide-700">Active</span>
          </span>
        ) : (
          <span className="truncate text-[10px] text-slate-400">{meta.hint}</span>
        )}
      </header>
      {blocks.map((block) => <SortableBlock key={block.id} block={block} editable={editable} />)}
      {blocks.length === 0 && (editable ? (
        <button
          type="button"
          className="m-2.5 block w-[calc(100%-1.25rem)] rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 py-3 text-[13px] text-slate-500 transition hover:border-tide-600 hover:bg-tide-50 hover:text-tide-700"
          onClick={() => addBlock(SECTION_EMPTY[section].type, section)}
        >
          <Plus size={14} className="mr-1 inline" /> Add a {SECTION_EMPTY[section].label} to the {meta.title.toLowerCase()}
        </button>
      ) : (
        <p className="px-6 py-3 text-center text-[11px] italic text-slate-300">No {meta.title.toLowerCase()} content</p>
      ))}
    </section>
  );
}

function SortableBlock({ block, editable }: { block: Block; editable: boolean }) {
  const selected = useEditor((state) => state.selectedId === block.id);
  const sortable = useSortable({ id: block.id, disabled: !editable });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const isSelected = editable && selected;
  return (
    <div ref={sortable.setNodeRef} style={style} className={`group relative transition-shadow ${isSelected ? "z-10 shadow-[0_10px_30px_rgba(15,118,110,0.25)] ring-[3px] ring-inset ring-tide-600" : editable ? "hover:ring-1 hover:ring-inset hover:ring-tide-300" : ""}`} onClick={() => { if (editable) useEditor.getState().select(block.id); }}>
      {editable && (
        <button className="absolute left-1 top-1 z-20 hidden h-6 w-6 cursor-grab place-items-center rounded-md bg-white/90 text-slate-400 shadow-sm ring-1 ring-slate-200 group-hover:grid" {...sortable.attributes} {...sortable.listeners}><GripVertical size={13} /></button>
      )}
      {isSelected && (
        <span className="pointer-events-none absolute -top-2 left-2 z-30 inline-flex items-center gap-1 rounded-full bg-tide-700 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-md">
          <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
          Editing - {sectionMeta(blockSection(block)).title} · {BLOCK_CARD_META[block.type].label}
        </span>
      )}
      <BlockView block={block} editing={isSelected} />
    </div>
  );
}

// Some older starter templates used a placehold.co picture with the title
// baked into the image (e.g. ".../0f766e/ffffff?text=Welcome"). Words inside
// a picture can never be typed over, so we detect that shape and offer a
// one-click conversion to a real, editable text banner.
function bakedBanner(src: string): { text: string; color: string } | null {
  const match = /placehold\.co\/\d+x\d+\/([0-9a-f]{3,8})\/(?:[0-9a-f]{3,8})(?:\.[a-z]+)?\?text=([^&]+)/i.exec(src);
  if (!match) return null;
  try {
    return { text: decodeURIComponent(match[2].replace(/\+/g, " ")).trim(), color: `#${match[1]}` };
  } catch {
    return null;
  }
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Best-effort dominant colour of an already-loaded image, so a converted
// title banner keeps roughly the picture's background colour.
function sampleImageColor(src: string): string | null {
  try {
    const file = src.split("/").pop()?.split(/[?#]/)[0];
    const img = [...document.images].find((candidate) => candidate.naturalWidth > 0 && (candidate.currentSrc === src || (file !== undefined && candidate.currentSrc.includes(file))));
    if (!img) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(img, 0, 0, 16, 16);
    const data = context.getImageData(0, 0, 16, 16).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 16) {
      if (data[index + 3] < 200) continue;
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      count += 1;
    }
    if (count === 0) return null;
    const hex = (value: number) => Math.round(value / count).toString(16).padStart(2, "0");
    return `#${hex(red)}${hex(green)}${hex(blue)}`;
  } catch {
    return null;
  }
}

function convertImageToTitle(block: Extract<Block, { type: "image" }>): void {
  const baked = bakedBanner(block.src);
  const title = baked?.text || block.alt.trim() || block.overlayHeading?.trim() || "Your title";
  const lines: string[] = [];
  for (const extra of [block.overlayHeading, block.overlayText]) {
    const line = extra?.trim();
    if (line && line !== title && !lines.includes(line)) lines.push(line);
  }
  const html = [
    `<p><span style="color:#ffffff"><strong>${escapeText(title)}</strong></span></p>`,
    ...lines.map((line) => `<p><span style="color:#ffffff;font-size:16px">${escapeText(line)}</span></p>`),
  ].join("");
  useEditor.getState().change((draft) => {
    const index = draft.blocks.findIndex((item) => item.id === block.id);
    if (index === -1) return;
    draft.blocks[index] = {
      id: block.id,
      section: block.section,
      type: "text",
      html,
      style: { fontSize: 34, align: "center", padding: "36px 40px", bg: baked?.color || block.overlayBg || sampleImageColor(block.src) || "#0f766e" },
    };
  });
}

function BlockView({ block, editing = false }: { block: Block; editing?: boolean }) {
  const saveField = (field: "overlayHeading" | "overlayText" | "label", next: string) => {
    useEditor.getState().change((draft) => {
      const current = draft.blocks.find((item) => item.id === block.id);
      if (!current) return;
      if (current.type === "image" && (field === "overlayHeading" || field === "overlayText")) current[field] = next;
      if (current.type === "button" && field === "label" && next) current.label = next;
    });
  };
  switch (block.type) {
    case "text":
      if (editing) return <CanvasRichText block={block} />;
      return <div className="prose prose-sm max-w-none" style={{ fontSize: block.style.fontSize, textAlign: block.style.align, padding: block.style.padding, background: block.style.bg === "transparent" ? undefined : block.style.bg }} dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "image": {
      const heading = block.overlayHeading?.trim();
      const overlayText = block.overlayText?.trim();
      if (heading || overlayText) {
        return (
          <div className="relative overflow-hidden" style={{ background: block.overlayBg || "#0f766e", textAlign: block.align }}>
            <img src={mediaPath(block.src)} alt={block.alt} className="absolute inset-0 h-full w-full object-cover" />
            <div className="relative px-6 py-9" style={{ color: block.overlayColor || "#ffffff" }}>
              {editing ? (
                <>
                  <p className="text-[26px] font-bold leading-8">
                    <InlineEdit value={heading ?? ""} placeholder="Banner heading - click to write" onSave={(next) => saveField("overlayHeading", next)} />
                  </p>
                  <p className="mt-1.5 text-base leading-6">
                    <InlineEdit value={overlayText ?? ""} placeholder="Banner line - click to write" onSave={(next) => saveField("overlayText", next)} />
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide opacity-70">Click the words above to edit them here</p>
                  <button
                    type="button"
                    className="mt-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-tide-800 shadow transition hover:bg-tide-50"
                    onClick={(event) => { event.stopPropagation(); convertImageToTitle(block); }}
                    title="The big title is part of the picture - turn it into editable text"
                  >
                    &#9998; Make the big picture title editable instead
                  </button>
                </>
              ) : (
                <>
                  {heading && <p className="text-[26px] font-bold leading-8">{heading}</p>}
                  {overlayText && <p className="mt-1.5 text-base leading-6">{overlayText}</p>}
                </>
              )}
            </div>
          </div>
        );
      }
      const baked = bakedBanner(block.src);
      return (
        <span className="relative block">
          <img src={mediaPath(block.src)} alt={block.alt} className={`block max-w-full ${block.align === "left" ? "mr-auto" : block.align === "right" ? "ml-auto" : "mx-auto"}`} style={{ width: block.width === "100%" ? "100%" : block.width }} />
          {editing && (
            <button
              type="button"
              className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-tide-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg ring-2 ring-white/70 transition hover:bg-tide-800"
              onClick={(event) => { event.stopPropagation(); convertImageToTitle(block); }}
              title="Words inside a picture cannot be edited - turn them into real editable text on a colour banner"
            >
              &#9998; Make &ldquo;{baked?.text || block.alt.trim() || "title"}&rdquo; editable text
            </button>
          )}
        </span>
      );
    }
    case "button":
      return (
        <div style={{ textAlign: block.style.align }} className="px-6 py-3">
          <span className="inline-block px-4 py-2" style={{ background: block.style.bg, color: block.style.color, borderRadius: block.style.radius }}>
            {editing ? <InlineEdit value={block.label} placeholder="Button text" onSave={(next) => saveField("label", next)} /> : block.label}
          </span>
        </div>
      );
    case "divider":
      return <hr style={{ borderColor: block.style.color, borderTopWidth: block.style.height }} />;
    case "spacer":
      return <div style={{ height: block.height }} />;
    default: {
      const neverBlock: never = block;
      return neverBlock;
    }
  }
}

function UnsubscribeControl() {
  const includeUnsubscribe = useEditor((state) => state.settings.includeUnsubscribe === true);
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-tide-100 bg-tide-50/60 px-2.5 py-2">
      <input
        className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
        type="checkbox"
        checked={includeUnsubscribe}
        onChange={(event) => useEditor.getState().change((draft) => { draft.settings.includeUnsubscribe = event.target.checked; })}
      />
      <span className="text-[11px] leading-snug text-slate-600">
        <span className="block text-[12px] font-semibold text-ink-900">Unsubscribe link</span>
        Add it to the footer for launches and bulk campaigns.
      </span>
    </label>
  );
}

function SavedImages({ currentSrc, onPick }: { currentSrc: string; onPick: (url: string) => void }) {
  const assets = useQuery({ queryKey: ["assets"], queryFn: api.assets });
  const saved = assets.data?.assets ?? [];
  if (assets.isLoading) return <p className="text-[11px] text-slate-400">Loading saved images...</p>;
  if (saved.length === 0) return <p className="text-[11px] leading-snug text-slate-400">No saved images yet. Upload one above - it is stored on the server and will appear here for reuse in any template.</p>;
  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5">
        {saved.map((asset) => {
          const path = mediaPath(asset.url);
          const selected = mediaPath(currentSrc) === path;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => onPick(path)}
              title={asset.fileName}
              className={`h-12 overflow-hidden rounded-lg border bg-slate-50 transition ${selected ? "border-tide-600 ring-2 ring-tide-600/30" : "border-slate-200 hover:border-tide-600"}`}
            >
              <img src={path} alt={asset.fileName} className="h-full w-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">Saved on the server - click any image to use it. No need to upload again.</p>
    </div>
  );
}

function BlockSettings({ block }: { block: Block }) {
  const queryClient = useQueryClient();
  const patch = (recipe: (current: Block) => void) => useEditor.getState().change((draft) => {
    const current = draft.blocks.find((item) => item.id === block.id);
    if (current) recipe(current);
  });
  const alignSelect = (value: "left" | "center" | "right", apply: (next: "left" | "center" | "right") => void) => (
    <label className="block">
      <span className="mb-1 block font-medium">Alignment</span>
      <select className={inputClass} value={value} onChange={(event) => apply(event.target.value as "left" | "center" | "right")}>
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </label>
  );
  switch (block.type) {
    case "text": {
      const hasBg = block.style.bg !== "transparent";
      return (
        <div className="space-y-2.5">
          <TextTools blockId={block.id} html={block.html} bg={block.style.bg} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block font-medium">Text size (px)</span>
              <input className={inputClass} type="number" min={10} max={40} value={block.style.fontSize} onChange={(event) => patch((current) => { if (current.type === "text") current.style.fontSize = Number(event.target.value); })} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Padding</span>
              <select className={inputClass} value={block.style.padding} onChange={(event) => patch((current) => { if (current.type === "text") current.style.padding = event.target.value; })}>
                <option value="8px 20px">Compact</option>
                <option value="12px 28px">Normal</option>
                <option value="24px 32px">Large</option>
                <option value="36px 40px">Banner</option>
              </select>
            </label>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-ink-900">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-700"
                checked={hasBg}
                onChange={(event) => patch((current) => { if (current.type === "text") current.style.bg = event.target.checked ? "#0f766e" : "transparent"; })}
              />
              Background colour behind this text
            </label>
            {hasBg && (
              <span className="mt-2 block rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm">
                <span className="flex items-center gap-2">
                  <input type="color" value={block.style.bg} onChange={(event) => patch((current) => { if (current.type === "text") current.style.bg = event.target.value; })} className="h-7 w-12 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0" aria-label="Background colour value" />
                  <span className="text-[12px] font-semibold text-ink-900">{block.style.bg}</span>
                </span>
                <span className="mt-1.5 block text-[11px] leading-snug text-slate-500">Pick green, blue, any colour. Then make the words light with the text colour picker (A) in the toolbar above.</span>
              </span>
            )}
          </div>
          {alignSelect(block.style.align, (next) => patch((current) => { if (current.type === "text") current.style.align = next; }))}
        </div>
      );
    }
    case "image": {
      const baked = bakedBanner(block.src);
      return (
        <div className="space-y-2.5">
          <div className="rounded-xl border border-tide-200 bg-tide-50 px-2.5 py-2">
            <p className="text-[11px] leading-snug text-tide-900">
              {baked ? (
                <>The title <strong>&ldquo;{baked.text}&rdquo;</strong> is part of this picture, so it cannot be typed over.</>
              ) : (
                <>If the title you see (for example <strong>&ldquo;{block.alt.trim() || "Welcome"}&rdquo;</strong>) is inside this picture, it cannot be typed over - words in a picture are not text.</>
              )}{" "}
              Convert it to a real text banner on a colour background, then click the title in the preview and write anything you want.
            </p>
            <button
              type="button"
              className="mt-2 w-full rounded-lg bg-tide-700 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-tide-800"
              onClick={() => convertImageToTitle(block)}
            >
              &#9998; Make the title editable text
            </button>
            <p className="mt-1 text-[10px] leading-snug text-tide-700/70">This removes the picture. You can Undo (top bar) if you change your mind.</p>
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Upload image (saved on the server)</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const uploaded = await api.upload(file);
                patch((current) => { if (current.type === "image") current.src = uploaded.asset.url; });
                await queryClient.invalidateQueries({ queryKey: ["assets"] });
                toast.success("Image saved on the server");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Upload failed");
              }
            }} />
            <span className="mt-1 block text-xs text-slate-500">JPG, PNG, GIF or WebP. Stored permanently on the server, so it stays in the template wherever the app runs.</span>
          </label>
          <div className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Saved images</span>
            <SavedImages currentSrc={block.src} onPick={(url) => patch((current) => { if (current.type === "image") current.src = url; })} />
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">...or image web address (URL)</span>
            <input className={inputClass} value={block.src} onChange={(event) => patch((current) => { if (current.type === "image") current.src = event.target.value; })} placeholder="https://..." />
            <span className="mt-1 block text-xs text-slate-500">For people outside this office, use a public https:// address, not 127.0.0.1 or a local file.</span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Alt text</span>
            <input className={inputClass} placeholder="Describe the image" value={block.alt} onChange={(event) => patch((current) => { if (current.type === "image") current.alt = event.target.value; })} />
            <span className="mt-1 block text-xs text-slate-500">Shown when images are blocked, and read aloud by screen readers.</span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">When clicked, open this link (optional)</span>
            <input className={inputClass} placeholder="https://..." value={block.href ?? ""} onChange={(event) => patch((current) => { if (current.type === "image") current.href = event.target.value; })} />
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Image size</span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${block.width === "100%" ? "bg-tide-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                onClick={() => patch((current) => { if (current.type === "image") current.width = "100%"; })}
              >
                Fit tab width
              </button>
              <button
                type="button"
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${block.width !== "100%" ? "bg-tide-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                onClick={() => patch((current) => { if (current.type === "image" && current.width === "100%") current.width = "400px"; })}
              >
                Custom pixels
              </button>
            </div>
            {block.width === "100%" ? (
              <p className="mt-1.5 text-[11px] leading-snug text-slate-500">The image stretches to the full width of the email tab - it always fits, on mobile too.</p>
            ) : (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={40}
                    max={600}
                    step={5}
                    value={parseInt(block.width, 10) || 400}
                    onChange={(event) => patch((current) => { if (current.type === "image") current.width = `${event.target.value}px`; })}
                    className="min-w-0 flex-1 accent-teal-700"
                    aria-label="Image width in pixels"
                  />
                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      type="number"
                      min={40}
                      max={600}
                      value={parseInt(block.width, 10) || 400}
                      onChange={(event) => patch((current) => { if (current.type === "image") current.width = `${Math.min(600, Math.max(40, Number(event.target.value) || 40))}px`; })}
                      className="h-8 w-16 rounded-lg border border-slate-300 bg-white px-2 text-[12px]"
                      aria-label="Image width value in pixels"
                    />
                    <span className="text-[11px] text-slate-500">px</span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {[600, 400, 300, 200, 120].map((px) => (
                    <button key={px} type="button" className={`rounded-md border px-1.5 py-0.5 text-[10px] transition ${block.width === `${px}px` ? "border-tide-600 bg-tide-50 font-semibold text-tide-700" : "border-slate-200 bg-white text-slate-500 hover:border-tide-600"}`} onClick={() => patch((current) => { if (current.type === "image") current.width = `${px}px`; })}>
                      {px}px
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">Height adjusts automatically so the picture never looks stretched.</p>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Text on this image (banner)</span>
            <p className="mb-2 text-[11px] leading-snug text-slate-500">Write a heading and line - they will sit on top of the image, like a banner. Leave empty for a plain image.</p>
            <label className="mb-2 block">
              <span className="mb-1 block font-medium">Banner heading</span>
              <input className={inputClass} placeholder="e.g. New Product Launch" value={block.overlayHeading ?? ""} onChange={(event) => patch((current) => { if (current.type === "image") current.overlayHeading = event.target.value; })} />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block font-medium">Banner line</span>
              <input className={inputClass} placeholder="e.g. See what is new this season" value={block.overlayText ?? ""} onChange={(event) => patch((current) => { if (current.type === "image") current.overlayText = event.target.value; })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block font-medium">Text colour</span>
                <span className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 shadow-sm">
                  <input type="color" value={block.overlayColor ?? "#ffffff"} onChange={(event) => patch((current) => { if (current.type === "image") current.overlayColor = event.target.value; })} className="h-6 w-8 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0" />
                  <span className="truncate text-[11px] text-slate-500">{block.overlayColor ?? "#ffffff"}</span>
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Fallback colour</span>
                <span className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 shadow-sm">
                  <input type="color" value={block.overlayBg ?? "#0f766e"} onChange={(event) => patch((current) => { if (current.type === "image") current.overlayBg = event.target.value; })} className="h-6 w-8 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0" />
                  <span className="truncate text-[11px] text-slate-500">{block.overlayBg ?? "#0f766e"}</span>
                </span>
              </label>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-400">Fallback colour shows behind the text in mail apps that cannot display background images (like old Outlook).</p>
            {(() => {
              const textLum = hexLuminance(block.overlayColor ?? "#ffffff");
              const bgLum = hexLuminance(block.overlayBg ?? "#0f766e");
              if (textLum === null || bgLum === null || Math.abs(textLum - bgLum) > 0.18) return null;
              return <p className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">Banner text colour is very close to the fallback colour - the words may be hard to read in Outlook. Pick a lighter text colour or a darker fallback colour.</p>;
            })()}
          </div>
          {alignSelect(block.align, (next) => patch((current) => { if (current.type === "image") current.align = next; }))}
        </div>
      );
    }
    case "button":
      return (
        <div className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block font-medium">Button text</span>
            <input className={inputClass} value={block.label} onChange={(event) => patch((current) => { if (current.type === "button") current.label = event.target.value; })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Button opens this link</span>
            <input className={inputClass} value={block.href} onChange={(event) => patch((current) => { if (current.type === "button") current.href = event.target.value; })} placeholder="https://..." />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Button colour</span>
            <input type="color" className="h-9 w-full rounded border border-slate-200" value={block.style.bg} onChange={(event) => patch((current) => { if (current.type === "button") current.style.bg = event.target.value; })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Text colour</span>
            <input type="color" className="h-9 w-full rounded border border-slate-200" value={block.style.color} onChange={(event) => patch((current) => { if (current.type === "button") current.style.color = event.target.value; })} />
          </label>
          {(() => {
            const labelLum = hexLuminance(block.style.color);
            const bgLum = hexLuminance(block.style.bg);
            if (labelLum === null || bgLum === null || Math.abs(labelLum - bgLum) > 0.18) return null;
            return (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-amber-800">Button text is hard to see on the button colour.</p>
                <button type="button" className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-amber-700" onClick={() => patch((current) => { if (current.type === "button") current.style.color = bgLum > 0.6 ? "#1f2937" : "#ffffff"; })}>
                  Fix contrast
                </button>
              </div>
            );
          })()}
          {alignSelect(block.style.align, (next) => patch((current) => { if (current.type === "button") current.style.align = next; }))}
        </div>
      );
    case "divider":
      return (
        <div className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block font-medium">Line thickness (px)</span>
            <input className={inputClass} type="number" min={1} max={12} value={block.style.height} onChange={(event) => patch((current) => { if (current.type === "divider") current.style.height = Number(event.target.value); })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Line colour</span>
            <input type="color" className="h-9 w-full rounded border border-slate-200" value={block.style.color} onChange={(event) => patch((current) => { if (current.type === "divider") current.style.color = event.target.value; })} />
          </label>
        </div>
      );
    case "spacer":
      return (
        <label className="block">
          <span className="mb-1 block font-medium">Empty space height (px)</span>
          <input className={inputClass} type="number" min={4} max={120} value={block.height} onChange={(event) => patch((current) => { if (current.type === "spacer") current.height = Number(event.target.value); })} />
        </label>
      );
    default: {
      const neverBlock: never = block;
      return neverBlock;
    }
  }
}

// One rich-text editor instance per place a text block is shown (panel card
// and the preview itself). Instances stay in sync: whichever one is not
// focused adopts external changes, so typing in the preview updates the
// panel and vice versa.
function useRichText(blockId: string, html: string) {
  const editor = useTipTap({
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false }), TextStyle, Color, TextAlign.configure({ types: ["paragraph"] })],
    content: html,
    onUpdate: ({ editor: current }) => {
      useEditor.getState().change((draft) => {
        const block = draft.blocks.find((item) => item.id === blockId);
        if (block && block.type === "text") block.html = current.getHTML();
      });
    },
  });
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (editor.getHTML() !== html) editor.commands.setContent(html, false);
  }, [editor, html]);
  return editor;
}

function CanvasRichText({ block }: { block: Extract<Block, { type: "text" }> }) {
  const editor = useRichText(block.id, block.html);
  if (!editor) return null;
  return (
    <div
      className="prose prose-sm max-w-none [&_.ProseMirror]:outline-none"
      style={{ fontSize: block.style.fontSize, textAlign: block.style.align, padding: block.style.padding, background: block.style.bg === "transparent" ? undefined : block.style.bg }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

function InlineEdit({ value, onSave, className, style, placeholder }: { value: string; onSave: (next: string) => void; className?: string; style?: CSSProperties; placeholder: string }) {
  return (
    <span
      key={value}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder}
      data-placeholder={placeholder}
      className={`cursor-text rounded-sm outline-none transition focus:bg-white/20 focus:ring-2 focus:ring-white/70 empty:before:text-white/60 empty:before:content-[attr(data-placeholder)] ${className ?? ""}`}
      style={style}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
        event.stopPropagation();
      }}
      onBlur={(event) => onSave(event.currentTarget.innerText.trim())}
    >
      {value}
    </span>
  );
}

function hexLuminance(color: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = match[1];
  const channel = (index: number) => {
    const srgb = parseInt(value.slice(index, index + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function htmlHasLightText(html: string): boolean {
  return /color:\s*(#fff(?:fff)?\b|#f[0-9a-f]{5}\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i.test(html);
}

function withTextColor(html: string, color: string): string {
  if (/color:\s*[^;"]+/i.test(html)) return html.replace(/color:\s*[^;"]+/gi, `color:${color}`);
  if (/<p[\s>]/i.test(html)) return html.replace(/<p>/gi, `<p><span style="color:${color}">`).replace(/<\/p>/gi, "</span></p>");
  return `<p><span style="color:${color}">${html}</span></p>`;
}

function TextTools({ blockId, html, bg }: { blockId: string; html: string; bg: string }) {
  const editor = useRichText(blockId, html);
  const contentBg = useEditor((state) => state.settings.contentBg);
  if (!editor) return null;
  // The writing box must show the same background the text will sit on in
  // the email. White banner text on the panel's old plain-white box was
  // invisible (white on white) even though it showed fine in the preview.
  const effectiveBg = bg !== "transparent" ? bg : contentBg;
  const bgLuminance = hexLuminance(effectiveBg);
  const lightText = htmlHasLightText(html);
  const invisibleRisk = bgLuminance !== null && ((bgLuminance > 0.6 && lightText) || (bgLuminance <= 0.6 && !lightText));
  const fixColor = bgLuminance !== null && bgLuminance > 0.6 ? "#1f2937" : "#ffffff";
  const setAllTextColor = () => {
    useEditor.getState().change((draft) => {
      const block = draft.blocks.find((item) => item.id === blockId);
      if (block && block.type === "text") block.html = withTextColor(block.html, fixColor);
    });
  };
  const formatButton = "grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-[12px] font-bold text-slate-600 shadow-sm transition hover:border-tide-600 hover:text-tide-700";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button className={formatButton} type="button" onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">B</button>
        <button className={`${formatButton} italic`} type="button" onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">I</button>
        <button className={`${formatButton} underline`} type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">U</button>
        <label className={`${formatButton} relative cursor-pointer overflow-hidden`} title="Text colour - select words first, or leave unselected to colour all">
          <span className="leading-none">A</span>
          <span className="absolute inset-x-1 bottom-0.5 h-1 rounded-full bg-current opacity-70" />
          <input
            type="color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Text colour"
            onChange={(event) => {
              const { from, to } = editor.state.selection;
              if (from === to) editor.chain().focus().selectAll().setColor(event.target.value).run();
              else editor.chain().focus().setColor(event.target.value).run();
            }}
          />
        </label>
        <select className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 shadow-sm focus:border-tide-600" onChange={(event) => editor.chain().focus().insertContent(event.target.value).run()} defaultValue="" aria-label="Insert merge tag">
          <option value="" disabled>Merge tag</option>
          <option value="{{first_name | there}}">First name</option>
          <option value="{{last_name}}">Last name</option>
          <option value="{{company | your company}}">Company</option>
          <option value="{{job_title}}">Job title</option>
        </select>
      </div>
      <div className="rounded-xl border border-slate-200 px-2.5 py-2 shadow-sm transition focus-within:border-tide-600 focus-within:ring-2 focus-within:ring-tide-600/20" style={{ background: effectiveBg }}>
        <EditorContent editor={editor} className="text-[13px] leading-relaxed [&_.ProseMirror]:min-h-16 [&_.ProseMirror]:outline-none" />
      </div>
      {invisibleRisk && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-amber-800">This text is hard to see on its background colour - it would look the same in the email.</p>
          <button type="button" className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-amber-700" onClick={setAllTextColor}>
            Make text {fixColor === "#ffffff" ? "white" : "dark"}
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewButton() {
  const [html, setHtml] = useState<string | null>(null);
  const [width, setWidth] = useState(600);
  const preview = useMutation({
    mutationFn: () => api.preview(designFromStore()),
    onSuccess: (result) => setHtml(result.html),
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <>
      <button type="button" className={toolbarButton} onClick={() => preview.mutate()} disabled={preview.isPending}>
        <Eye size={14} /> Preview
      </button>
      {html && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="flex h-[86vh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 px-3 py-2">
              <span className="mr-auto text-[13px] font-semibold text-ink-950">Email preview</span>
              <button type="button" className={`${toolbarButton} ${width === 600 ? "border-tide-600 bg-tide-50 text-tide-700" : ""}`} onClick={() => setWidth(600)}>Desktop</button>
              <button type="button" className={`${toolbarButton} ${width === 375 ? "border-tide-600 bg-tide-50 text-tide-700" : ""}`} onClick={() => setWidth(375)}>Mobile</button>
              <button type="button" className={toolbarButton} onClick={() => setHtml(null)}>Close</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
              <iframe title="preview" className="mx-auto h-full rounded-lg bg-white shadow-lg ring-1 ring-slate-200" style={{ width }} srcDoc={html} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TestSend({ templateId }: { templateId: number }) {
  const senders = useQuery({ queryKey: ["senders"], queryFn: api.senders });
  const contacts = useQuery({ queryKey: ["test-receivers"], queryFn: () => api.contacts("?pageSize=100") });
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const [senderId, setSenderId] = useState(0);
  const [receiver, setReceiver] = useState("");
  const [tagId, setTagId] = useState(0);
  const send = useMutation({
    mutationFn: () => api.testSend(templateId, senderId, receiver, tagId ? [tagId] : []),
    onSuccess: (result) => toast.success(
      result.truncated
        ? `Test sent to first ${result.sent.length} of ${result.matched} contacts in the selected tag`
        : `Test sent to ${result.sent.join(", ")}`,
    ),
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2">
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
        <Send size={12} className="text-tide-700" /> Test send
      </span>
      <select className={`${compactInput} w-52 flex-none`} value={senderId} onChange={(event) => setSenderId(Number(event.target.value))} aria-label="Test sender mailbox">
        <option value={0}>Choose mailbox</option>
        {senders.data?.senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.fromEmail}</option>)}
      </select>
      <select className={`${compactInput} w-48 flex-none`} value={tagId} onChange={(event) => setTagId(Number(event.target.value))} aria-label="Test receivers by tag">
        <option value={0}>Or send test to a tag...</option>
        {tags.data?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name} ({tag.count})</option>)}
      </select>
      <input
        className={`${compactInput} min-w-52 flex-1`}
        value={receiver}
        onChange={(event) => setReceiver(event.target.value)}
        placeholder="Receiver email (optional if tag chosen)"
        list="test-receiver-options"
        aria-label="Test receiver email"
      />
      <datalist id="test-receiver-options">
        {contacts.data?.contacts.map((contact) => <option key={contact.id} value={contact.email}>{contact.email}</option>)}
      </datalist>
      <button type="button" className={`${toolbarButton} h-9 shrink-0 px-3`} disabled={!senderId || (!receiver.trim() && !tagId) || send.isPending} onClick={() => send.mutate()}>
        <Send size={13} /> {send.isPending ? "Sending..." : "Send test"}
      </button>
    </div>
  );
}
