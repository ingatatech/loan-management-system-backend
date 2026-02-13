import { Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import dbConnection from "../db";
import { PricingItem } from "../entities/Pricingitem";
import { AuthenticatedRequest } from "./authController";

// ─────────────────────────────────────────────────────────────────────────────
// Validation middleware helpers (reuse same pattern as authController)
// ─────────────────────────────────────────────────────────────────────────────

export const createPricingValidation = [
  body("amount")
    .trim()
    .notEmpty().withMessage("Amount is required")
    .isLength({ max: 100 }).withMessage("Amount must not exceed 100 characters"),
  body("description")
    .trim()
    .notEmpty().withMessage("Description is required")
    .isLength({ max: 500 }).withMessage("Description must not exceed 500 characters"),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 }).withMessage("Sort order must be a non-negative integer"),
  body("isActive")
    .optional()
    .isBoolean().withMessage("isActive must be a boolean"),
];

export const updatePricingValidation = [
  param("id").isInt({ min: 1 }).withMessage("Valid pricing item ID is required"),
  body("amount")
    .optional()
    .trim()
    .notEmpty().withMessage("Amount cannot be empty")
    .isLength({ max: 100 }).withMessage("Amount must not exceed 100 characters"),
  body("description")
    .optional()
    .trim()
    .notEmpty().withMessage("Description cannot be empty")
    .isLength({ max: 500 }).withMessage("Description must not exceed 500 characters"),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 }).withMessage("Sort order must be a non-negative integer"),
  body("isActive")
    .optional()
    .isBoolean().withMessage("isActive must be a boolean"),
];

export const pricingIdValidation = [
  param("id").isInt({ min: 1 }).withMessage("Valid pricing item ID is required"),
];

// ─────────────────────────────────────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────────────────────────────────────

export class PricingController {
  /**
   * GET /api/pricing
   * Public — returns all active pricing items ordered by sortOrder.
   * Used by the homepage to render dynamic pricing cards.
   */
  static getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = dbConnection.getRepository(PricingItem);

      const items = await repo.find({
        where: { isActive: true },
        order: { sortOrder: "ASC", createdAt: "ASC" },
      });

      res.status(200).json({
        success: true,
        message: "Pricing items retrieved successfully",
        data: items,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/pricing/all
   * System-owner only — returns ALL items (including inactive) for the dashboard.
   */
  static getAllAdmin = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const repo = dbConnection.getRepository(PricingItem);

      const items = await repo.find({
        order: { sortOrder: "ASC", createdAt: "ASC" },
      });

      res.status(200).json({
        success: true,
        message: "All pricing items retrieved successfully",
        data: items,
        total: items.length,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/pricing/:id
   * System-owner only — retrieve a single pricing item by ID.
   */
  static getOne = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const repo = dbConnection.getRepository(PricingItem);
      const item = await repo.findOne({ where: { id: Number(req.params.id) } });

      if (!item) {
        res.status(404).json({
          success: false,
          message: "Pricing item not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Pricing item retrieved successfully",
        data: item,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/pricing
   * System-owner only — create a new pricing item.
   */
  static create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const { amount, description, sortOrder = 0, isActive = true } = req.body;

      const repo = dbConnection.getRepository(PricingItem);

      const item = repo.create({
        amount: amount.trim(),
        description: description.trim(),
        sortOrder: Number(sortOrder),
        isActive: Boolean(isActive),
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });

      const saved = await repo.save(item);

      res.status(201).json({
        success: true,
        message: "Pricing item created successfully",
        data: saved,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/pricing/:id
   * System-owner only — update an existing pricing item.
   */
  static update = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const repo = dbConnection.getRepository(PricingItem);
      const item = await repo.findOne({ where: { id: Number(req.params.id) } });

      if (!item) {
        res.status(404).json({
          success: false,
          message: "Pricing item not found",
        });
        return;
      }

      const { amount, description, sortOrder, isActive } = req.body;

      if (amount !== undefined)      item.amount      = amount.trim();
      if (description !== undefined) item.description = description.trim();
      if (sortOrder !== undefined)   item.sortOrder   = Number(sortOrder);
      if (isActive !== undefined)    item.isActive    = Boolean(isActive);
      item.updatedBy = req.user.id;

      const updated = await repo.save(item);

      res.status(200).json({
        success: true,
        message: "Pricing item updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/pricing/:id/toggle
   * System-owner only — toggle active/inactive status.
   */
  static toggleActive = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const repo = dbConnection.getRepository(PricingItem);
      const item = await repo.findOne({ where: { id: Number(req.params.id) } });

      if (!item) {
        res.status(404).json({ success: false, message: "Pricing item not found" });
        return;
      }

      item.isActive  = !item.isActive;
      item.updatedBy = req.user.id;

      const updated = await repo.save(item);

      res.status(200).json({
        success: true,
        message: `Pricing item ${updated.isActive ? "activated" : "deactivated"} successfully`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/pricing/:id
   * System-owner only — soft-delete a pricing item.
   */
  static remove = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const repo = dbConnection.getRepository(PricingItem);
      const item = await repo.findOne({ where: { id: Number(req.params.id) } });

      if (!item) {
        res.status(404).json({ success: false, message: "Pricing item not found" });
        return;
      }

      // Soft-delete via TypeORM DeleteDateColumn
      await repo.softDelete(item.id);

      res.status(200).json({
        success: true,
        message: "Pricing item deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/pricing/reorder
   * System-owner only — bulk reorder items.
   * Body: { items: [{ id: number, sortOrder: number }, ...] }
   */
  static reorder = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      const { items } = req.body as { items: { id: number; sortOrder: number }[] };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          success: false,
          message: "items array is required and must not be empty",
        });
        return;
      }

      const repo = dbConnection.getRepository(PricingItem);

      await Promise.all(
        items.map(({ id, sortOrder }) =>
          repo.update(id, { sortOrder, updatedBy: req.user!.id })
        )
      );

      res.status(200).json({
        success: true,
        message: "Pricing items reordered successfully",
      });
    } catch (error) {
      next(error);
    }
  };
}