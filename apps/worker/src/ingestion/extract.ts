import { generateObject } from "ai";
import {
  ExtractionSchema,
  type Extracted,
  APARTMENT_ATTRIBUTE_KEYS,
} from "@apartment-finder/shared";
import { model } from "@apartment-finder/shared/gateway";
import { recordAiUsage } from "../lib/aiUsage.js";

const EXTRACTION_MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "You extract structured Israeli apartment-rental fields from raw listing text.",
  "Output strict JSON matching the provided schema.",
  "",
  "Rules:",
  "- All numeric/text fields are nullable. Set null when the listing does not state the value.",
  "- price_nis is monthly rent in NIS. Reject deposits, agency fees, total-yearly figures.",
  "- rooms can be fractional (e.g. 2.5).",
  "- floor: 0 = ground floor; -1 = basement.",
  "- street/houseNumber/neighborhood/city: leave null unless the listing states them.",
  "- isAgency: true if posted by a broker/agency, false if private. null if unclear.",
  "- phoneE164: international format if extractable, otherwise null.",
  "- description: a 1-2 sentence summary in the listing's original language (Hebrew preferred when present).",
  "",
  "Additional structured fields:",
  "- arnona_nis: monthly municipal property tax in NIS, integer.",
  "- vaad_bayit_nis: monthly building-committee fee in NIS, integer.",
  "- entry_date: short Hebrew string as written in the listing ('מיידי', '01/06/2026', 'גמיש'). null if absent.",
  "- balcony_sqm: balcony size in m², integer.",
  "- total_floors: total number of floors in the building.",
  "- furniture_status: 'included' if fully furnished, 'partial' if partially furnished, 'not_included' if explicitly unfurnished. null if not stated.",
  "",
  "Boolean attributes:",
  `- attributes is a list of { key, value } pairs covering only attributes the listing explicitly mentions.`,
  `- valid keys: ${APARTMENT_ATTRIBUTE_KEYS.join(", ")}`,
  "- Set value=true if the listing affirms the attribute (e.g. 'has elevator', 'מעלית').",
  "- Set value=false if the listing explicitly denies it (e.g. 'no parking', 'אין חניה').",
  "- OMIT attributes the listing does not mention. Absence ≠ false.",
  "- shared_apartment: true if the listing is for a single room in a shared apartment.",
].join("\n");

type ExtractInput = {
  rawText: string;
  source: "yad2" | "facebook";
};

export async function extractListing(input: ExtractInput): Promise<Extracted> {
  const result = await generateObject({
    model: model(EXTRACTION_MODEL),
    schema: ExtractionSchema,
    system: SYSTEM_PROMPT,
    prompt: input.rawText,
  });

  await recordAiUsage({
    feature: "ingestion.extract",
    model: EXTRACTION_MODEL,
    providerModel: result.response.modelId,
    usage: result.usage,
    metadata: { source: input.source },
  }).catch((err) => console.error("recordAiUsage(extract) failed:", err));

  return result.object;
}
