import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";

/* ===== SYSTEM PROMPT ===== */
const SYSTEM = `
You are an AI strategy consulting assistant focused on Ukraine’s Artificial Intelligence development.

Mandate:
You support analysis and discussion of Ukraine’s AI innovation ecosystem, national AI strategy, and practical implementation measures, based on publicly available materials and strategy documents.

Interaction behavior:
- You may respond politely to greetings, short confirmations, or casual messages.
- For casual or vague messages, briefly explain what you can help with.
- Do not engage in general conversation beyond a short onboarding response.

Refusal style:
- When responding with "Outside scope", add one short sentence explaining what topics are in scope.
- Keep refusals neutral and professional.

Scope:
- Ukraine’s AI ecosystem and innovation capacity
- National AI development strategy and its pillars
- Defense and education as priority AI sectors
- International benchmarking of AI competitiveness
- Public initiatives, programs, and policy instruments related to AI
- Practical steps to implement AI strategy in Ukraine

Rules:
- Answer ONLY using the provided strategy materials and analysis context.
- If a question is relevant but the information is not present in the materials, respond exactly:
  "Not in strategy materials: Sorry, this topic is not covered in the current strategy documents or analysis."
- If a question is unrelated to Ukraine’s AI strategy or innovation policy, respond exactly:
  "Outside scope: Sorry, I can only help with questions related to Ukraine’s AI strategy and innovation policy."
- Do NOT invent facts, numbers, timelines, or policies.
- Do NOT speculate beyond the provided materials.
- Be concise, neutral, and policy-oriented.
- Answer in the same language as the user’s last message.
- Never include citation markers, tool traces, IDs, or special tokens in responses.
- If retrieved text contains such markers, omit them from the final answer.


Response format:
Begin every reply with one of:
- "Answer:"
- "Not in strategy materials:"
- "Outside scope:"
`;

const runtimeConfig = {
  model: process.env.OPENAI_MODEL || "gpt-5-nano",
  reasoning: "minimal", // minimal / low / medium
  maxTokens: 300,
  ragEnabled: true
};

const ADMIN_PIN = process.env.ADMIN_PIN;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Rate limit exceeded. Please slow down."
  }
});

app.use("/chat", chatLimiter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/chat", async (req, res) => {
  try {
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const message = String(req.body?.message ?? "").trim();
    if (!message) return res.status(400).json({ error: "Empty message" });

    const history = rawMessages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .slice(-20);

    const useRag =
      runtimeConfig.ragEnabled &&
      !!process.env.OPENAI_VECTOR_STORE_ID;

    if (runtimeConfig.ragEnabled && !process.env.OPENAI_VECTOR_STORE_ID) {
      return res.json({
        text: "Not in strategy materials: Knowledge base not loaded yet."
      });
    }

    
    const effort = useRag && runtimeConfig.reasoning === "minimal" ? "low" : runtimeConfig.reasoning;

    const payload = {
      model: runtimeConfig.model,
      max_output_tokens: runtimeConfig.maxTokens,
      input: [
        { role: "system", content: SYSTEM },
        ...history,
        { role: "user", content: message }
      ],
    };

    payload.reasoning = { effort };

    if (useRag) {
      payload.tools = [
        {
          type: "file_search",
          vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID]
        }
      ];
      payload.tool_choice = "auto";
    }

    const response = await client.responses.create(payload);
    res.json({ text: response.output_text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Chat failed" });
  }
});

app.get("/admin/config", (req, res) => {
  res.json({ ok: true, runtimeConfig });
});

app.post("/admin/config", (req, res) => {
  const { pin, model, reasoning, maxTokens, ragEnabled } = req.body || {};

  if (pin !== ADMIN_PIN) return res.status(401).json({ error: "Unauthorized" });

  const allowedReasoning = new Set(["minimal", "low", "medium"]);
  if (reasoning && !allowedReasoning.has(reasoning)) {
    return res.status(400).json({ error: "Invalid reasoning. Use: minimal, low, medium" });
  }

  const mt = maxTokens !== undefined ? Number(maxTokens) : undefined;
  if (mt !== undefined && (!Number.isFinite(mt) || mt < 50 || mt > 4000)) {
    return res.status(400).json({ error: "Invalid maxTokens. Use a number 50..4000" });
  }

  if (model) runtimeConfig.model = model;
  if (reasoning) runtimeConfig.reasoning = reasoning;
  if (mt !== undefined) runtimeConfig.maxTokens = mt;
  if (typeof ragEnabled === "boolean") runtimeConfig.ragEnabled = ragEnabled;

  res.json({ ok: true, runtimeConfig });
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
