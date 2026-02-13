// @ts-nocheck
import { Repository } from "typeorm";
import { DemoRequest, DemoRequestStatus } from "../entities/DemoRequest";
import { User, UserRole } from "../entities/User";
import dbConnection from "../db";
import { sendDemoRequestNotification } from "../templates/demoRequestEmail";

export interface CreateDemoRequestData {
  institutionName: string;
  institutionType: string;
  portfolioSize?: string;
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  interests?: string[];
}

export interface DemoRequestFilters {
  status?: DemoRequestStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

class DemoRequestService {
  private demoRequestRepository: Repository<DemoRequest>;
  private userRepository: Repository<User>;

  constructor() {
    this.demoRequestRepository = dbConnection.getRepository(DemoRequest);
    this.userRepository        = dbConnection.getRepository(User);
  }

  /**
   * Finds the first active system owner user.
   * Returns their email, or null if none exists.
   */
  private async getSystemOwnerEmail(): Promise<string | null> {
    try {
      const owner = await this.userRepository
        .createQueryBuilder("user")
        .select(["user.id", "user.email"])
        .where("user.role = :role", { role: UserRole.SYSTEM_OWNER })
        .andWhere("user.isActive = :active", { active: true })
        .orderBy("user.id", "ASC")
        .getOne();

      return owner?.email ?? null;
    } catch (err: any) {
      console.error("[DemoRequest] Could not fetch system owner email:", err?.message);
      return null;
    }
  }

  async createDemoRequest(data: CreateDemoRequestData): Promise<ServiceResponse<DemoRequest>> {
    try {
      // Check for recent duplicate submissions (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const recentDuplicate = await this.demoRequestRepository
        .createQueryBuilder("request")
        .where("request.email = :email", { email: data.email })
        .andWhere("request.createdAt > :oneDayAgo", { oneDayAgo })
        .andWhere("request.status != :spamStatus", { spamStatus: DemoRequestStatus.SPAM })
        .getOne();

      if (recentDuplicate) {
        return {
          success: false,
          message: "A demo request from this email was already submitted recently. Our team will contact you shortly."
        };
      }

      const demoRequest = this.demoRequestRepository.create({
        institutionName: data.institutionName,
        institutionType: data.institutionType,
        portfolioSize:   data.portfolioSize || null,
        fullName:        data.fullName,
        jobTitle:        data.jobTitle,
        email:           data.email,
        phone:           data.phone,
        interests:       data.interests || [],
        status:          DemoRequestStatus.PENDING
      });

      const savedRequest = await this.demoRequestRepository.save(demoRequest);

      // ── Send emails (non-blocking — errors are caught inside) ───────────────
      const systemOwnerEmail = await this.getSystemOwnerEmail();

      // Fire and forget — email errors must NOT fail the API response
      sendDemoRequestNotification(
        {
          institutionName: savedRequest.institutionName,
          institutionType: savedRequest.institutionType,
          portfolioSize:   savedRequest.portfolioSize,
          fullName:        savedRequest.fullName,
          jobTitle:        savedRequest.jobTitle,
          email:           savedRequest.email,
          phone:           savedRequest.phone,
          interests:       savedRequest.interests ?? [],
          submittedAt:     savedRequest.createdAt,
          requestId:       savedRequest.id,
        },
        systemOwnerEmail ?? ''
      ).catch((err: any) =>
        console.error("[DemoRequest] Email dispatch error:", err?.message)
      );
      // ────────────────────────────────────────────────────────────────────────

      return {
        success: true,
        message: "Demo request submitted successfully",
        data: savedRequest
      };
    } catch (error: any) {
      console.error("Create demo request error:", error);
      return {
        success: false,
        message: "Failed to submit demo request",
        error: error.message
      };
    }
  }

  async getAllDemoRequests(filters: DemoRequestFilters = {}): Promise<ServiceResponse<DemoRequest[]>> {
    try {
      const page  = filters.page  || 1;
      const limit = filters.limit || 20;
      const skip  = (page - 1) * limit;

      const queryBuilder = this.demoRequestRepository.createQueryBuilder("request");

      if (filters.status) {
        queryBuilder.andWhere("request.status = :status", { status: filters.status });
      }

      if (filters.search) {
        queryBuilder.andWhere(
          "(request.institutionName ILIKE :search OR request.fullName ILIKE :search OR request.email ILIKE :search)",
          { search: `%${filters.search}%` }
        );
      }

      queryBuilder.orderBy("request.createdAt", "DESC");

      const totalItems = await queryBuilder.getCount();
      const requests   = await queryBuilder.skip(skip).take(limit).getMany();

      return {
        success: true,
        message: "Demo requests retrieved successfully",
        data: requests,
        pagination: {
          currentPage: page,
          totalPages:  Math.ceil(totalItems / limit),
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error: any) {
      console.error("Get demo requests error:", error);
      return {
        success: false,
        message: "Failed to retrieve demo requests",
        error: error.message
      };
    }
  }

  async updateDemoRequestStatus(
    id: number,
    status: DemoRequestStatus,
    notes?: string,
    userId?: number
  ): Promise<ServiceResponse<DemoRequest>> {
    try {
      const request = await this.demoRequestRepository.findOne({ where: { id } });

      if (!request) {
        return { success: false, message: "Demo request not found" };
      }

      request.status = status;

      if (notes !== undefined) {
        request.notes = notes;
      }

      if (status === DemoRequestStatus.CONTACTED && !request.contactedAt) {
        request.contactedAt = new Date();
        request.contactedBy = userId || null;
      }

      const updatedRequest = await this.demoRequestRepository.save(request);

      return {
        success: true,
        message: "Demo request updated successfully",
        data: updatedRequest
      };
    } catch (error: any) {
      console.error("Update demo request error:", error);
      return {
        success: false,
        message: "Failed to update demo request",
        error: error.message
      };
    }
  }

  async deleteDemoRequest(id: number): Promise<ServiceResponse<void>> {
    try {
      const request = await this.demoRequestRepository.findOne({ where: { id } });

      if (!request) {
        return { success: false, message: "Demo request not found" };
      }

      await this.demoRequestRepository.remove(request);

      return { success: true, message: "Demo request deleted successfully" };
    } catch (error: any) {
      console.error("Delete demo request error:", error);
      return {
        success: false,
        message: "Failed to delete demo request",
        error: error.message
      };
    }
  }

  async getDemoRequestStats(): Promise<ServiceResponse<any>> {
    try {
      const total     = await this.demoRequestRepository.count();
      const pending   = await this.demoRequestRepository.count({ where: { status: DemoRequestStatus.PENDING   } });
      const contacted = await this.demoRequestRepository.count({ where: { status: DemoRequestStatus.CONTACTED } });
      const completed = await this.demoRequestRepository.count({ where: { status: DemoRequestStatus.COMPLETED } });
      const spam      = await this.demoRequestRepository.count({ where: { status: DemoRequestStatus.SPAM      } });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = await this.demoRequestRepository
        .createQueryBuilder("request")
        .where("request.createdAt >= :today", { today })
        .getCount();

      return {
        success: true,
        message: "Demo request stats retrieved successfully",
        data: { total, pending, contacted, completed, spam, today: todayCount }
      };
    } catch (error: any) {
      console.error("Get demo request stats error:", error);
      return {
        success: false,
        message: "Failed to retrieve demo request stats",
        error: error.message
      };
    }
  }
}

export default new DemoRequestService();