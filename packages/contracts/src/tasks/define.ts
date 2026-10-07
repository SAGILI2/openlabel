import { z } from "zod";

/**
 * Task-type plugins (ADR-0004).
 *
 * A task type is the unit of extension: it names one kind of labelling job (e.g.
 * `image.detection`) and supplies everything the platform needs to label, pre-label, export
 * and evaluate it. The core — projects, assets, annotation versions, review, snapshots,
 * evaluation runs — stays task-agnostic and talks to plugins only through this contract.
 *
 * This package holds the data-level contract (schemas, metadata, metric definitions). Editors
 * (React), matchers/metric implementations and exporters live in their own packages and are
 * looked up by the same `id`.
 */

/** Kind of source data. Mirrors the `modality` database enum. */
export const MODALITIES = ["image", "document", "audio", "video", "text", "llm"] as const;
export const modalitySchema = z.enum(MODALITIES);
export type Modality = z.infer<typeof modalitySchema>;

/** `<modality>.<task>`, lowercase, e.g. `document.ocr`, `audio.transcription`. */
export const TASK_TYPE_ID_PATTERN = /^(image|document|audio|video|text|llm)\.[a-z][a-z0-9-]*$/;
export const taskTypeIdSchema = z.string().regex(TASK_TYPE_ID_PATTERN, {
  message: "task type id must look like <modality>.<task>, e.g. image.detection",
});
export type TaskTypeId = `${Modality}.${string}`;

/** Shape of the regions a task draws, so editors and exporters know what to expect. */
export const REGION_KINDS = [
  "none",
  "box",
  "polygon",
  "mask",
  "keypoints",
  "span",
  "segment",
  "frame",
] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

/** Whether a higher or a lower value of a metric is better. */
export type MetricGoal = "higher" | "lower";

export interface MetricDefinition {
  /** Stable key stored on metric rows, e.g. `map50`, `wer`. */
  key: string;
  label: string;
  goal: MetricGoal;
  /** `ratio` values are 0–1 and shown as percentages. */
  unit: "ratio" | "count" | "seconds";
  description: string;
}

export interface TaskTypeDefinition<
  TAnnotation extends z.ZodType = z.ZodType,
  TPrediction extends z.ZodType = z.ZodType,
> {
  id: TaskTypeId;
  modality: Modality;
  /** Short name shown when creating a project, e.g. "Object detection". */
  title: string;
  /** One sentence on what labellers do. */
  description: string;
  regionKind: RegionKind;
  /** Ground truth for one asset. */
  annotation: TAnnotation;
  /**
   * Canonical model output for one asset: the annotation shape plus confidences. Every engine
   * adapter converts its native response into this before scoring.
   */
  prediction: TPrediction;
  /** Standard metrics, in display order; the first is the headline metric. */
  metrics: readonly [MetricDefinition, ...MetricDefinition[]];
  /** Training formats the task can export to (exporter ids). */
  exportFormats: readonly string[];
  /** A minimal valid annotation and prediction, used by the plugin contract tests and docs. */
  examples: { annotation: z.input<TAnnotation>; prediction: z.input<TPrediction> };
}

/**
 * Declares a task type with full type inference. Keeps definitions as plain data so they can
 * be shared by the web app, workers and CLI.
 */
export function defineTaskType<TAnnotation extends z.ZodType, TPrediction extends z.ZodType>(
  definition: TaskTypeDefinition<TAnnotation, TPrediction>,
): TaskTypeDefinition<TAnnotation, TPrediction> {
  return definition;
}
