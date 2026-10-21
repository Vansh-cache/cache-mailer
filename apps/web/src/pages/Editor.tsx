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
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { HexColorPicker } from "react-colorful";
import { Button, inputClass } from "../components/ui";
import { api, type Block, type Section } from "../lib/api";
import { addBlock, blockSection, designFromStore, useEditor } from "../store/editor";

export function EditorPage() {
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const template = useQuery({ queryKey: ["template", id], queryFn: () => api.template(id) });
  const load = useEditor((state) => state.load);
  const dirty = useEditor((state) => state.dirty);
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
  if (!template.data) return <p>Loading editorâ€¦</p>;
  return (
    <div className="flex h-[calc(100vh-3rem)] min-w-0 flex-col overflow-x-hidden">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${inputClass} max-w-sm`} value={name} onChange={(event) => useEditor.getState().setName(event.target.value)} />
        <Button variant="ghost" onClick={() => useEditor.getState().undo()}>Undo</Button>
        <Button variant="ghost" onClick={() => useEditor.getState().redo()}>Redo</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{dirty ? "Save" : "Saved"}</Button>
        <Button variant="ghost" onClick={() => navigate("/templates")}>Back</Button>
        <PreviewButton />
        <TestSend templateId={id} />
        <Button variant="ghost" onClick={() => useEditor.getState().change((draft) => { draft.settings.compose = draft.settings.compose === "plain" ? "blocks" : "plain"; })}>
          {compose === "plain" ? "Block editor" : "Plain writing"}
        </Button>
      </div>
      <PlainOrBlocks />
    </div>
  );
}

function PlainOrBlocks() {
  const compose = useEditor((state) => state.settings.compose ?? "blocks");
  const plainBody = useEditor((state) => state.settings.plainBody ?? "");
  if (compose === "plain") {
    return (
      <textarea
        className="min-h-0 w-full flex-1 rounded-xl border border-slate-200 bg-white p-8 font-serif text-lg leading-relaxed"
        value={plainBody}
        placeholder="Write the email as plain text. Use {{first_name | there}} for a name."
        onChange={(event) => useEditor.getState().change((draft) => { draft.settings.plainBody = event.target.value; })}
      />
    );
  }
  return (
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[220px_minmax(0,1fr)_280px] gap-3">
        <ContentPanel />
        <Canvas />
        <Inspector />
      </div>
  );
}

const SECTION_META: { id: Section; title: string; hint: string; addHint: string }[] = [
  { id: "header", title: "Header", hint: "Top of the email â€” banner image, logo or title. The first thing people see.", addHint: "Add to header" },
  { id: "body", title: "Body", hint: "Your main message â€” text, images and buttons.", addHint: "Add to body" },
  { id: "footer", title: "Footer", hint: "Closing lines, small print and links. Company name, address and unsubscribe are added automatically below.", addHint: "Add to footer" },
];

function sectionMeta(section: Section) {
  return SECTION_META.find((item) => item.id === section) ?? SECTION_META[1];
}
const BLOCK_BUTTONS: { type: Block["type"]; label: string; detail: string }[] = [
  { type: "text", label: "Text", detail: "Headline or paragraph" },
  { type: "image", label: "Image", detail: "Banner, photo or logo" },
  { type: "button", label: "Button", detail: "Clickable call-to-action" },
  { type: "divider", label: "Divider line", detail: "Thin separator line" },
  { type: "spacer", label: "Empty space", detail: "Blank vertical gap" },
];

function ContentPanel() {
  const navigate = useNavigate();
  const activeSection = useEditor((state) => state.activeSection);
  const blocks = useEditor((state) => state.blocks);
  const meta = sectionMeta(activeSection);
  const countFor = (section: Section) => blocks.filter((block) => blockSection(block) === section).length;
  return (
    <div className="panel space-y-4 overflow-auto p-3">
      <div>
        <h3 className="text-sm font-semibold">1. Choose a part of the email</h3>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {SECTION_META.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => useEditor.getState().setActiveSection(item.id)}
              className={`rounded-lg border px-2 py-2 text-sm ${activeSection === item.id ? "border-tide-700 bg-tide-700 font-medium text-white" : "border-slate-200 hover:border-tide-700"}`}
            >
              {item.title}
              <span className={`block text-[11px] ${activeSection === item.id ? "text-white/80" : "text-slate-400"}`}>{countFor(item.id)} item{countFor(item.id) === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{meta.hint}</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold">2. Add content to the {meta.title.toLowerCase()}</h3>
        <div className="mt-2 space-y-1">
          {BLOCK_BUTTONS.map((item) => (
            <button
              key={item.type}
              type="button"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-tide-700"
              onClick={() => addBlock(item.type, activeSection)}
            >
              + {item.label}
              <span className="block text-xs text-slate-500">{item.detail}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Then click the new block in the email to write, replace or style it on the right.</p>
      </div>
      <div className="border-t border-slate-100 pt-3">
        <h3 className="text-sm font-semibold">Want a head start?</h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">Pick a ready-made professional layout from the gallery, then just change the words and pictures.</p>
        <Button variant="ghost" onClick={() => navigate("/templates")}>Browse starter templates</Button>
      </div>
    </div>
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
    <div ref={frameRef} className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto rounded-xl p-4" style={{ background: settings.outerBg }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <div
            className="mx-auto"
            style={{
              width: settings.width,
              zoom: scale,
              background: settings.contentBg,
            }}
          >
            {SECTION_META.map((meta) => (
              <SectionBand key={meta.id} section={meta.id} blocks={blocks.filter((block) => blockSection(block) === meta.id)} />
            ))}
            <p className="px-6 py-4 text-center text-xs text-slate-500">
              Automatic footer: your company name and address{settings.includeUnsubscribe ? " Â· Unsubscribe" : ""} â€” change these in Settings.
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
    <section className={`border-b-2 ${hasSelected || isActive ? "border-tide-700" : "border-slate-200"}`}>
      <header
        className={`flex cursor-pointer items-baseline justify-between gap-2 px-3 py-1.5 ${isActive ? "bg-tide-700 text-white" : "bg-slate-100"}`}
        onClick={() => useEditor.getState().setActiveSection(section)}
        title={`Add content to the ${meta.title.toLowerCase()}`}
      >
        <span className={`text-[11px] font-bold uppercase tracking-wider ${isActive ? "text-white" : "text-slate-700"}`}>{meta.title}</span>
        <span className={`truncate text-[11px] ${isActive ? "text-white/80" : "text-slate-500"}`}>{isActive ? "Adding content here — pick a block on the left" : meta.hint}</span>
      </header>
      {blocks.map((block) => <SortableBlock key={block.id} block={block} />)}
      {blocks.length === 0 && (
        <button
          type="button"
          className="m-3 block w-[calc(100%-1.5rem)] rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 hover:border-tide-700 hover:text-tide-700"
          onClick={() => addBlock(SECTION_EMPTY[section].type, section)}
        >
          Nothing here yet. Click to add a {SECTION_EMPTY[section].label} to the {meta.title.toLowerCase()}.
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
    <div ref={sortable.setNodeRef} style={style} className={`group relative ${selected ? "ring-2 ring-tide-700" : ""}`} onClick={() => useEditor.getState().select(block.id)}>
      <button className="absolute left-1 top-1 hidden cursor-grab text-slate-400 group-hover:block" {...sortable.attributes} {...sortable.listeners}><GripVertical size={14} /></button>
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
    <label className="flex items-start gap-2 border-b border-slate-100 pb-3">
      <input
        className="mt-1"
        type="checkbox"
        checked={includeUnsubscribe}
        onChange={(event) => useEditor.getState().change((draft) => { draft.settings.includeUnsubscribe = event.target.checked; })}
      />
      <span>Add an unsubscribe link in the footer. Leave this off for one-off mail, and turn it on for a product launch.</span>
    </label>
  );
}

function Inspector() {
  const block = useEditor((state) => state.blocks.find((item) => item.id === state.selectedId) ?? null);
  const settings = useEditor((state) => state.settings);
  if (!block) {
    return (
      <div className="panel space-y-3 overflow-auto p-3 text-sm">
        <UnsubscribeControl />
        <h2 className="font-medium">Email</h2>
        <label>Width<input className={inputClass} type="number" value={settings.width} onChange={(event) => useEditor.getState().change((draft) => { draft.settings.width = Number(event.target.value); })} /></label>
        <label>Outer background<HexColorPicker color={settings.outerBg} onChange={(outerBg) => useEditor.getState().change((draft) => { draft.settings.outerBg = outerBg; })} /></label>
      </div>
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
    <div className="panel space-y-3 overflow-auto p-3 text-sm">
      <UnsubscribeControl />
      <div className="rounded-lg bg-slate-50 p-2">
        <p className="font-semibold">Editing: {meta.title} Â· {typeLabels[block.type]}</p>
        <p className="text-xs text-slate-500">{meta.hint}</p>
        <p className="mt-1 text-xs text-slate-500">Use â†‘ â†“ to reorder inside this section, duplicate, or delete.</p>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" onClick={() => move(-1)}><ArrowUp size={14} /></Button>
        <Button variant="ghost" onClick={() => move(1)}><ArrowDown size={14} /></Button>
        <Button variant="ghost" onClick={() => useEditor.getState().change((draft) => {
          const index = draft.blocks.findIndex((item) => item.id === block.id);
          const copy = structuredClone(draft.blocks[index]);
          if (!copy) return;
          copy.id = crypto.randomUUID();
          draft.blocks.splice(index + 1, 0, copy);
        })}><Copy size={14} /></Button>
        <Button variant="ghost" onClick={() => useEditor.getState().change((draft) => { draft.blocks = draft.blocks.filter((item) => item.id !== block.id); })}><Trash2 size={14} /></Button>
      </div>
      <BlockSettings block={block} />
    </div>
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
        <div className="space-y-3">
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
        <div className="space-y-3">
          <img src={block.src} alt={block.alt} className="max-h-28 w-full rounded border border-slate-200 object-contain" />
          <label className="block">
            <span className="mb-1 block font-medium">Replace image from your computer</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const uploaded = await api.upload(file);
              patch((current) => { if (current.type === "image") current.src = uploaded.asset.url; });
            }} />
            <span className="mt-1 block text-xs text-slate-500">JPG, PNG, GIF or WebP. The image must be reachable by receivers â€” see the note below.</span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">â€¦or image web address (URL)</span>
            <input className={inputClass} value={block.src} onChange={(event) => patch((current) => { if (current.type === "image") current.src = event.target.value; })} placeholder="https://â€¦" />
            <span className="mt-1 block text-xs text-slate-500">For people outside this office, use a public https:// address, not 127.0.0.1 or a local file.</span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Alt text</span>
            <input className={inputClass} placeholder="Describe the image" value={block.alt} onChange={(event) => patch((current) => { if (current.type === "image") current.alt = event.target.value; })} />
            <span className="mt-1 block text-xs text-slate-500">Shown when images are blocked, and read aloud by screen readers.</span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">When clicked, open this link (optional)</span>
            <input className={inputClass} placeholder="https://â€¦" value={block.href ?? ""} onChange={(event) => patch((current) => { if (current.type === "image") current.href = event.target.value; })} />
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
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block font-medium">Button text</span>
            <input className={inputClass} value={block.label} onChange={(event) => patch((current) => { if (current.type === "button") current.label = event.target.value; })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Button opens this link</span>
            <input className={inputClass} value={block.href} onChange={(event) => patch((current) => { if (current.type === "button") current.href = event.target.value; })} placeholder="https://â€¦" />
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
        <div className="space-y-3">
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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" type="button" onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
        <Button variant="ghost" type="button" onClick={() => editor.chain().focus().toggleItalic().run()}>I</Button>
        <Button variant="ghost" type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}>U</Button>
        <select className={inputClass} onChange={(event) => editor.chain().focus().insertContent(event.target.value).run()} defaultValue="">
          <option value="" disabled>Merge tag</option>
          <option value="{{first_name | there}}">First name</option>
          <option value="{{last_name}}">Last name</option>
          <option value="{{company | your company}}">Company</option>
          <option value="{{job_title}}">Job title</option>
        </select>
      </div>
      <EditorContent editor={editor} className="rounded-lg border border-slate-200 p-2" />
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
      <Button variant="ghost" onClick={() => preview.mutate()}>Preview</Button>
      {html && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink-950/50 p-6">
          <div className="panel h-[80vh] w-[860px] overflow-hidden p-4">
            <div className="mb-2 flex gap-2">
              <Button variant="ghost" onClick={() => setWidth(600)}>Desktop</Button>
              <Button variant="ghost" onClick={() => setWidth(375)}>Mobile</Button>
              <Button variant="ghost" onClick={() => setHtml(null)}>Close</Button>
            </div>
            <iframe title="preview" className="mx-auto h-[calc(100%-3rem)] border border-slate-200" style={{ width }} srcDoc={html} />
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
    <div className="ml-auto flex flex-wrap gap-2">
      <select className={`${inputClass} w-44`} value={senderId} onChange={(event) => setSenderId(Number(event.target.value))}>
        <option value={0}>Mailbox</option>
        {senders.data?.senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.fromEmail}</option>)}
      </select>
      <select className={`${inputClass} w-52`} value={tagId} onChange={(event) => setTagId(Number(event.target.value))} aria-label="Test receivers by tag">
        <option value={0}>Or send test to a tagâ€¦</option>
        {tags.data?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name} ({tag.count})</option>)}
      </select>
      <input
        className={`${inputClass} w-64`}
        value={receiver}
        onChange={(event) => setReceiver(event.target.value)}
        placeholder="Receiver email (optional if tag chosen)"
        list="test-receiver-options"
        aria-label="Test receiver email"
      />
      <datalist id="test-receiver-options">
        {contacts.data?.contacts.map((contact) => <option key={contact.id} value={contact.email}>{contact.email}</option>)}
      </datalist>
      <Button variant="ghost" disabled={!senderId || (!receiver.trim() && !tagId) || send.isPending} onClick={() => send.mutate()}>Test send</Button>
    </div>
  );
}
