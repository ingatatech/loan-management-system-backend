import type { Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import dbConnection from "../db";
import { User } from "../entities/User";
import { Organization } from "../entities/Organization";
import { Loan } from "../entities/Loan";
import { UserService } from "../services/userService";
import type { AuthenticatedRequest } from "../middleware/auth";

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService(
      dbConnection.getRepository(User),
      dbConnection.getRepository(Organization),
      dbConnection.getRepository(Loan)
    );
  }

  /**
   * Create a new user
   * POST /api/organizations/:organizationId/users
   */
  createUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== CREATE USER CONTROLLER START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const createdBy = req.user?.id;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      const userData = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        phone: req.body.phone,
        role: req.body.role
      };

      console.log('Creating user:', { ...userData, organizationId });

      const result = await this.userService.createUser(
        userData,
        organizationId,
        createdBy
      );

      console.log('User creation result:', result.success);
      console.log('=== CREATE USER CONTROLLER END ===');

      if (result.success) {
        res.status(201).json(result);
      } else {
        const statusCode = result.message.includes('already exists') ? 409 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error('Create user controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while creating user",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  /**
   * Get all users in organization
   * GET /api/organizations/:organizationId/users
   */
  getAllUsers = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      const filters = {
        role: req.query.role as any,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        isActive: req.query.isActive === 'true' ? true : undefined
      };

      const result = await this.userService.getUsersByOrganization(
        organizationId,
        filters
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error('Get all users controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching users",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  /**
   * Get user by ID with details
   * GET /api/organizations/:organizationId/users/:userId
   */
  getUserById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const userId = parseInt(req.params.userId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "Invalid user ID"
        });
        return;
      }

      const result = await this.userService.getUserWithDetails(
        userId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error('Get user by ID controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching user",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  /**
   * Update user information
   * PUT /api/organizations/:organizationId/users/:userId
   */
  updateUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const userId = parseInt(req.params.userId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "Invalid user ID"
        });
        return;
      }

      const updateData = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
        isActive: req.body.isActive
      };

      const result = await this.userService.updateUser(
        userId,
        updateData,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "User not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error('Update user controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while updating user",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  /**
   * Deactivate user and optionally reassign loans
   * PATCH /api/organizations/:organizationId/users/:userId/deactivate
   */
  deactivateUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const userId = parseInt(req.params.userId);
      const reassignTo = req.body.reassignTo ? parseInt(req.body.reassignTo) : undefined;
      const reason = req.body.reason;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "Invalid user ID"
        });
        return;
      }

      const result = await this.userService.deactivateUser(
        userId,
        organizationId,
        reassignTo,
        reason
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "User not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error('Deactivate user controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while deactivating user",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  /**
   * Reset user password
   * POST /api/organizations/:organizationId/users/:userId/reset-password
   */
  resetUserPassword = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const userId = parseInt(req.params.userId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "Invalid user ID"
        });
        return;
      }

      const result = await this.userService.resetUserPassword(
        userId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "User not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error('Reset password controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while resetting password",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };
}