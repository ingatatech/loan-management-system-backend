// @ts-nocheck
import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request } from "express";
import type { File } from "express";

// Comprehensive list of allowed file extensions
const allowedExtensions = {
  images: [
    ".jpg", ".jpeg", ".png", ".gif", ".tif", ".webp", 
    ".bmp", ".svg", ".ico", ".heic", ".tiff", ".psd", 
    ".ai", ".eps", ".raw", ".avif", ".jp2"
  ],
  audio: [
    ".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", 
    ".m4a", ".opus", ".aiff", ".alac", ".amr", ".mid", 
    ".midi", ".mp2", ".mpa", ".ra", ".weba"
  ],
  video: [
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", 
    ".wmv", ".m4v", ".3gp", ".mpg", ".mpeg", ".m2v", 
    ".m4p", ".m4v", ".mp2", ".mpe", ".mpv", ".mxf", 
    ".nsv", ".ogv", ".qt", ".rm", ".rmvb", ".svi", 
    ".vob", ".yuv"
  ],
  documents: [
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", 
    ".pptx", ".txt", ".rtf", ".csv", ".zip", ".rar", 
    ".7z", ".gz", ".tar", ".bz2", ".dmg", ".iso", 
    ".epub", ".mobi", ".pages", ".numbers", ".key", 
    ".odt", ".ods", ".odp", ".md", ".json", ".xml", 
    ".html", ".htm", ".log", ".sql", ".db", ".dat", 
    ".apk", ".exe", ".dll", ".msi"
  ],
  fonts: [
    ".ttf", ".otf", ".woff", ".woff2", ".eot", ".sfnt"
  ],
  archives: [
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", 
    ".xz", ".iso", ".dmg", ".pkg", ".deb", ".rpm"
  ],
  executables: [
    ".exe", ".msi", ".dmg", ".pkg", ".deb", ".rpm", 
    ".apk", ".app", ".bat", ".cmd", ".sh", ".bin"
  ],
  code: [
    ".js", ".ts", ".jsx", ".tsx", ".py", ".java", 
    ".c", ".cpp", ".h", ".cs", ".php", ".rb", 
    ".go", ".swift", ".kt", ".scala", ".sh", ".pl", 
    ".lua", ".sql", ".json", ".xml", ".yml", ".yaml", 
    ".ini", ".cfg", ".conf", ".env"
  ]
};

// Flatten all allowed extensions for quick lookup
const allAllowedExtensions = [
  ...allowedExtensions.images,
  ...allowedExtensions.audio,
  ...allowedExtensions.video,
  ...allowedExtensions.documents,
  ...allowedExtensions.fonts,
  ...allowedExtensions.archives,
  ...allowedExtensions.executables,
  ...allowedExtensions.code
];

const ensureDirectoryExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "uploads/others";
    
    if (file.mimetype.startsWith("image/")) {
      folder = "uploads/images";
    } else if (file.mimetype.startsWith("audio/")) {
      folder = "uploads/audio";
    } else if (file.mimetype.startsWith("video/")) {
      folder = "uploads/video";
    } else if (file.mimetype.startsWith("text/") || 
               file.mimetype.includes("document") || 
               file.mimetype.includes("pdf")) {
      folder = "uploads/documents";
    } else if (file.mimetype.includes("font")) {
      folder = "uploads/fonts";
    } else if (file.mimetype.includes("zip") || 
               file.mimetype.includes("compressed")) {
      folder = "uploads/archives";
    } else if (file.mimetype.includes("application/x-msdownload") || 
               file.mimetype.includes("application/x-executable")) {
      folder = "uploads/executables";
    } else if (file.mimetype.includes("application/javascript") || 
               file.mimetype.includes("text/x-")) {
      folder = "uploads/code";
    }

    ensureDirectoryExists(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, fileName);
  },
});

const fileFilter = (req: Request, file: File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allAllowedExtensions.includes(ext)) {
    return cb(null, true);
  }

  const error = new Error(
    `Invalid file type: ${ext}. Allowed types: ${Object.keys(allowedExtensions).join(", ")}.`
  );
  cb(error, false);
};

// Enhanced multer configuration with better limits
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 50, // Increased to support multiple document types
    fieldSize: 10 * 1024 * 1024,
  },
});

