// @ts-nocheck

import type { Repository } from "typeorm"
import { Organization } from "../entities/Organization"
import { User, UserRole } from "../entities/User"
import { Category } from "../entities/Category"
import { Service } from "../entities/Service"
import dbConnection from "../db"
import { sendLoginInstructionsEmail } from "../templates/userInstruct"
import { generateRandomString } from "../utils/helpers"
import { 
  sendActivationNotification,
  sendDeactivationNotification 
} from '../services/organizationEmailFunctions';
export interface OrganizationCreationData {
  name: string
  selectedCategories: string[]
  categoriesData?: Array<{
    name: string
    services: Array<{
      name: string
      description: string
    }>
  }>
  address?: {
    country?: string
    province?: string
    district?: string
    sector?: string
    cell?: string
    village?: string
    street?: string
    houseNumber?: string
    poBox?: string
  }
  tinNumber?: string
  website?: string
  description?: string
  registrationNumber?: string
  registrationDate?: Date
  businessSector?: string
  phone?: string
  email?: string
    branches?: Array<{ // Add this
    title: string
  }>
  adminUser: {
    username: string
    email: string
    password?: string // Make password optional
    phone?: string
    branch?: string 
  }
}

export interface OrganizationUpdateData {
  name?: string
  selectedCategories?: string[]
  address?: any
  tinNumber?: string
  website?: string
  description?: string
  registrationNumber?: string
  registrationDate?: Date
  businessSector?: string
  phone?: string
  email?: string
    branches?: Array<{ // Add this
    title: string
  }>
  categoriesData?: Array<{
    name: string
    services: Array<{
      name: string
      description: string
      id?: number
    }>
  }>
}

export interface ServiceResponse<T> {
  success: boolean
  message: string
  data?: T
  error?: string
  debug?: any
}

class OrganizationService {
  private organizationRepository: Repository<Organization>
  private userRepository: Repository<User>
  private categoryRepository: Repository<Category>
  private serviceRepository: Repository<Service>

  constructor() {
    this.organizationRepository = dbConnection.getRepository(Organization)
    this.userRepository = dbConnection.getRepository(User)
    this.categoryRepository = dbConnection.getRepository(Category)
    this.serviceRepository = dbConnection.getRepository(Service)
  }

