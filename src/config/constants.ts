export const USER_ROLES = {
  SYSTEM_OWNER: "system_owner",
  CLIENT: "client",
} as const

export const ORGANIZATION_CATEGORIES = {
  CATEGORY_I: "Category I – Comprehensive Services",
  CATEGORY_II: "Category II – Limited Financial Services",
  CATEGORY_III: "Category III – Support/Intermediary Services",
} as const

export const CATEGORY_I_SERVICES = [
  "Mortgage finance",
  "Refinancing",
  "Development finance",
  "Credit guarantee",
  "Asset finance",
  "Finance lease",
  "Factoring business",
  "Money lending",
  "Pawnshop",
  "Debt collection services",
  "Credit intermediary",
  "Debt counsellor",
  "Performance security (≤ 50% of share capital on aggregate)",
  "Peer-to-peer lending platform",
] as const

export const CATEGORY_II_SERVICES = [
  "Asset finance",
  "Finance lease",
  "Factoring business",
  "Money lending",
  "Pawnshop",
  "Any other service as determined by the Central Bank",
] as const

export const CATEGORY_III_SERVICES = [
  "Debt collection services",
  "Credit intermediary",
  "Debt counsellor",
  "Peer-to-peer lending platform",
] as const

export const SHARE_TYPES = {
  ORDINARY: "Ordinary",
  PREFERRED: "Preferred",
  OTHERS: "Others",
} as const

export const LENDER_TYPES = {
  BANK: "Bank",
  FINANCIAL_INSTITUTION: "Financial Institution",
  INDIVIDUAL: "Individual",
  GOVERNMENT: "Government",
  OTHER: "Other",
} as const
