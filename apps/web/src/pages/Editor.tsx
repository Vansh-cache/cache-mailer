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
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, Eye, GripVertical, Image as ImageIcon, LayoutTemplate, Minus, MousePointerClick, MoveVertical, Plus, Redo2, Send, Sparkles, Trash2, Type, Undo2, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { HexColorPicker } from "react-colorful";
import { Button, inputClass } from "../components/ui";
import { api, type Block, type Section } from "../lib/api";
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
  return (
    <div className="flex h-[calc(100vh-3rem)] min-w-0 flex-col gap-2.5 overflow-hidden">
      <header className="shrink-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        <div className="flex min-h-12 flex-wrap items-center gap-1.5 px-3 py-2">
          <button type="button" className={`${toolbarButton} w-8 px-0`} onClick={() => navigate("/templates")} title="Back to Email Templates" aria-label="Back to Email Templates">
            <ArrowLeft size={15} />
          </button>
          <input
            className="h-9 min-w-44 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-ink-950 transition placeholder:text-slate-400 hover:border-slate-200 focus:border-tide-600 focus:bg-white focus:ring-2 focus:ring-tide-600/20 sm:max-w-xs"
            value={name}
            onChange={(event) => useEditor.getState().setName(event.target.value)}
            aria-label="Template name"
            placeholder="Template name"
          />
          <span className={`mr-1 hidden items-center gap-1.5 text-xs font-medium lg:inline-flex ${dirty ? "text-amber-600" : "text-emerald-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dirty ? "bg-amber-500" : "bg-emerald-500"}`} />
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
          <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          <button type="button" className={`${toolbarButton} w-8 px-0`} onClick={() => useEditor.getState().undo()} disabled={!canUndo} title="Undo" aria-label="Undo">
            <Undo2 size={14} />
          </button>
          <button type="button" className={`${toolbarButton} w-8 px-0`} onClick={() => useEditor.getState().redo()} disabled={!canRedo} title="Redo" aria-label="Redo">
            <Redo2 size={14} />
          </button>
          <PreviewButton />
          <button
            type="button"
            className={toolbarButton}
            onClick={() => useEditor.getState().change((draft) => { draft.settings.compose = draft.settings.compose === "plain" ? "blocks" : "plain"; })}
          >
            <Type size={14} />
            {compose === "plain" ? "Block editor" : "Plain writing"}
          </button>
          <Button className="h-8 rounded-lg px-3.5 py-0 text-[13px] shadow-sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {dirty ? "Save" : <span className="inline-flex items-center gap-1"><Check size={14} /> Saved</span>}
          </Button>
        </div>
        <TestSend templateId={id} />
      </header>
      <PlainOrBlocks />
    </div>
  );
}

function PlainOrBlocks() {
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
          <span className="rounded-full bg-tide-50 px-2 py-0.5 text-[11px] font-medium text-tide-700">Text email</span>
        </div>
        <textarea
          className="min-h-0 w-full flex-1 resize-none bg-white px-6 py-5 font-serif text-[17px] leading-8 text-ink-900 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-tide-600/20"
          value={plainBody}
          placeholder="Write the email as plain text. Use {{first_name | there}} for a name."
          onChange={(event) => useEditor.getState().change((draft) => { draft.settings.plainBody = event.target.value; })}
        />
      </div>
    );
  }
  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[228px_minmax(0,1fr)_272px] gap-2.5">
      <ContentPanel />
      <Canvas />
      <Inspector />
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
const BLOCK_BUTTONS: { type: Block["type"]; label: string; detail: string; icon: LucideIcon }[] = [
  { type: "text", label: "Text", detail: "Headline or paragraph", icon: Type },
  { type: "image", label: "Image", detail: "Banner, photo or logo", icon: ImageIcon },
  { type: "button", label: "Button", detail: "Clickable call-to-action", icon: MousePointerClick },
  { type: "divider", label: "Divider line", detail: "Thin separator line", icon: Minus },
  { type: "spacer", label: "Empty space", detail: "Blank vertical gap", icon: MoveVertical },
];

