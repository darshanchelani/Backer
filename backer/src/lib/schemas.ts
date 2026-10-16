import { z } from "zod";

// ── Shared schemas: used by API routes AND client forms so validation
//    can never drift between the two.

export const investorTypeSchema = z.enum(["LEAD", "FOLLOW_ON", "BOARD", "ANGEL", "OTHER"]);

export const investorInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  firm: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  type: investorTypeSchema.default("OTHER"),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type InvestorInput = z.infer<typeof investorInputSchema>;

export const stageSchema = z.enum(["PRE_SEED", "SEED", "SERIES_A", "SERIES_B_PLUS"]);
export const cadenceSchema = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]);

export const onboardingSchema = z.object({
  founderName: z.string().trim().min(1, "Your name is required.").max(120),
  companyName: z.string().trim().min(1, "Company name is required.").max(120),
  stage: stageSchema,
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    }),
  cadence: cadenceSchema.default("MONTHLY"),
  cadenceAnchorDay: z.number().int().min(0).max(28).nullish(),
  investors: z.array(investorInputSchema).max(500).default([]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const STAGE_LABELS: Record<z.infer<typeof stageSchema>, string> = {
  PRE_SEED: "Pre-seed",
  SEED: "Seed",
  SERIES_A: "Series A",
  SERIES_B_PLUS: "Series B+",
};

export const INVESTOR_TYPE_LABELS: Record<z.infer<typeof investorTypeSchema>, string> = {
  LEAD: "Lead",
  FOLLOW_ON: "Follow-on",
  BOARD: "Board",
  ANGEL: "Angel",
  OTHER: "Other",
};

export const CADENCE_LABELS: Record<z.infer<typeof cadenceSchema>, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
};