  async createOrganization(organizationData: OrganizationCreationData): Promise<ServiceResponse<Organization>> {


    const queryRunner = dbConnection.createQueryRunner()

    try {
      await queryRunner.connect()

      await queryRunner.startTransaction()

      // Step 1: Check if organization name already exists
      const existingOrganization = await this.organizationRepository.findOne({
        where: { name: organizationData.name },
      })

      if (existingOrganization) {
        await queryRunner.rollbackTransaction()
        return {
          success: false,
          message: "Organization with this name already exists",
          debug: {
            step: "organization_name_check",
            existingOrganization: { id: existingOrganization.id, name: existingOrganization.name },
          },
        }
      }

      // Step 2: Check if admin email already exists
      const existingUser = await this.userRepository.findOne({
        where: { email: organizationData.adminUser.email },
      })

      if (existingUser) {
        await queryRunner.rollbackTransaction()
        return {
          success: false,
          message: "Admin email already exists",
          debug: {
            step: "admin_email_check",
            existingUser: { id: existingUser.id, email: existingUser.email },
          },
        }
      }

      // Step 3: Create organization
      const organization = this.organizationRepository.create({
        name: organizationData.name,
        selectedCategories: organizationData.selectedCategories,
       branches: organizationData.branches || null,
        address: organizationData.address || null,
        tinNumber: organizationData.tinNumber || null,
        website: organizationData.website || null,
        description: organizationData.description || null,
        registrationNumber: organizationData.registrationNumber || null,
        registrationDate: organizationData.registrationDate || null,
        businessSector: organizationData.businessSector || null,
        phone: organizationData.phone || null,
        email: organizationData.email || null,
        isActive: true,
      })

      const savedOrganization = await queryRunner.manager.save(Organization, organization)


      const verifyOrganization = await queryRunner.manager.findOne(Organization, {
        where: { id: savedOrganization.id },
      })

      if (!verifyOrganization) {
        await queryRunner.rollbackTransaction()
        return {
          success: false,
          message: "Failed to verify organization creation",
          debug: {
            step: "organization_verification",
            savedOrganizationId: savedOrganization.id,
          },
        }
      }


      const bcrypt = require("bcryptjs")
      let password, hashedPassword
      try {
        password = organizationData.adminUser.password || generateRandomString(12)

        hashedPassword = await bcrypt.hash(password, 12)
      } catch (passwordError) {
        throw passwordError
      }

  const adminUser = queryRunner.manager.create(User, {
    username: organizationData.adminUser.username,
    email: organizationData.adminUser.email,
    hashedPassword: hashedPassword,
    role: UserRole.CLIENT,
    organizationId: savedOrganization.id,
    phone: organizationData.adminUser.phone || null,
    branch: organizationData.adminUser.branch || null, // Add this
    isActive: true,
    isVerified: true,
    isFirstLogin: true,
  })

      const savedAdminUser = await queryRunner.manager.save(User, adminUser)


      if (organizationData.categoriesData && organizationData.categoriesData.length > 0) {
        await this.createCategoriesAndServices(savedOrganization, organizationData.categoriesData, queryRunner.manager);
      } else if (organizationData.selectedCategories && organizationData.selectedCategories.length > 0) {
        await this.createDefaultCategoriesAndServices(savedOrganization, organizationData.selectedCategories, queryRunner.manager);
      }

      await queryRunner.commitTransaction()

      try {
        await sendLoginInstructionsEmail(
          organizationData.adminUser.email,
          organizationData.adminUser.username,
          organizationData.adminUser.username,
          password,
        )
      } catch (emailError: any) {
        // console.error("⚠️ Failed to send login instructions email:", emailError.message)
        // Don't fail the whole operation if email fails
      }
      return {
        success: true,
        message: "Organization created successfully",
        data: savedOrganization,
        debug: {
          organizationId: savedOrganization.id,
          adminUserId: savedAdminUser.id,
          categoriesCreated: organizationData.selectedCategories.length,
        },
      }
    } catch (error: any) {


      try {
        await queryRunner.rollbackTransaction()
      } catch (rollbackError: any) {
        // console.error("❌ Failed to rollback transaction:", rollbackError)
      }

      return {
        success: false,
        message: "Failed to create organization",
        error: error.message,
        debug: {
          step: "error_occurred",
          errorType: error.constructor.name,
          errorMessage: error.message,
          errorStack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        },
      }
    } finally {
      await queryRunner.release()
    }
  }
async updateOrganization(
  organizationId: number,
  updateData: OrganizationUpdateData & { categoriesData?: any[] },
  userId?: number,
): Promise<ServiceResponse<Organization>> {


  const queryRunner = dbConnection.createQueryRunner()

  try {
    await queryRunner.connect()

    await queryRunner.startTransaction()

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    })

    if (!organization) {
      await queryRunner.rollbackTransaction()
      return {
        success: false,
        message: "Organization not found",
        debug: {
          step: "organization_lookup",
          organizationId,
        },
      }
    }

    if (updateData.name && updateData.name !== organization.name) {
      const existingOrganization = await this.organizationRepository.findOne({
        where: { name: updateData.name },
      })

      if (existingOrganization && existingOrganization.id !== organizationId) {
        await queryRunner.rollbackTransaction()
        return {
          success: false,
          message: "Organization name already exists",
          debug: {
            step: "name_uniqueness_check",
            existingOrganizationId: existingOrganization.id,
            attemptedName: updateData.name,
          },
        }
      }
    }

    const { categoriesData, ...organizationUpdateData } = updateData

    await queryRunner.manager.update(Organization, organizationId, {
      ...organizationUpdateData,
      updatedBy: userId || null,
    })

    // Step 5: Handle categories and services if categoriesData is provided
    if (categoriesData && categoriesData.length > 0) {
      await this.updateCategoriesAndServices(organizationId, categoriesData, queryRunner.manager)
    }


    await queryRunner.commitTransaction()

    // Step 7: Get updated organization with relations
    const updatedOrganization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["categories", "categories.services", "services"],
    })

    return {
      success: true,
      message: "Organization updated successfully",
      data: updatedOrganization!,
      debug: {
        organizationId,
        updatedFields: Object.keys(organizationUpdateData),
        categoriesUpdated: categoriesData ? categoriesData.length : 0,
      },
    }
  } catch (error: any) {


    try {
      await queryRunner.rollbackTransaction()
    } catch (rollbackError: any) {
      // console.error("❌ Failed to rollback transaction:", rollbackError)
    }

    return {
      success: false,
      message: "Failed to update organization",
      error: error.message,
      debug: {
        step: "error_occurred",
        errorType: error.constructor.name,
        errorMessage: error.message,
        organizationId,
      },
    }
  } finally {
    await queryRunner.release()
  }
}