function ContentPanel() {
  const navigate = useNavigate();
  const activeSection = useEditor((state) => state.activeSection);
  const blocks = useEditor((state) => state.blocks);
  const meta = sectionMeta(activeSection);
  const countFor = (section: Section) => blocks.filter((block) => blockSection(block) === section).length;
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-3 pb-3 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Email section</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-tide-700">Step 1</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {SECTION_META.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => useEditor.getState().setActiveSection(item.id)}
                className={`rounded-lg px-1 py-1.5 text-[12px] leading-tight transition ${activeSection === item.id ? "bg-tide-700 font-semibold text-white shadow-sm" : "font-medium text-slate-600 hover:bg-white hover:text-ink-950"}`}
              >
                {item.title}
                <span className={`block text-[10px] font-normal ${activeSection === item.id ? "text-white/75" : "text-slate-400"}`}>{countFor(item.id)} item{countFor(item.id) === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{meta.hint}</p>
        </section>

        <section className="border-t border-slate-100 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Add to {meta.title}</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-tide-700">Step 2</span>
          </div>
          <div className="space-y-1">
            {BLOCK_BUTTONS.map((item) => (
              <button
                key={item.type}
                type="button"
                className="group flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:-translate-y-px hover:border-tide-600 hover:shadow"
                onClick={() => addBlock(item.type, activeSection)}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-tide-50 text-tide-700 transition group-hover:bg-tide-700 group-hover:text-white">
                  <item.icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-tight text-ink-900">{item.label}</span>
                  <span className="block truncate text-[11px] leading-tight text-slate-500">{item.detail}</span>
                </span>
                <Plus size={14} className="shrink-0 text-slate-300 transition group-hover:text-tide-700" />
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Click a block in the preview to edit it on the right.</p>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-3 py-3">
        <div className="flex items-start gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-tide-700 shadow-sm"><Sparkles size={14} /></span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold leading-tight text-ink-900">Starter templates</h3>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Use a ready-made layout, then replace the content.</p>
          </div>
        </div>
        <button type="button" className={`${toolbarButton} mt-2.5 w-full`} onClick={() => navigate("/templates")}>
          <LayoutTemplate size={14} /> Browse templates
        </button>
      </div>
    </aside>
  );
}

function Canvas() {
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
      const next = settings.width > 0 ? Math.min(1, available / settings.width) : 1;
      setScale(next > 0 ? next : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [settings.width]);
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
              <SectionBand key={meta.id} section={meta.id} blocks={blocks.filter((block) => blockSection(block) === meta.id)} />
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

function SectionBand({ section, blocks }: { section: Section; blocks: Block[] }) {
  const meta = sectionMeta(section);
  const selectedId = useEditor((state) => state.selectedId);
  const activeSection = useEditor((state) => state.activeSection);
  const hasSelected = blocks.some((block) => block.id === selectedId);
  const isActive = activeSection === section;
  return (
    <section className={`border-b ${hasSelected || isActive ? "border-tide-600" : "border-slate-200"}`}>
      <header
        className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1 ${isActive ? "bg-tide-700 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
        onClick={() => useEditor.getState().setActiveSection(section)}
        title={`Add content to the ${meta.title.toLowerCase()}`}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.12em]">{meta.title}</span>
        <span className={`truncate text-[10px] ${isActive ? "text-white/75" : "text-slate-400"}`}>{isActive ? "Adding content here" : meta.hint}</span>
      </header>
      {blocks.map((block) => <SortableBlock key={block.id} block={block} />)}
      {blocks.length === 0 && (
        <button
          type="button"
          className="m-2.5 block w-[calc(100%-1.25rem)] rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 py-3 text-[13px] text-slate-500 transition hover:border-tide-600 hover:bg-tide-50 hover:text-tide-700"
          onClick={() => addBlock(SECTION_EMPTY[section].type, section)}
        >
          <Plus size={14} className="mr-1 inline" /> Add a {SECTION_EMPTY[section].label} to the {meta.title.toLowerCase()}
        </button>
      )}
    </section>
  );
}

function SortableBlock({ block }: { block: Block }) {
  const selected = useEditor((state) => state.selectedId === block.id);
  const sortable = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return (
    <div ref={sortable.setNodeRef} style={style} className={`group relative transition-shadow ${selected ? "z-10 ring-2 ring-inset ring-tide-600" : "hover:ring-1 hover:ring-inset hover:ring-tide-300"}`} onClick={() => useEditor.getState().select(block.id)}>
      <button className="absolute left-1 top-1 z-20 hidden h-6 w-6 cursor-grab place-items-center rounded-md bg-white/90 text-slate-400 shadow-sm ring-1 ring-slate-200 group-hover:grid" {...sortable.attributes} {...sortable.listeners}><GripVertical size={13} /></button>
      <BlockView block={block} />
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return <div className="prose prose-sm max-w-none px-6 py-2" style={{ fontSize: block.style.fontSize, textAlign: block.style.align }} dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "image":
      return <img src={block.src} alt={block.alt} className="mx-auto max-w-full" style={{ width: block.width === "100%" ? "100%" : block.width }} />;
    case "button":
      return <div style={{ textAlign: block.style.align }} className="px-6 py-3"><span className="inline-block px-4 py-2" style={{ background: block.style.bg, color: block.style.color, borderRadius: block.style.radius }}>{block.label}</span></div>;
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

const iconButton = "grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-tide-600 hover:text-tide-700 disabled:opacity-40";

function Inspector() {
  const block = useEditor((state) => state.blocks.find((item) => item.id === state.selectedId) ?? null);
  const settings = useEditor((state) => state.settings);
  if (!block) {
    return (
      <aside className="min-h-0 space-y-2.5 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
        <UnsubscribeControl />
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Email settings</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Select any block in the preview to edit its content and styling.</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Width (px)</span>
          <input className={`${compactInput} w-full`} type="number" value={settings.width} onChange={(event) => useEditor.getState().change((draft) => { draft.settings.width = Number(event.target.value); })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Outer background</span>
          <HexColorPicker className="!w-full" color={settings.outerBg} onChange={(outerBg) => useEditor.getState().change((draft) => { draft.settings.outerBg = outerBg; })} />
        </label>
      </aside>
    );
  }
  const move = (direction: -1 | 1) => useEditor.getState().change((draft) => {
    const index = draft.blocks.findIndex((item) => item.id === block.id);
    const next = index + direction;
    if (next < 0 || next >= draft.blocks.length) return;
    const neighbor = draft.blocks[next];
    if (!neighbor || blockSection(neighbor) !== blockSection(block)) return;
    const [item] = draft.blocks.splice(index, 1);
    if (item) draft.blocks.splice(next, 0, item);
  });
  const meta = sectionMeta(blockSection(block));
  const typeLabels: Record<Block["type"], string> = { text: "Text", image: "Image", button: "Button", divider: "Divider line", spacer: "Empty space" };
  return (
    <aside className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <UnsubscribeControl />
      <div className="mt-2.5 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-semibold text-ink-950">{meta.title} · {typeLabels[block.type]}</p>
          <span className="shrink-0 rounded-full bg-tide-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Editing</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{meta.hint}</p>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button type="button" className={iconButton} onClick={() => move(-1)} title="Move up" aria-label="Move block up"><ArrowUp size={14} /></button>
        <button type="button" className={iconButton} onClick={() => move(1)} title="Move down" aria-label="Move block down"><ArrowDown size={14} /></button>
        <button type="button" className={iconButton} onClick={() => useEditor.getState().change((draft) => {
          const index = draft.blocks.findIndex((item) => item.id === block.id);
          const original = draft.blocks[index];
          if (!original) return;
          const copy = JSON.parse(JSON.stringify(original)) as Block;
          copy.id = uid();
          draft.blocks.splice(index + 1, 0, copy);
        })} title="Duplicate block" aria-label="Duplicate block"><Copy size={14} /></button>
        <button type="button" className={`${iconButton} hover:border-rose-300 hover:text-rose-600`} onClick={() => useEditor.getState().change((draft) => { draft.blocks = draft.blocks.filter((item) => item.id !== block.id); })} title="Delete block" aria-label="Delete block"><Trash2 size={14} /></button>
        <span className="ml-auto text-[10px] leading-tight text-slate-400">Reorder, copy<br />or remove</span>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3 [&_label>span]:mb-1 [&_label>span]:text-[11px] [&_label>span]:font-semibold [&_label>span]:text-slate-600">
        <BlockSettings block={block} />
      </div>
    </aside>
  );
}

function BlockSettings({ block }: { block: Block }) {
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
    case "text":
      return (
        <div className="space-y-2.5">
          <TextTools blockId={block.id} html={block.html} />
          <label className="block">
            <span className="mb-1 block font-medium">Text size (px)</span>
            <input className={inputClass} type="number" min={10} max={40} value={block.style.fontSize} onChange={(event) => patch((current) => { if (current.type === "text") current.style.fontSize = Number(event.target.value); })} />
          </label>
          {alignSelect(block.style.align, (next) => patch((current) => { if (current.type === "text") current.style.align = next; }))}
        </div>
      );
    case "image":
      return (
        <div className="space-y-2.5">
          <img src={block.src} alt={block.alt} className="max-h-28 w-full rounded border border-slate-200 object-contain" />
          <label className="block">
            <span className="mb-1 block font-medium">Replace image from your computer</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const uploaded = await api.upload(file);
              patch((current) => { if (current.type === "image") current.src = uploaded.asset.url; });
            }} />
            <span className="mt-1 block text-xs text-slate-500">JPG, PNG, GIF or WebP. The image must be reachable by receivers - see the note below.</span>
          </label>
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
          <label className="block">
            <span className="mb-1 block font-medium">Image width</span>
            <select className={inputClass} value={block.width} onChange={(event) => patch((current) => { if (current.type === "image") current.width = event.target.value; })}>
              <option value="100%">Full width</option>
              <option value="400px">Large (400px)</option>
              <option value="300px">Medium (300px)</option>
              <option value="200px">Small (200px)</option>
              <option value="120px">Logo size (120px)</option>
            </select>
          </label>
          {alignSelect(block.align, (next) => patch((current) => { if (current.type === "image") current.align = next; }))}
        </div>
      );
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

function TextTools({ blockId, html }: { blockId: string; html: string }) {
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
  if (!editor) return null;
  const formatButton = "grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-[12px] font-bold text-slate-600 shadow-sm transition hover:border-tide-600 hover:text-tide-700";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button className={formatButton} type="button" onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">B</button>
        <button className={`${formatButton} italic`} type="button" onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">I</button>
        <button className={`${formatButton} underline`} type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">U</button>
        <select className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 shadow-sm focus:border-tide-600" onChange={(event) => editor.chain().focus().insertContent(event.target.value).run()} defaultValue="" aria-label="Insert merge tag">
          <option value="" disabled>Merge tag</option>
          <option value="{{first_name | there}}">First name</option>
          <option value="{{last_name}}">Last name</option>
          <option value="{{company | your company}}">Company</option>
          <option value="{{job_title}}">Job title</option>
        </select>
      </div>
      <EditorContent editor={editor} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] leading-relaxed shadow-sm focus-within:border-tide-600 focus-within:ring-2 focus-within:ring-tide-600/20 [&_.ProseMirror]:min-h-16 [&_.ProseMirror]:outline-none" />
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
