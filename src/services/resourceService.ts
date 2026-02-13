// @ts-nocheck
import { Repository } from "typeorm";
import { Resource, ResourceType } from "../entities/Resource";
import dbConnection from "../db";

export interface UpdateResourceData {
  title?: string;
  description?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  pages?: string;
  isActive?: boolean;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

class ResourceService {
  private resourceRepository: Repository<Resource>;

  constructor() {
    this.resourceRepository = dbConnection.getRepository(Resource);
  }

  async getAllResources(includeInactive: boolean = false): Promise<ServiceResponse<Resource[]>> {
    try {
      const where = includeInactive ? {} : { isActive: true };
      
      const resources = await this.resourceRepository.find({
        where,
        order: { type: "ASC" }
      });

      return {
        success: true,
        message: "Resources retrieved successfully",
        data: resources
      };
    } catch (error: any) {
      console.error("Get resources error:", error);
      return {
        success: false,
        message: "Failed to retrieve resources",
        error: error.message
      };
    }
  }

  async getResourceByType(type: ResourceType): Promise<ServiceResponse<Resource>> {
    try {
      const resource = await this.resourceRepository.findOne({
        where: { type, isActive: true }
      });

      if (!resource) {
        return {
          success: false,
          message: "Resource not found"
        };
      }

      return {
        success: true,
        message: "Resource retrieved successfully",
        data: resource
      };
    } catch (error: any) {
      console.error("Get resource error:", error);
      return {
        success: false,
        message: "Failed to retrieve resource",
        error: error.message
      };
    }
  }

  async updateResource(
    type: ResourceType,
    data: UpdateResourceData,
    userId?: number
  ): Promise<ServiceResponse<Resource>> {
    try {
      let resource = await this.resourceRepository.findOne({
        where: { type }
      });

      if (!resource) {
        // Create new resource if it doesn't exist
        resource = this.resourceRepository.create({
          type,
          title: data.title || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          description: data.description || "",
          fileUrl: data.fileUrl || "",
          fileName: data.fileName || null,
          fileSize: data.fileSize || null,
          pages: data.pages || null,
          isActive: true,
          updatedBy: userId || null
        });
      } else {
        // Update existing resource
        Object.assign(resource, data);
        resource.updatedBy = userId || null;
      }

      const saved = await this.resourceRepository.save(resource);

      return {
        success: true,
        message: "Resource updated successfully",
        data: saved
      };
    } catch (error: any) {
      console.error("Update resource error:", error);
      return {
        success: false,
        message: "Failed to update resource",
        error: error.message
      };
    }
  }

  async incrementDownloadCount(type: ResourceType): Promise<ServiceResponse<Resource>> {
    try {
      const resource = await this.resourceRepository.findOne({
        where: { type, isActive: true }
      });

      if (!resource) {
        return {
          success: false,
          message: "Resource not found"
        };
      }

      resource.downloadCount += 1;
      const updated = await this.resourceRepository.save(resource);

      return {
        success: true,
        message: "Download count incremented",
        data: updated
      };
    } catch (error: any) {
      console.error("Increment download count error:", error);
      return {
        success: false,
        message: "Failed to increment download count",
        error: error.message
      };
    }
  }

  async initializeDefaultResources(): Promise<void> {
    try {
      const defaultResources = [
        {
          type: ResourceType.BROCHURE,
          title: "Product Brochure",
          description: "Complete overview of capabilities and features",
          pages: "8 pages"
        },
        {
          type: ResourceType.GUIDE,
          title: "BNR Compliance Guide",
          description: "How we ensure regulatory compliance",
          pages: "12 pages"
        },
        {
          type: ResourceType.WHITEPAPER,
          title: "Security Whitepaper",
          description: "Technical security architecture deep-dive",
          pages: "15 pages"
        },
        {
          type: ResourceType.IMPLEMENTATION_GUIDE,
          title: "Implementation Guide",
          description: "Step-by-step implementation methodology",
          pages: "10 pages"
        },
        {
          type: ResourceType.ROI_CALCULATOR,
          title: "ROI Calculator",
          description: "Estimate cost savings and efficiency gains",
          pages: "Excel"
        },
        {
          type: ResourceType.WALKTHROUGH,
          title: "Product Walkthrough",
          description: "Visual demonstration of key capabilities",
          pages: "8 min video"
        }
      ];

      for (const res of defaultResources) {
        const existing = await this.resourceRepository.findOne({
          where: { type: res.type }
        });

        if (!existing) {
          const resource = this.resourceRepository.create({
            ...res,
            fileUrl: `/resources/${res.type}.pdf`,
            isActive: true
          });
          await this.resourceRepository.save(resource);
        }
      }

      console.log("✅ Default resources initialized");
    } catch (error) {
      console.error("Failed to initialize default resources:", error);
    }
  }
}

export default new ResourceService();