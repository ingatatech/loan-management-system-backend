
import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { OtherInformationController } from "../controllers/otherInformationController";

import {  param } from "express-validator"
import {  } from "../middleware/auth"
import  tenantIsolation  from "../middleware/tenantIsolation"
import { requireClient } from "../middleware/rbac"
import { handleValidationErrors, validateFileUpload } from "../middleware/validation"
import  { uploadFields } from "../helpers/multer"
const router = Router({ mergeParams: true });
const otherInformationController = new OtherInformationController();


router.get(
  "/",
  authenticate,
  otherInformationController.getOtherInformation
);
router.get(
  "/supplementary-information",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    handleValidationErrors
  ],
  authenticate,
  tenantIsolation,
  otherInformationController.getSupplementaryInformation
);

export default router;