// Enhanced error handling middleware
export const handleMulterError = (error: any, req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          success: false,
          message: "File too large. Maximum size is 10MB per file.",
          error: error.message,
          details: `File '${error.field}' exceeded size limit`
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          message: "Too many files. Maximum 50 files allowed.",
          error: error.message,
          details: `Limit exceeded for field '${error.field}'`
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          success: false,
          message: "Unexpected file field.",
          error: error.message,
          details: `Field '${error.field}' was not expected`
        });
      case "LIMIT_FIELD_KEY":
        return res.status(400).json({
          success: false,
          message: "Field name too long.",
          error: error.message,
          details: `Field name exceeds maximum length`
        });
      case "LIMIT_FIELD_VALUE":
        return res.status(400).json({
          success: false,
          message: "Field value too large.",
          error: error.message,
          details: `Field '${error.field}' value exceeds size limit`
        });
      case "LIMIT_FIELD_COUNT":
        return res.status(400).json({
          success: false,
          message: "Too many fields.",
          error: error.message,
          details: "Maximum number of fields exceeded"
        });
      case "LIMIT_PART_COUNT":
        return res.status(400).json({
          success: false,
          message: "Too many parts.",
          error: error.message,
          details: "Maximum number of form parts exceeded"
        });
      default:
        return res.status(400).json({
          success: false,
          message: "File upload error.",
          error: error.message,
          details: `Multer error code: ${error.code}`
        });
    }
  }

  if (error.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: error.message,
      error: "Invalid file type",
      details: `Allowed types: ${Object.keys(allowedExtensions).join(", ")}`,
      allowedExtensions: allowedExtensions
    });
  }

  next(error);
};

// ✅ ENHANCED: Upload fields configuration for loan applications
export const uploadFields = upload.fields([
  // Standard document uploads
  { name: "documents", maxCount: 10 },
  { name: "document", maxCount: 10 },
  { name: "images", maxCount: 5 },
  { name: "attachments", maxCount: 10 },
  { name: "videos", maxCount: 3 },
  { name: "audio", maxCount: 5 },
  { name: "fonts", maxCount: 5 },
  { name: "archives", maxCount: 5 },
  { name: "code", maxCount: 10 },
  
  // Profile uploads
  { name: "profilePicture", maxCount: 1 },
  { name: "employeeSignature", maxCount: 1 },
  { name: "organizationLogoUrl", maxCount: 1 },
  { name: "organizationLogo", maxCount: 1 },
  
  // HR/Employee documents
  { name: "idProof", maxCount: 1 },
  { name: "idProofDocument", maxCount: 1 },
  { name: "cvDocument", maxCount: 1 },
  { name: "appointmentLetter", maxCount: 1 },
  { name: "qualificationCertificates", maxCount: 10 },
  { name: "additionalDocuments", maxCount: 10 },
  
  // Organization documents
  { name: "tradingLicense", maxCount: 1 },
  { name: "paymentProof", maxCount: 1 },
  { name: "agreementDocument", maxCount: 1 },
  
  // ========================================
  // ✅ ENHANCED: Collateral Documents (up to 5 each)
  // ========================================
  { name: "proofOfOwnership", maxCount: 5 },
  { name: "ownerIdentification", maxCount: 5 },
  { name: "legalDocument", maxCount: 5 },
  { name: "physicalEvidence", maxCount: 5 },
  { name: "valuationReport", maxCount: 5 },
  
  // ========================================
  // ✅ NEW: Guarantor Documents
  // ========================================
  { name: "guarantorIdentification", maxCount: 5 },
  { name: "guarantorCrbReport", maxCount: 1 },
  
  // ========================================
  // ✅ NEW: Borrower/Institution Documents
  // ========================================
  // Marriage-related documents
  { name: "marriageCertificate", maxCount: 1 },
  { name: "spouseCrbReport", maxCount: 1 },
  { name: "spouseIdentification", maxCount: 1 },
  
  // Witness documents
  { name: "witnessCrbReport", maxCount: 1 },
  { name: "witnessIdentification", maxCount: 1 },
  
  // Institution documents (RDB, RGB, RCA)
  { name: "institutionLegalDocument", maxCount: 1 }, // RDB for company
  { name: "cooperativeLegalDocument", maxCount: 1 }, // RGB for cooperative
  { name: "otherInstitutionLegalDocument", maxCount: 1 }, // RCA for other
  { name: "institutionLicense", maxCount: 1 },
  { name: "institutionTradingLicense", maxCount: 1 },
  { name: "institutionRegistration", maxCount: 1 },
  
  // ========================================
  // ✅ NEW: Additional Collateral Documents (Dynamic)
  // ========================================
  { name: "additionalCollateralDocs", maxCount: 10 },

   { name: "shareholderIdentification", maxCount: 10 },
  { name: "boardMemberIdentification", maxCount: 10 },
  { name: "proofOfShares", maxCount: 10 },
  { name: "boardResolution", maxCount: 5 },
  { name: "shareholderCrbReport", maxCount: 10 },
  { name: "boardMemberCrbReport", maxCount: 10 },
]);

// Specific configurations for different use cases
export const uploadSingle = upload.single("document");
export const uploadSingledocument = upload.single("attached_documents");
export const uploadMultiple = upload.array("documents", 10);

export const uploadShareholderDocument = upload.fields([
  { name: "document", maxCount: 1 }, 
  { name: "idProof", maxCount: 1 },
  { name: "tradingLicense", maxCount: 1 },
  { name: "paymentProof", maxCount: 1 },
  { name: "agreementDocument", maxCount: 1 },
  { name: "organizationLogo", maxCount: 1 },
]);

// Additional utility exports
export const getAllowedExtensions = () => ({ ...allowedExtensions });
export const isExtensionAllowed = (ext: string) => allAllowedExtensions.includes(ext.toLowerCase());

export default upload;