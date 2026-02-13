import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { Repository } from "typeorm";
import { Category } from "../entities/Category";
import { Organization } from "../entities/Organization";
import dbConnection from "../db";

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

class CategoryController {
  private categoryRepository: Repository<Category>;
  private organizationRepository: Repository<Organization>;

  constructor() {
    this.categoryRepository = dbConnection.getRepository(Category);
    this.organizationRepository = dbConnection.getRepository(Organization);
  }

  createCategory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const organizationId = req.organizationId || parseInt(req.params.organizationId);
      const { name, description, categoryCode } = req.body;

      // Validate organization exists and user has access
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });

      if (!organization) {
        res.status(404).json({
          success: false,
          message: "Organization not found",
        });
        return;
      }

      if (!organization.isActive) {
        res.status(400).json({
          success: false,
          message: "Cannot create category for inactive organization",
        });
        return;
      }

      // Check if category name already exists in this organization
      const existingCategory = await this.categoryRepository.findOne({
        where: {
          name,
          organizationId,
        },
      });

      if (existingCategory) {
        res.status(400).json({
          success: false,
          message: "Category with this name already exists in the organization",
        });
        return;
      }

      // Create category
      const category = this.categoryRepository.create({
        name,
        description,
        categoryCode,
        organization,
        organizationId,
        isActive: true,
        createdBy: req.user?.id,
      });

      const savedCategory = await this.categoryRepository.save(category);

      res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: savedCategory,
      });
    } catch (error: any) {
      console.error("Create category controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during category creation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  updateCategory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const categoryId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);
      const updateData = req.body;

      // Find category with organization validation
      const category = await this.categoryRepository.findOne({
        where: {
          id: categoryId,
          organizationId,
        },
        relations: ["organization"],
      });

      if (!category) {
        res.status(404).json({
          success: false,
          message: "Category not found or access denied",
        });
        return;
      }

      // Check if name is being changed and if it's unique
      if (updateData.name && updateData.name !== category.name) {
        const existingCategory = await this.categoryRepository.findOne({
          where: {
            name: updateData.name,
            organizationId,
          },
        });

        if (existingCategory && existingCategory.id !== categoryId) {
          res.status(400).json({
            success: false,
            message: "Category name already exists in the organization",
          });
          return;
        }
      }

      // Update category
      await this.categoryRepository.update(categoryId, {
        ...updateData,
        updatedBy: req.user?.id,
      });

      // Get updated category
      const updatedCategory = await this.categoryRepository.findOne({
        where: { id: categoryId },
        relations: ["services"],
      });

      res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: updatedCategory,
      });
    } catch (error: any) {
      console.error("Update category controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during category update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getCategoryById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categoryId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);
      const includeServices = req.query.includeServices === "true";

      const relations = includeServices ? ["services", "organization"] : ["organization"];

      const category = await this.categoryRepository.findOne({
        where: {
          id: categoryId,
          organizationId,
        },
        relations,
      });

      if (!category) {
        res.status(404).json({
          success: false,
          message: "Category not found or access denied",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Category retrieved successfully",
        data: category,
      });
    } catch (error: any) {
      console.error("Get category controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching category",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getCategories = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId || parseInt(req.params.organizationId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const isActive = req.query.isActive;
      const includeServices = req.query.includeServices === "true";

      const skip = (page - 1) * limit;

      const queryBuilder = this.categoryRepository.createQueryBuilder("category")
        .where("category.organizationId = :organizationId", { organizationId });

      if (includeServices) {
        queryBuilder.leftJoinAndSelect("category.services", "services");
      }

      if (search) {
        queryBuilder.andWhere(
          "(category.name ILIKE :search OR category.description ILIKE :search)",
          { search: `%${search}%` }
        );
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere("category.isActive = :isActive", { 
          isActive: isActive === "true" 
        });
      }

      queryBuilder
        .orderBy("category.createdAt", "DESC")
        .skip(skip)
        .take(limit);

      const [categories, total] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        message: "Categories retrieved successfully",
        data: {
          categories,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        },
      });
    } catch (error: any) {
      console.error("Get categories controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching categories",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  deleteCategory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categoryId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      // Find category with services
      const category = await this.categoryRepository.findOne({
        where: {
          id: categoryId,
          organizationId,
        },
        relations: ["services"],
      });

      if (!category) {
        res.status(404).json({
          success: false,
          message: "Category not found or access denied",
        });
        return;
      }

      // Check if category has active services
      const activeServices = category.services?.filter(service => service.isActive) || [];
      if (activeServices.length > 0) {
        res.status(400).json({
          success: false,
          message: "Cannot delete category with active services. Please deactivate or delete services first.",
          data: {
            activeServicesCount: activeServices.length,
            activeServices: activeServices.map(s => ({ id: s.id, name: s.name })),
          },
        });
        return;
      }

      // Soft delete the category
      await this.categoryRepository.softDelete(categoryId);

      res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete category controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during category deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  activateCategory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categoryId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      const category = await this.categoryRepository.findOne({
        where: {
          id: categoryId,
          organizationId,
        },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          message: "Category not found or access denied",
        });
        return;
      }

      await this.categoryRepository.update(categoryId, {
        isActive: true,
        updatedBy: req.user?.id,
      });

      res.status(200).json({
        success: true,
        message: "Category activated successfully",
      });
    } catch (error: any) {
      console.error("Activate category controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during category activation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  deactivateCategory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categoryId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      const category = await this.categoryRepository.findOne({
        where: {
          id: categoryId,
          organizationId,
        },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          message: "Category not found or access denied",
        });
        return;
      }

      await this.categoryRepository.update(categoryId, {
        isActive: false,
        updatedBy: req.user?.id,
      });

      res.status(200).json({
        success: true,
        message: "Category deactivated successfully",
      });
    } catch (error: any) {
      console.error("Deactivate category controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during category deactivation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new CategoryController();