import { Router } from "express"
import { body, param } from "express-validator"
import { ManagementController } from "../controllers/managementController"
import { authenticate } from "../middleware/auth"
import  tenantIsolation  from "../middleware/tenantIsolation"
import { requireClient } from "../middleware/rbac"
import { handleValidationErrors, validateFileUpload } from "../middleware/validation"
import  { uploadFields } from "../helpers/multer"

const router = Router()
const managementController = new ManagementController()

const boardDirectorValidation = [
  body("name").notEmpty().withMessage("Director name is required"),
  body("position").notEmpty().withMessage("Position is required"),
  body("nationality").notEmpty().withMessage("Nationality is required"),
  body("idPassport").notEmpty().withMessage("ID/Passport is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("address.country").notEmpty().withMessage("Address country is required"),
  body("address.province").notEmpty().withMessage("Address province is required"),
  body("qualifications").notEmpty().withMessage("Qualification is required"),
  body("experience").notEmpty().withMessage("Experience is required"),
  body("currentOccupation").notEmpty().withMessage("Current occupation is required"),
]

const seniorManagementValidation = [
  body("name").notEmpty().withMessage("Manager name is required"),
  body("position").notEmpty().withMessage("Position is required"),
  body("experienceBackground").notEmpty().withMessage("Experience background is required"),
  body("phone").isMobilePhone("any").withMessage("Valid phone number is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("address.country").notEmpty().withMessage("Address country is required"),
  body("address.province").notEmpty().withMessage("Address province is required"),
]

const managementIdValidation = [param("id").isInt().withMessage("Valid management ID is required")]

const extendBoardDirectorValidation = [
  body("accountNumber").optional().isString().withMessage("Account number must be a string"),
  body("salutation").optional().isString().withMessage("Salutation must be a string"),
  body("surname").optional().isString().withMessage("Surname must be a string"),
  body("forename1").optional().isString().withMessage("Forename 1 must be a string"),
  body("forename2").optional().isString().withMessage("Forename 2 must be a string"),
  body("forename3").optional().isString().withMessage("Forename 3 must be a string"),
  body("nationalIdNumber").optional().isString().withMessage("National ID number must be a string"),
  body("passportNo").optional().isString().withMessage("Passport number must be a string"),
  body("dateOfBirth").optional().isISO8601().withMessage("Date of birth must be a valid date"),
  body("placeOfBirth").optional().isString().withMessage("Place of birth must be a string"),
  body("postalAddressLine1").optional().isString().withMessage("Postal address line 1 must be a string"),
  body("postalCode").optional().isString().withMessage("Postal code must be a string"),
  body("town").optional().isString().withMessage("Town must be a string"),
]

router.put(
  "/board-directors/:id/extend",
  authenticate,
  requireClient,
  tenantIsolation,
  managementIdValidation,
  extendBoardDirectorValidation,
  handleValidationErrors,
  managementController.extendBoardDirector,
)

router.post(
  "/board-directors",
  authenticate,
  requireClient,
  tenantIsolation,
  uploadFields,
  validateFileUpload,
  boardDirectorValidation,
  handleValidationErrors,
  managementController.addBoardDirector,
)
router.get("/board-directors", authenticate, tenantIsolation, managementController.getBoardDirectors)
router.put(
  "/board-directors/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  managementIdValidation,
  handleValidationErrors,
  managementController.updateBoardDirector,
)
router.delete(
  "/board-directors/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  managementIdValidation,
  handleValidationErrors,
  managementController.deleteBoardDirector,
)

router.post(
  "/senior-management",
  authenticate,
  requireClient,
  tenantIsolation,
  uploadFields,
  validateFileUpload,
  seniorManagementValidation,
  handleValidationErrors,
  managementController.addSeniorManagement,
)
router.get("/senior-management", authenticate, tenantIsolation, managementController.getSeniorManagement)
router.put(
  "/senior-management/:id",
  authenticate,
  tenantIsolation,
  managementIdValidation,
  handleValidationErrors,
  managementController.updateSeniorManagement,
)
router.delete(
  "/senior-management/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  managementIdValidation,
  handleValidationErrors,
  managementController.deleteSeniorManagement,
)

router.get("/team", authenticate, requireClient, tenantIsolation, managementController.getManagementTeam)

export default router
