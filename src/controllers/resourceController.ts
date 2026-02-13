import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import resourceService from "../services/resourceService";
import { ResourceType } from "../entities/Resource";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
}

class ResourceController {
  async getAllResources(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const result = await resourceService.getAllResources(includeInactive);

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

  async getResourceByType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = req.params.type as ResourceType;

      if (!Object.values(ResourceType).includes(type)) {
        res.status(400).json({
          success: false,
          message: "Invalid resource type"
        });
        return;
      }

      const result = await resourceService.getResourceByType(type);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }

  async updateResource(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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

      const type = req.params.type as ResourceType;

      if (!Object.values(ResourceType).includes(type)) {
        res.status(400).json({
          success: false,
          message: "Invalid resource type"
        });
        return;
      }

      const result = await resourceService.updateResource(
        type,
        req.body,
        req.user?.id
      );

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

  async incrementDownloadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = req.params.type as ResourceType;

      if (!Object.values(ResourceType).includes(type)) {
        res.status(400).json({
          success: false,
          message: "Invalid resource type"
        });
        return;
      }

      const result = await resourceService.incrementDownloadCount(type);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
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

export default new ResourceController();