import { Router } from "express";
import { body } from "express-validator";
import AuthController from "../controllers/authController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import {  handleValidationErrors } from "../middleware/validation";
import {SystemOwnerController} from "../controllers/SystemOwnerController"

const router = Router();

const verifyOTPValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp").isLength({ min: 6, max: 6 }).isNumeric().withMessage("OTP must be a 6-digit number"),
  handleValidationErrors
];

const verify2FAOTPValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp").isLength({ min: 6, max: 6 }).isNumeric().withMessage("OTP must be a 6-digit number"),
  handleValidationErrors
];

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 8, max: 128 })
      .withMessage("Password must be between 8 and 128 characters"),
    handleValidationErrors,
  ],
  AuthController.login
);

router.post(
  "/request-password-reset",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    handleValidationErrors,
  ],
  AuthController.requestPasswordReset
);

router.post(
  "/reset-password",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    body("token")
      .isLength({ min: 32, max: 128 })
      .withMessage("Invalid reset token"),
    body("newPassword")
      .isLength({ min: 8, max: 128 })
      .withMessage("Password must be between 8 and 128 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage("Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character"),
    handleValidationErrors,
  ],
  AuthController.changePassword
);

/**
 * POST /auth/verify-token
 * Verify JWT token validity
 */
router.post(
  "/verify-token",
  [
    body("token")
      .notEmpty()
      .withMessage("Token is required"),
    handleValidationErrors,
  ],
  AuthController.verifyToken
);

/**
 * POST /auth/verify-otp
 * Verify OTP for password reset
 */
router.post("/verify-otp", verifyOTPValidation, AuthController.verifyOTP);

/**
 * POST /auth/verify-2fa-otp
 * Verify OTP for 2FA login
 */
router.post("/verify-2fa-otp", verify2FAOTPValidation, AuthController.verifyOTPFor2FA);

router.get(
  "/profile",
  authenticate,
  checkFirstLogin,
  AuthController.getProfile
);

/**
 * PUT /auth/profile
 * Update current user profile
 */
router.put(
  "/profile",
  authenticate,
  checkFirstLogin,
  [
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    body("phone")
      .optional()
      .isMobilePhone("any")
      .withMessage("Please provide a valid phone number"),
    handleValidationErrors,
  ],
  AuthController.updateProfile
);

/**
 * POST /auth/change-password
 * Change user password (authenticated users)
 */
router.post(
  "/change-password",
  [
    body("newPassword")
      .isLength({ min: 8, max: 128 })
      .withMessage("New password must be between 8 and 128 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage("New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character"),
    body("confirmPassword")
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error("Password confirmation does not match new password");
        }
        return true;
      }),
    handleValidationErrors,
  ],
  AuthController.changePassword
);

/**
 * POST /auth/refresh-token
 * Refresh JWT token
 */
router.post(
  "/refresh-token",
  authenticate,
  AuthController.refreshToken
);

/**
 * POST /auth/logout
 * Logout user (invalidate token)
 */
router.post(
  "/logout",
  authenticate,
  AuthController.logout
);

router.post(
  "/create-system-owner",
  [
    body("firstName").notEmpty().trim().withMessage("First Name is required"),
    body("lastName").notEmpty().trim().withMessage("Last Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").notEmpty().trim().withMessage("Phone Number is required"),
    body("organizationId").optional().isInt().withMessage("Organization ID must be an integer"),
    handleValidationErrors,
  ],
  SystemOwnerController.createSystemOwner,
);

router.post(
  "/change-system-owner",
  [
    body("firstName").notEmpty().trim().withMessage("First Name is required"),
    body("lastName").notEmpty().trim().withMessage("Last Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("telephone").notEmpty().trim().withMessage("Telephone Number is required"),
    body("organizationId").optional().isInt().withMessage("Organization ID must be an integer"),
    handleValidationErrors,
  ],
  SystemOwnerController.changeSystemOwner,
);

export default router;