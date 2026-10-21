import { create } from "zustand";
import type { Block, Design, Section } from "../lib/api";
import { uid } from "../lib/uid";

export const SECTION_ORDER: Record<Section, number> = { header: 0, body: 1, footer: 2 };

export function blockSection(block: Block): Section {
  return block.section ?? "body";
}

export function sortBySection(blocks: Block[]): Block[] {
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => SECTION_ORDER[blockSection(a.block)] - SECTION_ORDER[blockSection(b.block)] || a.index - b.index)
    .map((entry) => entry.block);
}

type Snap = { settings: Design["settings"]; blocks: Block[] };

// Editor state is plain JSON data. JSON cloning keeps change/undo working on
// plain HTTP, where structuredClone may be unavailable (insecure context).
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type EditorState = {
  name: string;
  settings: Design["settings"];
  blocks: Block[];
  selectedId: string | null;
  activeSection: Section;
  setActiveSection: (section: Section) => void;
  past: Snap[];
  future: Snap[];
  dirty: boolean;
  load: (name: string, design: Design) => void;
  select: (id: string | null) => void;
  setName: (name: string) => void;
  change: (recipe: (draft: { settings: Design["settings"]; blocks: Block[] }) => void) => void;
  undo: () => void;
  redo: () => void;
  markClean: () => void;
};

export function blank(type: Block["type"], section: Section = "body"): Block {
  const id = uid();
  switch (type) {
    case "text":
      return { id, section, type, html: "<p>New text</p>", style: { fontSize: 16, align: "left", padding: "12px 28px", bg: "transparent" } };
    case "image":
      return { id, section, type, src: "https://placehold.co/600x200/png", alt: "", width: "100%", align: "center" };
    case "button":
      return { id, section, type, label: "Learn more", href: "https://cachedigitech.com", style: { bg: "#0f766e", color: "#ffffff", fontSize: 16, radius: 6, align: "center" } };
    case "divider":
      return { id, section, type, style: { color: "#e5e7eb", height: 1 } };
    case "spacer":
      return { id, section, type, height: 24 };
    default: {
      const neverType: never = type;
      throw new Error(String(neverType));
    }
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  name: "Untitled",
  settings: {
    outerBg: "#f3f4f6",
    contentBg: "#ffffff",
    width: 600,
    fontFamily: "Arial, Helvetica, sans-serif",
    baseFontSize: 16,
    textColor: "#1f2937",
    linkColor: "#0f766e",
    includeUnsubscribe: false,
    compose: "blocks",
    plainBody: "",
  },
  blocks: [],
  selectedId: null,
  activeSection: "body",
  setActiveSection: (activeSection) => set({ activeSection }),
  past: [],
  future: [],
  dirty: false,
  load: (name, design) => {
    const blocks = sortBySection(design.blocks.map((block) => ({ ...block, section: blockSection(block) })));
    set({
      name,
      settings: design.settings,
      blocks,
      selectedId: blocks[0]?.id ?? null,
      activeSection: blocks[0] ? blockSection(blocks[0]) : "body",
      past: [],
      future: [],
      dirty: false,
    });
  },
  select: (selectedId) => {
    const block = get().blocks.find((item) => item.id === selectedId);
    set({ selectedId, ...(block ? { activeSection: blockSection(block) } : {}) });
  },
  setName: (name) => set({ name, dirty: true }),
  change: (recipe) => {
    const current = get();
    const past = [...current.past, { settings: clone(current.settings), blocks: clone(current.blocks) }].slice(-50);
    const draft = { settings: clone(current.settings), blocks: clone(current.blocks) };
    recipe(draft);
    set({ ...draft, past, future: [], dirty: true });
  },
  undo: () => {
    const { past, future, settings, blocks } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({
      settings: previous.settings,
      blocks: previous.blocks,
      past: past.slice(0, -1),
      future: [...future, { settings, blocks }],
      dirty: true,
    });
  },
  redo: () => {
    const { past, future, settings, blocks } = get();
    const next = future[future.length - 1];
    if (!next) return;
    set({
      settings: next.settings,
      blocks: next.blocks,
      future: future.slice(0, -1),
      past: [...past, { settings, blocks }],
      dirty: true,
    });
  },
  markClean: () => set({ dirty: false }),
}));

export function addBlock(type: Block["type"], section: Section = "body"): void {
  const block = blank(type, section);
  useEditor.getState().change((draft) => {
    const order = SECTION_ORDER[section];
    let insertAt = draft.blocks.length;
    const lastOfSection = draft.blocks.map((item, index) => ({ item, index })).filter(({ item }) => blockSection(item) === section).pop();
    if (lastOfSection) {
      insertAt = lastOfSection.index + 1;
    } else {
      const firstLater = draft.blocks.findIndex((item) => SECTION_ORDER[blockSection(item)] > order);
      insertAt = firstLater === -1 ? draft.blocks.length : firstLater;
    }
    draft.blocks.splice(insertAt, 0, block);
  });
  useEditor.getState().select(block.id);
}

export function designFromStore(): Design {
  const { settings, blocks } = useEditor.getState();
  return { version: 1, settings, blocks };
}
