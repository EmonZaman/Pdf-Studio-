import { DocumentTemplate, DocumentData } from "@/types/template";
import { CITY_BANK_TEMPLATE } from "./city-bank-statement";
import {
  CITY_BANK_SAMPLE_DATA,
  ISLAMI_BANK_SAMPLE_DATA,
  BRAC_BANK_SAMPLE_DATA,
  EASTERN_BANK_SAMPLE_DATA,
} from "./bank-statement-data";
import { ISLAMI_BANK_TEMPLATE } from "./islami-bank-statement";
import { BRAC_BANK_TEMPLATE } from "./brac-bank-statement";
import { EASTERN_BANK_TEMPLATE } from "./eastern-bank-statement";

export const DEFAULT_TEMPLATES: Record<string, { template: DocumentTemplate; sampleData: DocumentData }> = {
  "city-bank-statement": {
    template: CITY_BANK_TEMPLATE,
    sampleData: CITY_BANK_SAMPLE_DATA,
  },
  "islami-bank-statement": {
    template: ISLAMI_BANK_TEMPLATE,
    sampleData: ISLAMI_BANK_SAMPLE_DATA,
  },
  "brac-bank-statement": {
    template: BRAC_BANK_TEMPLATE,
    sampleData: BRAC_BANK_SAMPLE_DATA,
  },
  "eastern-bank-statement": {
    template: EASTERN_BANK_TEMPLATE,
    sampleData: EASTERN_BANK_SAMPLE_DATA,
  },
};

export function getTemplateById(id: string): { template: DocumentTemplate; sampleData: DocumentData } | null {
  return DEFAULT_TEMPLATES[id] || null;
}
