import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { Repository } from "typeorm";
import { Service } from "../entities/Service";
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

interface ServiceResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

class ServiceController {
  private serviceRepository: Repository<Service>;
  private categoryRepository: Repository<Category>;
  private organizationRepository: Repository<Organization>;

  constructor() {
    this.serviceRepository = dbConnection.getRepository(Service);
    this.categoryRepository = dbConnection.getRepository(Category);
    this.organizationRepository = dbConnection.getRepository(Organization);
  }

  createService = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
      const categoryId = parseInt(req.params.categoryId);
      const {
        name,
        description,
        serviceCode,
        basePrice,
        pricingType,
        interestRate,
        minLoanAmount,
        maxLoanAmount,
        minTenureMonths,
        maxTenureMonths,
        requirements,
        eligibilityCriteria
      } = req.body;

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
          message: "Cannot create service for inactive organization",
        });
        return;
      }

      // Validate category exists and belongs to organization
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

      if (!category.isActive) {
        res.status(400).json({
          success: false,
          message: "Cannot create service for inactive category",
        });
        return;
      }

      // Check if service name already exists in this category
      const existingService = await this.serviceRepository.findOne({
        where: {
          name,
          categoryId,
        },
      });

      if (existingService) {
        res.status(400).json({
          success: false,
          message: "Service with this name already exists in the category",
        });
        return;
      }

      // Create service
      const service = this.serviceRepository.create({
        name,
        description,
        serviceCode,
        basePrice,
        pricingType,
        interestRate,
        minLoanAmount,
        maxLoanAmount,
        minTenureMonths,
        maxTenureMonths,
        requirements,
        eligibilityCriteria,
        category,
        categoryId,
        organization,
        organizationId,
        isActive: true,
        createdBy: req.user?.id,
      });

      const savedService = await this.serviceRepository.save(service);

      res.status(201).json({
        success: true,
        message: "Service created successfully",
        data: savedService,
      });
    } catch (error: any) {
      console.error("Create service controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during service creation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  updateService = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const serviceId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);
      const updateData = req.body;

      // Find service with organization validation
      const service = await this.serviceRepository.findOne({
        where: {
          id: serviceId,
          organizationId,
        },
        relations: ["category", "organization"],
      });

      if (!service) {
        res.status(404).json({
          success: false,
          message: "Service not found or access denied",
        });
        return;
      }

      // Check if name is being changed and if it's unique
      if (updateData.name && updateData.name !== service.name) {
        const existingService = await this.serviceRepository.findOne({
          where: {
            name: updateData.name,
            categoryId: service.categoryId,
          },
        });

        if (existingService && existingService.id !== serviceId) {
          res.status(400).json({
            success: false,
            message: "Service name already exists in this category",
          });
          return;
        }
      }

      // Update service
      await this.serviceRepository.update(serviceId, {
        ...updateData,
        updatedBy: req.user?.id,
      });

      // Get updated service
      const updatedService = await this.serviceRepository.findOne({
        where: { id: serviceId },
        relations: ["category"],
      });

      res.status(200).json({
        success: true,
        message: "Service updated successfully",
        data: updatedService,
      });
    } catch (error: any) {
      console.error("Update service controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during service update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getServiceById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const serviceId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      const service = await this.serviceRepository.findOne({
        where: {
          id: serviceId,
          organizationId,
        },
        relations: ["category", "organization"],
      });

      if (!service) {
        res.status(404).json({
          success: false,
          message: "Service not found or access denied",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Service retrieved successfully",
        data: service,
      });
    } catch (error: any) {
      console.error("Get service controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching service",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getServices = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId || parseInt(req.params.organizationId);
      const categoryId = parseInt(req.params.categoryId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const isActive = req.query.isActive;

      const skip = (page - 1) * limit;

      // Validate category exists and belongs to organization
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

      const queryBuilder = this.serviceRepository.createQueryBuilder("service")
        .where("service.organizationId = :organizationId", { organizationId })
        .andWhere("service.categoryId = :categoryId", { categoryId });

      if (search) {
        queryBuilder.andWhere(
          "(service.name ILIKE :search OR service.description ILIKE :search)",
          { search: `%${search}%` }
        );
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere("service.isActive = :isActive", { 
          isActive: isActive === "true" 
        });
      }

      queryBuilder
        .leftJoinAndSelect("service.category", "category")
        .orderBy("service.createdAt", "DESC")
        .skip(skip)
        .take(limit);

      const [services, total] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        message: "Services retrieved successfully",
        data: {
          services,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        },
      });
    } catch (error: any) {
      console.error("Get services controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching services",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  deleteService = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const serviceId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      const service = await this.serviceRepository.findOne({
        where: {
          id: serviceId,
          organizationId,
        },
      });

      if (!service) {
        res.status(404).json({
          success: false,
          message: "Service not found or access denied",
        });
        return;
      }

      // Soft delete the service
      await this.serviceRepository.softDelete(serviceId);

      res.status(200).json({
        success: true,
        message: "Service deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete service controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during service deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  activateService = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const serviceId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      const service = await this.serviceRepository.findOne({
        where: {
          id: serviceId,
          organizationId,
        },
      });

      if (!service) {
        res.status(404).json({
          success: false,
          message: "Service not found or access denied",
        });
        return;
      }

      await this.serviceRepository.update(serviceId, {
        isActive: true,
        updatedBy: req.user?.id,
      });

      res.status(200).json({
        success: true,
        message: "Service activated successfully",
      });
    } catch (error: any) {
      console.error("Activate service controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during service activation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  deactivateService = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const serviceId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      const service = await this.serviceRepository.findOne({
        where: {
          id: serviceId,
          organizationId,
        },
      });

      if (!service) {
        res.status(404).json({
          success: false,
          message: "Service not found or access denied",
        });
        return;
      }

      await this.serviceRepository.update(serviceId, {
        isActive: false,
        updatedBy: req.user?.id,
      });

      res.status(200).json({
        success: true,
        message: "Service deactivated successfully",
      });
    } catch (error: any) {
      console.error("Deactivate service controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during service deactivation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getServicesByOrganization = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId || parseInt(req.params.organizationId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const isActive = req.query.isActive;
      const categoryId = req.query.categoryId;

      const skip = (page - 1) * limit;

      const queryBuilder = this.serviceRepository.createQueryBuilder("service")
        .where("service.organizationId = :organizationId", { organizationId })
        .leftJoinAndSelect("service.category", "category");

      if (search) {
        queryBuilder.andWhere(
          "(service.name ILIKE :search OR service.description ILIKE :search OR category.name ILIKE :search)",
          { search: `%${search}%` }
        );
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere("service.isActive = :isActive", { 
          isActive: isActive === "true" 
        });
      }

      if (categoryId) {
        queryBuilder.andWhere("service.categoryId = :categoryId", { categoryId });
      }

      queryBuilder
        .orderBy("service.createdAt", "DESC")
        .skip(skip)
        .take(limit);

      const [services, total] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        message: "Services retrieved successfully",
        data: {
          services,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        },
      });
    } catch (error: any) {
      console.error("Get services by organization controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching services",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new ServiceController();