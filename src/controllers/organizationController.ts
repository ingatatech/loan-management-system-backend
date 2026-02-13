import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import organizationService from "../services/organizationService";
import { UploadToCloud } from "../helpers/cloud";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
  organizationId?: number;
}

class OrganizationController {
  static async createOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationData = {
        name: req.body.name,
        selectedCategories: req.body.selectedCategories,
        categoriesData: req.body.categoriesData, // Make sure this matches frontend
        address: req.body.address,
        tinNumber: req.body.tinNumber,
        website: req.body.website,
        description: req.body.description,
        registrationNumber: req.body.registrationNumber,
        registrationDate: req.body.registrationDate ? new Date(req.body.registrationDate) : undefined,
        businessSector: req.body.businessSector,
        phone: req.body.phone,
        email: req.body.email,
        branches: req.body.branches, 
        adminUser: {
          username: req.body.adminUser?.username || req.body.adminUsername,
          email: req.body.adminUser?.email || req.body.adminEmail,
          password: req.body.adminUser?.password || req.body.adminPassword,
          phone: req.body.adminUser?.phone || req.body.adminPhone,
        },
      };
      const result = await organizationService.createOrganization(organizationData);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Create organization controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during organization creation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async updateOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.id);
      const updateData = req.body;

      const result = await organizationService.updateOrganization(
        organizationId,
        updateData,
        req.user?.id
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Organization not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Update organization controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during organization update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

static async getOrganizationById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = parseInt(req.params.id);
    const includeRelations = req.query.include === "true";

    const result = await organizationService.getOrganizationById(organizationId, includeRelations);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Get organization controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching organization",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

static async getAllOrganizations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const includeCategories = req.query.includeCategories === "true"; // New parameter

    const result = await organizationService.getAllOrganizations(page, limit, search, includeCategories);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get all organizations controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching organizations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
  static async uploadLogo(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = parseInt(req.params.id);

      if (!req.file) {
        res.status(400).json({
          success: false,
          message: "No logo file uploaded",
        });
        return;
      }

      // Validate file type (images only)
      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp"
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        res.status(400).json({
          success: false,
          message: "Invalid file type. Only image files are allowed.",
          allowedTypes: ["JPEG", "JPG", "PNG", "GIF", "WebP"]
        });
        return;
      }

      try {
        // Upload to cloud storage
        const uploadResult = await UploadToCloud(req.file);

        // Update organization with logo URL
        const result = await organizationService.uploadLogo(organizationId, uploadResult.secure_url);

        if (result.success) {
          res.status(200).json({
            success: true,
            message: "Logo uploaded successfully",
            data: {
              organizationId,
              logoUrl: uploadResult.secure_url,
              uploadDetails: {
                originalName: req.file.originalname,
                size: req.file.size,
                mimeType: req.file.mimetype,
                publicId: uploadResult.public_id,
              },
            },
          });
        } else {
          res.status(400).json(result);
        }
      } catch (uploadError: any) {
        res.status(500).json({
          success: false,
          message: "Failed to upload logo",
          error: process.env.NODE_ENV === "development" ? uploadError.message : "Upload failed"
        });
      }
    } catch (error: any) {
      console.error("Upload logo controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during logo upload",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async getOrganizationStats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = parseInt(req.params.id);

      const result = await organizationService.getOrganizationStats(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get organization stats controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching organization statistics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

static async activateOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = parseInt(req.params.id);

    // Call the service method that includes email notification
    const result = await organizationService.activateOrganization(organizationId, req.user?.id);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Activate organization controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during organization activation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

// Updated deactivateOrganization method in OrganizationController
static async deactivateOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = parseInt(req.params.id);

    // Call the service method that includes email notification
    const result = await organizationService.deactivateOrganization(organizationId, req.user?.id);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Deactivate organization controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during organization deactivation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

  static async deleteOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = parseInt(req.params.id);

      const result = await organizationService.deleteOrganization(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Delete organization controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during organization deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

static async addBranchToOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const organizationId = parseInt(req.params.id);
    // Extract from nested structure
    const branchData = { title: req.body.branch?.title || req.body.title };

    const result = await organizationService.addBranchToOrganization(
      organizationId,
      branchData,
      req.user?.id
    );

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Add branch controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while adding branch",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

static async updateBranch(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const organizationId = parseInt(req.params.id);
    const branchIndex = parseInt(req.params.branchIndex);
    // Extract from nested structure
    const branchData = { title: req.body.branch?.title || req.body.title };

    const result = await organizationService.updateOrganizationBranch(
      organizationId,
      branchIndex,
      branchData,
      req.user?.id
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      const statusCode = result.message === "Organization not found" ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error: any) {
    console.error("Update branch controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating branch",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}


static async deleteBranch(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = parseInt(req.params.id);
    const branchIndex = parseInt(req.params.branchIndex);

    const result = await organizationService.deleteOrganizationBranch(
      organizationId,
      branchIndex,
      req.user?.id
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      const statusCode = result.message === "Organization not found" ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error: any) {
    console.error("Delete branch controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while deleting branch",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

static async toggleBranchStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = parseInt(req.params.id);
    const branchIndex = parseInt(req.params.branchIndex);

    const result = await organizationService.toggleBranchStatus(
      organizationId,
      branchIndex,
      req.user?.id
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      const statusCode = result.message === "Organization not found" ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error: any) {
    console.error("Toggle branch status controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while toggling branch status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

static async getBranches(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = parseInt(req.params.id);

    const result = await organizationService.getOrganizationBranches(organizationId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Get branches controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching branches",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

}

export default OrganizationController;