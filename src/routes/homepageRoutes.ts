import { Router } from "express";
import { body, param, query } from "express-validator";
import demoRequestController from "../controllers/demoRequestController";
import homepageSettingsController from "../controllers/homepageSettingsController";
import resourceController from "../controllers/resourceController";
import { authenticate } from "../middleware/auth";
import { requireSystemOwner } from "../middleware/rbac";
import { handleValidationErrors } from "../middleware/validation";

const router = Router();


router.post(
  "/demo-requests",
  [
    body("institutionName")
      .trim()
      .notEmpty()
      .withMessage("Institution name is required")
      .isLength({ min: 2, max: 255 })
      .withMessage("Institution name must be between 2 and 255 characters"),
    
    body("institutionType")
      .trim()
      .notEmpty()
      .withMessage("Institution type is required"),
    
    body("fullName")
      .trim()
      .notEmpty()
      .withMessage("Full name is required")
      .isLength({ min: 2, max: 255 })
      .withMessage("Full name must be between 2 and 255 characters"),
    
    body("jobTitle")
      .trim()
      .notEmpty()
      .withMessage("Job title is required"),
    
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    
    body("phone")
      .trim()
      .notEmpty()
      .withMessage("Phone number is required"),
    
    body("interests")
      .optional()
      .isArray()
      .withMessage("Interests must be an array"),
    
    handleValidationErrors
  ],
  demoRequestController.createDemoRequest
);

router.get(
  "/settings",
  homepageSettingsController.getSettings
);

router.get(
  "/resources",
  resourceController.getAllResources
);

router.get(
  "/resources/:type",
  [
    param("type")
      .isIn(["brochure", "guide", "whitepaper", "implementation_guide", "roi_calculator", "walkthrough"])
      .withMessage("Invalid resource type"),
    handleValidationErrors
  ],
  resourceController.getResourceByType
);

router.post(
  "/resources/:type/download",
  [
    param("type")
      .isIn(["brochure", "guide", "whitepaper", "implementation_guide", "roi_calculator", "walkthrough"])
      .withMessage("Invalid resource type"),
    handleValidationErrors
  ],
  resourceController.incrementDownloadCount
);


router.get(
  "/demo-requests",
  authenticate,
  requireSystemOwner,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    handleValidationErrors
  ],
  demoRequestController.getAllDemoRequests
);

router.patch(
  "/demo-requests/:id",
  authenticate,
  requireSystemOwner,
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Valid ID is required"),
    body("status")
      .isIn(["pending", "contacted", "completed", "spam"])
      .withMessage("Invalid status"),
    body("notes")
      .optional()
      .trim(),
    handleValidationErrors
  ],
  demoRequestController.updateDemoRequestStatus
);

router.delete(
  "/demo-requests/:id",
  authenticate,
  requireSystemOwner,
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Valid ID is required"),
    handleValidationErrors
  ],
  demoRequestController.deleteDemoRequest
);

router.get(
  "/demo-requests/stats",
  authenticate,
  requireSystemOwner,
  demoRequestController.getDemoRequestStats
);

router.put(
  "/settings",
  authenticate,
  requireSystemOwner,
  [
    body("phone")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Phone cannot be empty if provided"),
    body("salesEmail")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid sales email is required"),
    body("officeAddress")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Office address cannot be empty if provided"),
    handleValidationErrors
  ],
  homepageSettingsController.updateSettings
);

router.put(
  "/resources/:type",
  authenticate,
  requireSystemOwner,
  [
    param("type")
      .isIn(["brochure", "guide", "whitepaper", "implementation_guide", "roi_calculator", "walkthrough"])
      .withMessage("Invalid resource type"),
    body("title")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Title cannot be empty if provided"),
    body("description")
      .optional()
      .trim(),
    body("fileUrl")
      .optional()
      .isURL()
      .withMessage("Valid file URL is required"),
    body("pages")
      .optional()
      .trim(),
    handleValidationErrors
  ],
  resourceController.updateResource
);

export default router;