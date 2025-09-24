import multer from "multer"
import path from "path"
import fs from "fs"
import type { Express } from "express"

// Ensure uploads directory exists
const uploadsDir = "uploads"
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow images and documents
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = allowedTypes.test(file.mimetype)

  if (mimetype && extname) {
    return cb(null, true)
  } else {
    cb(new Error("Invalid file type. Only images and documents are allowed."))
  }
}

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter,
})

export const uploadFields = upload.fields([
  { name: "idProof", maxCount: 1 },
  { name: "tradingLicense", maxCount: 1 },
  { name: "paymentProof", maxCount: 1 },
  { name: "agreementDocument", maxCount: 1 },
  { name: "organizationLogo", maxCount: 1 },
])