// Add this new method to handle categories and services update
private async updateCategoriesAndServices(
  organizationId: number,
  categoriesData: Array<{
    name: string;
    services: Array<{
      name: string;
      description: string;
      id?: number; // For existing services
    }>;
  }>,
  manager: any,
): Promise<void> {

  // Get existing categories for this organization
  const existingCategories = await manager.find(Category, {
    where: { organizationId },
    relations: ["services"]
  });

  const existingCategoriesMap = new Map();
  existingCategories.forEach(cat => {
    existingCategoriesMap.set(cat.name, cat);
  });

  // Process each category from frontend
  for (const categoryData of categoriesData) {

    let category = existingCategoriesMap.get(categoryData.name);

    if (!category) {
      // Create new category
      category = this.categoryRepository.create({
        name: categoryData.name,
        organizationId: organizationId,
        isActive: true,
      });
      category = await manager.save(Category, category);
    } else {
      // console.log(`✅ Using existing category: ${category.name} (ID: ${category.id})`);
    }

    // Get existing services for this category
    const existingServices = category.services || [];
    const existingServicesMap = new Map();
    existingServices.forEach(service => {
      existingServicesMap.set(service.name, service);
    });

    // Process services for this category
    console.log(`📋 Processing ${categoryData.services.length} services for ${categoryData.name}`);

    for (const serviceData of categoryData.services) {
      let service = existingServicesMap.get(serviceData.name);

      if (service) {
        // Update existing service
        console.log(`✏️ Updating existing service: ${serviceData.name}`);
        service.name = serviceData.name;
        service.description = serviceData.description;
        service.isActive = true;
        await manager.save(Service, service);
        console.log(`✅ Service updated: ${serviceData.name} (ID: ${service.id})`);
      } else {
        // Create new service
        console.log(`➕ Creating new service: ${serviceData.name}`);
        service = this.serviceRepository.create({
          name: serviceData.name,
          description: serviceData.description,
          category: category,
          categoryId: category.id,
          organizationId: organizationId,
          isActive: true,
        });
        service = await manager.save(Service, service);
        console.log(`✅ Service created: ${serviceData.name} (ID: ${service.id})`);
      }
    }

    // Deactivate services that are not in the frontend data
    const frontendServiceNames = new Set(categoryData.services.map(s => s.name));
    for (const existingService of existingServices) {
      if (!frontendServiceNames.has(existingService.name)) {
        console.log(`➖ Deactivating service: ${existingService.name}`);
        existingService.isActive = false;
        await manager.save(Service, existingService);
      }
    }
  }

  // Deactivate categories that are not in the frontend data
  const frontendCategoryNames = new Set(categoriesData.map(c => c.name));
  for (const existingCategory of existingCategories) {
    if (!frontendCategoryNames.has(existingCategory.name)) {
      console.log(`➖ Deactivating category: ${existingCategory.name}`);
      existingCategory.isActive = false;
      await manager.save(Category, existingCategory);
    }
  }

  console.log("✅ All categories and services updated successfully");
}
  async createCategoriesAndServices(
    organization: Organization,
    categoriesData: Array<{
      name: string;
      services: Array<{
        name: string;
        description: string;
      }>;
    }>,
    manager: any,
  ): Promise<void> {
    console.log("📋 Creating categories and services from frontend data...");

    for (const categoryData of categoriesData) {
      console.log(`📂 Creating category: ${categoryData.name}`);

      // Check if category already exists (by name) for this organization
      const existingCategory = await manager.findOne(Category, {
        where: {
          name: categoryData.name,
          organizationId: organization.id
        }
      });

      let category;
      if (existingCategory) {
        console.log(`✅ Using existing category: ${existingCategory.name} (ID: ${existingCategory.id})`);
        category = existingCategory;
      } else {
        // Create new category
        category = this.categoryRepository.create({
          name: categoryData.name,
          organization,
          organizationId: organization.id,
          isActive: true,
        });
        category = await manager.save(Category, category);
        console.log(`✅ Category created with ID: ${category.id}`);
      }

      // Create services for this category
      console.log(`📋 Creating ${categoryData.services.length} services for ${categoryData.name}`);

      for (const serviceData of categoryData.services) {
        // Check if service already exists (by name) for this category
        const existingService = await manager.findOne(Service, {
          where: {
            name: serviceData.name,
            categoryId: category.id
          }
        });

        if (!existingService) {
          const service = this.serviceRepository.create({
            name: serviceData.name,
            description: serviceData.description,
            category: category,
            categoryId: category.id,
            organization,
            organizationId: organization.id,
            isActive: true,
          });

          const savedService = await manager.save(Service, service);
          console.log(`✅ Service created: ${serviceData.name} (ID: ${savedService.id})`);
        } else {
          console.log(`⚠️ Service already exists: ${serviceData.name} (ID: ${existingService.id})`);
        }
      }
    }

    console.log("✅ All categories and services processed successfully");
  }
