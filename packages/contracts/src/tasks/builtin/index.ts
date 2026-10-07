import type { TaskTypeDefinition } from "../define.js";
import { audioTranscription } from "./audio-transcription.js";
import {
  audioClassification,
  documentClassification,
  imageClassification,
  textClassification,
} from "./classification.js";
import { documentOcr } from "./document-ocr.js";
import { imageDetection } from "./image-detection.js";
import { textNer } from "./text-ner.js";

export * from "./audio-transcription.js";
export * from "./classification.js";
export * from "./document-ocr.js";
export * from "./image-detection.js";
export * from "./text-ner.js";

/** Task types that ship with OpenLabel. More arrive as plugins (OL-E10). */
export const BUILTIN_TASK_TYPES: readonly TaskTypeDefinition[] = [
  documentOcr,
  documentClassification,
  imageClassification,
  imageDetection,
  audioTranscription,
  audioClassification,
  textClassification,
  textNer,
];
