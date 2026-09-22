import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Configurable so the exact model id can be corrected without a code change
// if it drifts (e.g. Google renames/retires a Gemini snapshot).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MAX_IMAGES = 6;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    job_company: { type: SchemaType.STRING },
    job_designation: { type: SchemaType.STRING },
    job_location: { type: SchemaType.STRING },
    job_experience_required: { type: SchemaType.STRING },
    job_education_qualification: { type: SchemaType.STRING },
    job_salary_minimum: { type: SchemaType.NUMBER },
    job_salary_maximum: { type: SchemaType.NUMBER },
    job_working_days: { type: SchemaType.STRING },
    job_shift_time: { type: SchemaType.STRING },
    job_description: { type: SchemaType.STRING },
    job_howtoapply: { type: SchemaType.STRING },
  },
  required: [
    "job_company",
    "job_designation",
    "job_location",
    "job_experience_required",
    "job_education_qualification",
    "job_salary_minimum",
    "job_salary_maximum",
    "job_working_days",
    "job_shift_time",
    "job_description",
    "job_howtoapply",
  ],
};

const PROMPT = `You are extracting structured job-posting data from photos of a job advertisement (screenshots, flyers, WhatsApp forwards, etc). The photos supplied may be multiple angles/crops of the SAME single ad — combine everything you can read across all of them into one merged result, don't produce duplicates or pick only one photo.

Fill every field of the JSON schema as best you can from what's visible:
- job_company: the hiring company or site name.
- job_designation: the role/job title — this is the headline of the post.
- job_location: the work location as free text (city/area/full address, whatever is printed).
- job_experience_required: e.g. "5+ Years in Industrial Security".
- job_education_qualification: e.g. "Any Graduate".
- job_salary_minimum / job_salary_maximum: numeric monthly or annual figures as printed (plain numbers, no currency symbols or commas). If only one figure is given, use it for both min and max.
- job_working_days: e.g. "4 Weekly Offs", "6 Days a Week".
- job_shift_time: e.g. "General Shift", "Night Shift".
- job_description: the body text — responsibilities, eligibility, skills, anything descriptive that isn't captured by the other fields.
- job_howtoapply: contact/apply instructions — phone numbers, email, WhatsApp, subject line to use, etc.

If a field genuinely isn't visible anywhere in the photos, return an empty string ("") for text fields or 0 for the salary numbers — never invent information that isn't in the images.`;

function parseDataUrl(image) {
  // Accepts either { mimeType, data } or a raw "data:image/png;base64,...." string.
  if (image && typeof image === "object" && image.data) {
    return { mimeType: image.mimeType || "image/jpeg", data: image.data };
  }
  const match = /^data:(.+);base64,(.+)$/.exec(String(image || ""));
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY environment variable." });
  }

  try {
    const { images } = req.body || {};
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "Provide at least one image." });
    }
    if (images.length > MAX_IMAGES) {
      return res.status(400).json({ error: `Provide at most ${MAX_IMAGES} images.` });
    }

    const parsedImages = images.map(parseDataUrl);
    if (parsedImages.some((img) => !img)) {
      return res.status(400).json({ error: "One or more images could not be read." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const result = await model.generateContent([
      PROMPT,
      ...parsedImages.map(({ mimeType, data }) => ({ inlineData: { mimeType, data } })),
    ]);

    const text = result.response.text();
    const extracted = JSON.parse(text);

    return res.status(200).json({ ok: true, fields: extracted });
  } catch (error) {
    console.error("parse-community-job-photos error:", error);
    return res.status(500).json({ error: "Failed to parse job photos.", details: String(error?.message || error) });
  }
}