async getOrganizationById(organizationId: number, includeRelations: boolean = false): Promise<ServiceResponse<Organization>> {
  try {
    const relations = includeRelations ? [
      "categories",
      "categories.services",
      "services",
      "individualShareholders",
      "institutionShareholders",
      "shareCapitals",
      "borrowings",
      "grantedFunds",
      "operationalFunds",
      "boardDirectors",
      "seniorManagement",
    ] : [
      "categories",
      "categories.services"
    ];

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations,
    });

    if (!organization) {
      return {
        success: false,
        message: "Organization not found",
      };
    }

    // Format the response to include categories with their services
    const formattedOrganization = this.formatOrganizationWithCategories(organization);

    return {
      success: true,
      message: "Organization retrieved successfully",
      data: formattedOrganization,
    };
  } catch (error: any) {
    console.error("Get organization error:", error);
    return {
      success: false,
      message: "Failed to retrieve organization",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };
  }
}

async getAllOrganizations(
  page: number = 1, 
  limit: number = 10, 
  search?: string,
  includeCategories: boolean = false
): Promise<ServiceResponse<{ organizations: Organization[]; total: number; totalPages: number }>> {
  try {
    const skip = (page - 1) * limit;

    const queryBuilder = this.organizationRepository.createQueryBuilder("organization")
      .leftJoinAndSelect("organization.users", "users")
      .where("users.role = :role", { role: UserRole.CLIENT });

    if (search) {
      queryBuilder.andWhere(
        "organization.name ILIKE :search OR organization.tinNumber ILIKE :search OR organization.businessSector ILIKE :search",
        { search: `%${search}%` }
      );
    }

    // If categories are requested, load them with services
    if (includeCategories) {
      queryBuilder
        .leftJoinAndSelect("organization.categories", "categories")
        .leftJoinAndSelect("categories.services", "services", "services.isActive = :isActive", { isActive: true })
        .andWhere("categories.isActive = :isActive", { isActive: true });
    }

    queryBuilder
      .orderBy("organization.createdAt", "DESC")
      .skip(skip)
      .take(limit);

    const [organizations, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    // Enrich organizations with admin user information
    const organizationsWithAdmin = organizations.map(org => {
      // Find the admin user (first user with CLIENT role, which is the admin)
      const adminUser = org.users?.find(user => user.role === UserRole.CLIENT);
      
      // Format organization with categories if requested
      const formattedOrg = includeCategories ? this.formatOrganizationWithCategories(org) : org;

      // Create a new object without exposing sensitive user data
      return {
        ...formattedOrg,
        adminUser: adminUser ? {
          id: adminUser.id,
          username: adminUser.username,
          email: adminUser.email,
          phone: adminUser.phone,
          isActive: adminUser.isActive,
          lastLoginAt: adminUser.lastLoginAt
        } : null
      };
    });

    return {
      success: true,
      message: "Organizations retrieved successfully",
      data: {
        organizations: organizationsWithAdmin,
        total,
        totalPages,
      },
    };
  } catch (error: any) {
    console.error("Get all organizations error:", error);
    return {
      success: false,
      message: "Failed to retrieve organizations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };
  }
}
// In OrganizationService - update the formatOrganizationWithCategories method
private formatOrganizationWithCategories(organization: Organization): any {
  // Filter active categories and their active services
  const activeCategories = (organization.categories || [])
    .filter(category => category.isActive)
    .map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      categoryCode: category.categoryCode,
      categoryIcon: category.categoryIcon,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      services: (category.services || [])
        .filter(service => service.isActive)
        .map(service => ({
          id: service.id,
          name: service.name,
          description: service.description,
          isActive: service.isActive,
          serviceCode: service.serviceCode,
          basePrice: service.basePrice,
          pricingType: service.pricingType,
          interestRate: service.interestRate,
          minLoanAmount: service.minLoanAmount,
          maxLoanAmount: service.maxLoanAmount,
          minTenureMonths: service.minTenureMonths,
          maxTenureMonths: service.maxTenureMonths,
          requirements: service.requirements,
          eligibilityCriteria: service.eligibilityCriteria,
          createdAt: service.createdAt,
          updatedAt: service.updatedAt
        }))
    }));

  // Calculate total services count
  const totalServices = activeCategories.reduce((total, category) => total + category.services.length, 0);

  return {
    ...organization,
    categories: activeCategories,
    // Maintain all other organization properties
    services: organization.services, // Keep original services relation if needed
    stats: {
      totalCategories: activeCategories.length,
      totalServices: totalServices,
      activeCategoriesCount: activeCategories.length,
      activeServicesCount: totalServices
    }
  };
}

