import {
  AudioLines,
  FileText,
  Film,
  Image as ImageIcon,
  MessagesSquare,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { Modality, TaskTypeDefinition } from "@openlabel/contracts";

const MODALITY: Record<Modality, { label: string; icon: LucideIcon }> = {
  document: { label: "Documents", icon: FileText },
  image: { label: "Images", icon: ImageIcon },
  audio: { label: "Audio", icon: AudioLines },
  video: { label: "Video", icon: Film },
  text: { label: "Text", icon: Type },
  llm: { label: "LLM data", icon: MessagesSquare },
};

const ORDER: Modality[] = ["document", "image", "audio", "video", "text", "llm"];

/** What projects can be created for, grouped by data type, from the task-type registry. */
export function TaskTypeCatalog({ taskTypes }: { taskTypes: TaskTypeDefinition[] }) {
  const groups = ORDER.map((m) => ({ modality: m, items: taskTypes.filter((t) => t.modality === m) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <div className="grid gap-8">
      {groups.map(({ modality, items }) => {
        const { label, icon: Icon } = MODALITY[modality];
        return (
          <section key={modality} aria-labelledby={`tt-${modality}`}>
            <h3
              id={`tt-${modality}`}
              className="text-muted-foreground mb-3 flex items-center gap-2 text-[13px] font-medium"
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              {label}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((t) => (
                <li key={t.id} className="bg-card rounded-lg border p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">{t.title}</p>
                    <code className="text-muted-foreground font-mono text-[11px]">{t.id}</code>
                  </div>
                  <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">{t.description}</p>
                  <p className="text-muted-foreground mt-3 text-[12px]">
                    Scored by{" "}
                    <span className="text-foreground">{t.metrics.map((m) => m.label).join(", ")}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
