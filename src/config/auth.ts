import dotenv from "dotenv"
import type { Secret } from "jsonwebtoken"

dotenv.config()

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables")
}

export const JWT_SECRET: Secret = process.env.JWT_SECRET
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h"

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      JWT_SECRET: string
      JWT_EXPIRES_IN?: string
      [key: string]: string | undefined
    }
  }
}