async activateOrganization(organizationId: number, activatedByUserId?: number): Promise<any> {
  try {
    // Get organization with users relation to access admin email
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ['users'] // Include users to get admin email
    });

    if (!organization) {
      return {
        success: false,
        message: 'Organization not found'
      };
    }

    // Get user who activated (if provided)
    let activatedByUser = null;
    if (activatedByUserId) {
      activatedByUser = await this.userRepository.findOne({
        where: { id: activatedByUserId }
      });
    }

    // Update organization status
    organization.isActive = true;
    if (activatedByUserId) {
      organization.updatedBy = activatedByUserId;
    }
    
    const savedOrganization = await this.organizationRepository.save(organization);

    // Send activation notification email using dynamic admin email
    if (activatedByUser) {
      try {
        // Determine the admin email dynamically
        let adminEmail = null;
        
        // Priority 1: Use organization.email if it exists (preferred)
        if (organization.email) {
          adminEmail = organization.email;
        } 
        // Priority 2: Find admin user from users array
        else if (organization.users && organization.users.length > 0) {
          const adminUser = organization.users.find(user => user.role === 'client');
          if (adminUser && adminUser.email) {
            adminEmail = adminUser.email;
          }
        }

        if (adminEmail) {
          await sendActivationNotification(
            {
              ...organization,
              email: adminEmail // Ensure the email is set for the notification function
            }, 
            activatedByUser
          );
          console.log(`Activation notification sent to dynamic email: ${adminEmail}`);
        } else {
          console.warn(`No admin email found for organization ${organization.name} (ID: ${organization.id})`);
        }
      } catch (emailError) {
        console.error('Failed to send activation email:', emailError);
        // Don't fail the activation if email fails, just log the error
      }
    }

    return {
      success: true,
      message: 'Organization activated successfully and notification sent',
      data: savedOrganization
    };
  } catch (error) {
    console.error('Error activating organization:', error);
    return {
      success: false,
      message: 'Failed to activate organization',
      error: error
    };
  }
}

