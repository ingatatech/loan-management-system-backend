import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import demoRequestService from "../services/demoRequestService";
import { DemoRequestStatus } from "../entities/DemoRequest";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
}

class DemoRequestController {
  async createDemoRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const result = await demoRequestService.createDemoRequest(req.body);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }

  async getAllDemoRequests(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        status: req.query.status as DemoRequestStatus | undefined,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20
      };

      const result = await demoRequestService.getAllDemoRequests(filters);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }

  async updateDemoRequestStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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

      const id = parseInt(req.params.id);
      const { status, notes } = req.body;

      const result = await demoRequestService.updateDemoRequestStatus(
        id,
        status as DemoRequestStatus,
        notes,
        req.user?.id
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Demo request not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }

  async deleteDemoRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      const result = await demoRequestService.deleteDemoRequest(id);

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Demo request not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }

  async getDemoRequestStats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await demoRequestService.getDemoRequestStats();

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }
}

export default new DemoRequestController();