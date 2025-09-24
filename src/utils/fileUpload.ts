import multer from "multer"
import path from "path"
import fs from "fs"
import type { Express } from "express"

// Ensure upload directories exist
const ensureDirectoryExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "uploads/documents"

    if (file.mimetype.startsWith("image/")) {
      folder = "uploads/images"
    } else if (file.mimetype.includes("pdf")) {
      folder = "uploads/documents"
    }

    ensureDirectoryExists(folder)
    cb(null, folder)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`
    cb(null, fileName)
  },
})

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Invalid file type"))
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
})

export const uploadSingle = upload.single("document")
export const uploadMultiple = upload.array("documents", 5)
export const uploadFields = upload.fields([
  { name: "idProof", maxCount: 1 },
  { name: "addressProof", maxCount: 1 },
  { name: "businessLicense", maxCount: 1 },
  { name: "agreementDocument", maxCount: 1 },
])