// Updated deactivateOrganization method for organizationService.ts
async deactivateOrganization(organizationId: number, deactivatedByUserId?: number): Promise<any> {
  try {
    // Get organization with users relation to access admin email
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ['users'] // Include users to get admin email
    });

    if (!organization) {
      return {
        success: false,
        message: 'Organization not found'
      };
    }

    // Get user who deactivated (if provided)
    let deactivatedByUser = null;
    if (deactivatedByUserId) {
      deactivatedByUser = await this.userRepository.findOne({
        where: { id: deactivatedByUserId }
      });
    }

    // Update organization status
    organization.isActive = false;
    if (deactivatedByUserId) {
      organization.updatedBy = deactivatedByUserId;
    }
    
    const savedOrganization = await this.organizationRepository.save(organization);

    // Send deactivation notification email using dynamic admin email
    if (deactivatedByUser) {
      try {
        // Determine the admin email dynamically
        let adminEmail = null;
        
        // Priority 1: Use organization.email if it exists (preferred)
        if (organization.email) {
          adminEmail = organization.email;
        } 
        // Priority 2: Find admin user from users array
        else if (organization.users && organization.users.length > 0) {
          const adminUser = organization.users.find(user => user.role === 'client');
          if (adminUser && adminUser.email) {
            adminEmail = adminUser.email;
          }
        }

        if (adminEmail) {
          await sendDeactivationNotification(
            {
              ...organization,
              email: adminEmail // Ensure the email is set for the notification function
            }, 
            deactivatedByUser
          );
          console.log(`Deactivation notification sent to dynamic email: ${adminEmail}`);
        } else {
          console.warn(`No admin email found for organization ${organization.name} (ID: ${organization.id})`);
        }
      } catch (emailError) {
        console.error('Failed to send deactivation email:', emailError);
        // Don't fail the deactivation if email fails, just log the error
      }
    }

    return {
      success: true,
      message: 'Organization deactivated successfully and notification sent',
      data: savedOrganization
    };
  } catch (error) {
    console.error('Error deactivating organization:', error);
    return {
      success: false,
      message: 'Failed to deactivate organization',
      error: error
    };
  }
}

  async deleteOrganization(organizationId: number): Promise<ServiceResponse<void>> {
    const queryRunner = dbConnection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found",
        };
      }

      // Soft delete organization
      await queryRunner.manager.softDelete(Organization, organizationId);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Organization deleted successfully",
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Delete organization error:", error);
      return {
        success: false,
        message: "Failed to delete organization",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    } finally {
      await queryRunner.release();
    }
  }

  async uploadLogo(organizationId: number, logoUrl: string): Promise<ServiceResponse<Organization>> {
    try {
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found",
        };
      }

      await this.organizationRepository.update(organizationId, {
        logoUrl,
      });

      const updatedOrganization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });

      return {
        success: true,
        message: "Logo uploaded successfully",
        data: updatedOrganization!,
      };
    } catch (error: any) {
      console.error("Upload logo error:", error);
      return {
        success: false,
        message: "Failed to upload logo",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async getOrganizationStats(organizationId: number): Promise<ServiceResponse<any>> {
    try {
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
        relations: [
          "individualShareholders",
          "institutionShareholders",
          "shareCapitals",
          "borrowings",
          "grantedFunds",
          "operationalFunds",
          "boardDirectors",
          "seniorManagement",
          "categories",
          "services",
        ],
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found",
        };
      }

      const stats = {
        totalShareholders: organization.getTotalShareholders(),
        totalShareCapital: organization.getTotalShareCapital(),
        totalBorrowings: organization.getTotalBorrowings(),
        totalGrants: organization.getTotalGrants(),
        totalDirectors: organization.boardDirectors?.length || 0,
        totalManagement: organization.seniorManagement?.length || 0,
        totalCategories: organization.categories?.length || 0,
        totalServices: organization.services?.length || 0,
        isValidForLoanApplication: organization.isValidForLoanApplication(),
      };

      return {
        success: true,
        message: "Organization statistics retrieved successfully",
        data: stats,
      };
    } catch (error: any) {
      console.error("Get organization stats error:", error);
      return {
        success: false,
        message: "Failed to retrieve organization statistics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  // Add these methods to the OrganizationService class

async addBranchToOrganization(
  organizationId: number,
  branchData: { title: string },
  userId?: number
): Promise<ServiceResponse<Organization>> {
  try {
    console.log("🏢 Adding branch to organization:", { organizationId, branchData });

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      return {
        success: false,
        message: "Organization not found",
      };
    }

    // Initialize branches array if it doesn't exist
    const currentBranches = organization.branches || [];
    
    // Check if branch with same title already exists
    const existingBranch = currentBranches.find(branch => 
      branch.title.toLowerCase() === branchData.title.toLowerCase()
    );

    if (existingBranch) {
      return {
        success: false,
        message: "Branch with this name already exists",
      };
    }

    // Add new branch
    const newBranch = { title: branchData.title.trim() };
    const updatedBranches = [...currentBranches, newBranch];

    // Update organization
    await this.organizationRepository.update(organizationId, {
      branches: updatedBranches,
      updatedBy: userId || null,
    });

    // Get updated organization
    const updatedOrganization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    return {
      success: true,
      message: "Branch added successfully",
      data: updatedOrganization!,
    };
  } catch (error: any) {
    console.error("Add branch error:", error);
    return {
      success: false,
      message: "Failed to add branch",
      error: error.message,
    };
  }
}

async updateOrganizationBranch(
  organizationId: number,
  branchIndex: number,
  branchData: { title: string },
  userId?: number
): Promise<ServiceResponse<Organization>> {
  try {
    console.log("🏢 Updating branch:", { organizationId, branchIndex, branchData });

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      return {
        success: false,
        message: "Organization not found",
      };
    }

    const currentBranches = organization.branches || [];
    
    // Check if branch index is valid
    if (branchIndex < 0 || branchIndex >= currentBranches.length) {
      return {
        success: false,
        message: "Invalid branch index",
      };
    }

    // Check if new branch name already exists (excluding current branch)
    const existingBranch = currentBranches.find((branch, index) => 
      index !== branchIndex && 
      branch.title.toLowerCase() === branchData.title.toLowerCase()
    );

    if (existingBranch) {
      return {
        success: false,
        message: "Branch with this name already exists",
      };
    }

    // Update the branch
    const updatedBranches = [...currentBranches];
    updatedBranches[branchIndex] = { title: branchData.title.trim() };

    // Update organization
    await this.organizationRepository.update(organizationId, {
      branches: updatedBranches,
      updatedBy: userId || null,
    });

    // Get updated organization
    const updatedOrganization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    return {
      success: true,
      message: "Branch updated successfully",
      data: updatedOrganization!,
    };
  } catch (error: any) {
    console.error("Update branch error:", error);
    return {
      success: false,
      message: "Failed to update branch",
      error: error.message,
    };
  }
}

async deleteOrganizationBranch(
  organizationId: number,
  branchIndex: number,
  userId?: number
): Promise<ServiceResponse<Organization>> {
  try {
    console.log("🏢 Deleting branch:", { organizationId, branchIndex });

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      return {
        success: false,
        message: "Organization not found",
      };
    }

    const currentBranches = organization.branches || [];
    
    // Check if branch index is valid
    if (branchIndex < 0 || branchIndex >= currentBranches.length) {
      return {
        success: false,
        message: "Invalid branch index",
      };
    }

    // Remove the branch
    const updatedBranches = currentBranches.filter((_, index) => index !== branchIndex);

    // Update organization
    await this.organizationRepository.update(organizationId, {
      branches: updatedBranches,
      updatedBy: userId || null,
    });

    // Get updated organization
    const updatedOrganization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    return {
      success: true,
      message: "Branch deleted successfully",
      data: updatedOrganization!,
    };
  } catch (error: any) {
    console.error("Delete branch error:", error);
    return {
      success: false,
      message: "Failed to delete branch",
      error: error.message,
    };
  }
}

