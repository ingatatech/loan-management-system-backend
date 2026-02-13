// @ts-nocheck
import multer from "multer";
import path from "path";
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

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();

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
    files: 100, // Increased to support multiple document types
    fieldSize: 20 * 1024 * 1024,
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
          message: "Too many files. Maximum 100 files allowed.",
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

// ✅ ENHANCED: Upload fields configuration for loan applications with new fields
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
  { name: "institutionLegalDocument", maxCount: 1 },
  { name: "cooperativeLegalDocument", maxCount: 1 },
  { name: "otherInstitutionLegalDocument", maxCount: 1 },
  { name: "institutionLicense", maxCount: 1 },
  { name: "institutionTradingLicense", maxCount: 1 },
  { name: "institutionRegistration", maxCount: 1 },

  // ========================================
  // ✅ NEW: Additional Collateral Documents (Dynamic)
  // ========================================
  { name: "additionalCollateralDocs", maxCount: 10 },
  { name: "occupationSupportingDocuments", maxCount: 20 },

  { name: "institutionRelevantDocuments", maxCount: 20 },

  // ========================================
  // ✅ ENHANCED: Shareholder/Board Member Documents
  // ========================================
  { name: "shareholderIdentification", maxCount: 10 },
  { name: "boardMemberIdentification", maxCount: 10 },
  { name: "proofOfShares", maxCount: 10 },
  { name: "boardResolution", maxCount: 5 },
  { name: "shareholderCrbReport", maxCount: 10 },
  { name: "boardMemberCrbReport", maxCount: 10 },
  { name: "upiFile", maxCount: 1 },
  // ========================================
  // ✅ NEW: Borrower Documents (Dynamic)
  // ========================================
  { name: "borrowerDocuments", maxCount: 20 },
  { name: "loanRelevantDocuments", maxCount: 20 },

  // ========================================
  // ✅ NEW: Guarantor Additional Documents (Dynamic)
  // ========================================
  { name: "guarantorAdditionalDocs", maxCount: 20 },
  { name: "requestedDocuments", maxCount: 50 },
  // ========================================
  // ✅ NEW: Shareholder/Board Member Additional Documents
  // ========================================
  { name: "shareholderAdditionalDocs", maxCount: 20 },
  { name: "boardMemberAdditionalDocs", maxCount: 20 },
  { name: "forwardDocuments", maxCount: 10 },
  { name: "reviewProcessDocument", maxCount: 1 },
  { name: "reviewAttachment", maxCount: 1 },
  { name: "reviewAttachments", maxCount: 5 },
  { name: "borrowerProfilePicture", maxCount: 1 },
  { name: "notarisedContractFile", maxCount: 1 },
  { name: "notarisedAOMAFile", maxCount: 1 },
  { name: "rdbFeesFile", maxCount: 1 },
  { name: "proofOfDisbursementFile", maxCount: 1 },
  { name: 'loanOfficerSignature', maxCount: 1 },
  { name: 'managingDirectorSignature', maxCount: 1 },
  { name: "mortgageRegistrationCertificate", maxCount: 1 },
  { name: "paymentProofUrl", maxCount: 1 },
  { name: "paymentProof", maxCount: 1 },
  
]);
export const uploadRequestedDocuments = upload.array("requestedDocuments", 50);
export const uploadReviewAttachment = upload.array("requestedDocuments", 50);

// Specific configurations for different use cases
export const uploadForwardDocuments = upload.array("forwardDocuments", 10);
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