async toggleBranchStatus(
  organizationId: number,
  branchIndex: number,
  userId?: number
): Promise<ServiceResponse<Organization>> {
  try {
    console.log("🏢 Toggling branch status:", { organizationId, branchIndex });

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["users"],
    });

    if (!organization) {
      return {
        success: false,
        message: "Organization not found",
      };
    }

    const currentBranches = organization.branches || [];
    
    // Check if branch index is valid
    if (branchIndex < 0 || branchIndex >= currentBranches.length) {
      return {
        success: false,
        message: "Invalid branch index",
      };
    }

    // Since we're storing branches as simple objects, we can't have an active status
    // We'll need to modify the Branch interface to include isActive
    // For now, we'll just update the branch name to indicate status
    const branch = currentBranches[branchIndex];
    const updatedBranches = [...currentBranches];
    
    // Check if branch name contains "(Inactive)" marker
    const isActive = !branch.title.includes("(Inactive)");
    const newTitle = isActive 
      ? `${branch.title} (Inactive)`
      : branch.title.replace(" (Inactive)", "");

    updatedBranches[branchIndex] = { title: newTitle };

    // Also update users associated with this branch
    const users = organization.users || [];
    const branchName = branch.title.replace(" (Inactive)", "");
    
    for (const user of users) {
      if (user.branch === branchName) {
        // Update user's branch to reflect status
        await this.userRepository.update(user.id, {
          branch: newTitle,
        });
      }
    }

    // Update organization
    await this.organizationRepository.update(organizationId, {
      branches: updatedBranches,
      updatedBy: userId || null,
    });

    // Get updated organization
    const updatedOrganization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["users"],
    });

    return {
      success: true,
      message: isActive ? "Branch deactivated successfully" : "Branch activated successfully",
      data: updatedOrganization!,
    };
  } catch (error: any) {
    console.error("Toggle branch status error:", error);
    return {
      success: false,
      message: "Failed to toggle branch status",
      error: error.message,
    };
  }
}

async getOrganizationBranches(
  organizationId: number
): Promise<ServiceResponse<{ branches: any[], total: number, activeBranches: number }>> {
  try {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["users"],
    });

    if (!organization) {
      return {
        success: false,
        message: "Organization not found",
      };
    }

    const branches = organization.branches || [];
    
    // Calculate active branches (those without "(Inactive)" in name)
    const activeBranches = branches.filter(branch => 
      !branch.title.includes("(Inactive)")
    ).length;

    // Enhance branches with user count
    const enhancedBranches = branches.map(branch => {
      const branchName = branch.title.replace(" (Inactive)", "");
      const usersInBranch = (organization.users || []).filter(user => 
        user.branch === branchName
      ).length;

      return {
        ...branch,
        isActive: !branch.title.includes("(Inactive)"),
        userCount: usersInBranch,
        originalTitle: branchName,
      };
    });

    return {
      success: true,
      message: "Branches retrieved successfully",
      data: {
        branches: enhancedBranches,
        total: branches.length,
        activeBranches,
      },
    };
  } catch (error: any) {
    console.error("Get branches error:", error);
    return {
      success: false,
      message: "Failed to retrieve branches",
      error: error.message,
    };
  }
}

  // In OrganizationService class, update the createDefaultCategoriesAndServices method
  private async createDefaultCategoriesAndServices(
    organization: Organization,
    selectedCategories: string[],
    manager: any
  ): Promise<void> {
    console.log("📋 Creating default categories and services for:", selectedCategories);

    // Define default services for each category type
    const defaultServices: { [key: string]: any[] } = {
      "Category I - Comprehensive Services": [
        { name: "Mortgage finance", description: "Long-term loans for property purchases" },
        { name: "Refinancing", description: "Replacing existing debt with new loan terms" },
        { name: "Development finance", description: "Funding for property development projects" },
        { name: "Credit guarantee", description: "Providing guarantees for borrower credit" },
        { name: "Asset finance", description: "Loans for purchasing business assets" },
        { name: "Finance lease", description: "Leasing arrangements with purchase option" },
        { name: "Factoring business", description: "Purchasing accounts receivable" },
        { name: "Money lending", description: "General personal and business loans" },
        { name: "Pawnshop", description: "Secured loans using personal property as collateral" },
        { name: "Debt collection services", description: "Professional debt recovery services" },
        { name: "Credit intermediary", description: "Connecting borrowers with lenders" },
        { name: "Debt counsellor", description: "Financial counseling and debt management" },
        { name: "Performance security", description: "Financial guarantees for performance" },
        { name: "Peer-to-peer lending platform", description: "Platform connecting individual lenders and borrowers" }
      ],
      "Category II - Limited Financial Services": [
        { name: "Asset finance", description: "Loans for purchasing business assets" },
        { name: "Finance lease", description: "Leasing arrangements with purchase option" },
        { name: "Factoring business", description: "Purchasing accounts receivable" },
        { name: "Money lending", description: "General personal and business loans" },
        { name: "Pawnshop", description: "Secured loans using personal property as collateral" }
      ],
      "Category III - Support/Intermediary Services": [
        { name: "Debt collection services", description: "Professional debt recovery services" },
        { name: "Credit intermediary", description: "Connecting borrowers with lenders" },
        { name: "Debt counsellor", description: "Financial counseling and debt management" },
        { name: "Peer-to-peer lending platform", description: "Platform connecting individual lenders and borrowers" }
      ]
    };

    for (const categoryName of selectedCategories) {
      console.log(`📂 Creating category: ${categoryName}`);

      // Create category
      const category = this.categoryRepository.create({
        name: categoryName,
        organization,
        organizationId: organization.id,
        isActive: true,
      });

      const savedCategory = await manager.save(Category, category);
      console.log(`✅ Category created with ID: ${savedCategory.id}`);

      // Create default services for this category
      const services = defaultServices[categoryName] || [];
      console.log(`📋 Creating ${services.length} services for ${categoryName}`);

      for (const serviceData of services) {
        const service = this.serviceRepository.create({
          name: serviceData.name,
          description: serviceData.description,
          category: savedCategory,
          categoryId: savedCategory.id,
          organization,
          organizationId: organization.id,
          isActive: true,
        });

        const savedService = await manager.save(Service, service);
        console.log(`✅ Service created: ${serviceData.name} (ID: ${savedService.id})`);
      }
    }

    console.log("✅ All categories and services created successfully");
  }

}

export default new OrganizationService();