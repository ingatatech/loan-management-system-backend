import { Repository } from "typeorm";
import {
  BouncedCheque,
  BouncedChequeData,
  BouncedChequeType,
  ChequeReturnReason,
} from "../entities/BouncedCheque";
import { Organization } from "../entities/Organization";
import { Loan } from "../entities/Loan";
import { BorrowerProfile } from "../entities/BorrowerProfile";

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

export interface BouncedChequeStats {
  totalCheques: number;
  totalAmount: number;
  byType: Record<string, number>;
  byReason: Record<string, number>;
  overdueCount: number;
  recentCount: number;
}

export class BouncedChequeService {
  constructor(
    private bouncedChequeRepository: Repository<BouncedCheque>,
    private organizationRepository: Repository<Organization>,
    private loanRepository: Repository<Loan>,
    private borrowerRepository: Repository<BorrowerProfile>
  ) {}

  /**
   * Create a new bounced cheque record
   */
  async createBouncedCheque(
    chequeData: BouncedChequeData,
    organizationId: number,
    createdBy: number | null = null
  ): Promise<ServiceResponse> {
    try {
      // Verify organization exists
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found",
        };
      }

      // Validate type-specific fields
      if (chequeData.type === BouncedChequeType.INDIVIDUAL) {
        if (!chequeData.surname || !chequeData.forename1) {
          return {
            success: false,
            message: "Surname and at least one forename are required for individual type",
          };
        }
      } else if (chequeData.type === BouncedChequeType.INSTITUTION) {
        if (!chequeData.institutionName) {
          return {
            success: false,
            message: "Institution name is required for institution type",
          };
        }
      }

      // Create bounced cheque
      const bouncedCheque = this.bouncedChequeRepository.create({
        ...chequeData,
        organizationId,
        createdBy,
        updatedBy: createdBy,
      });

      const savedCheque = await this.bouncedChequeRepository.save(bouncedCheque);

      return {
        success: true,
        message: "Bounced cheque record created successfully",
        data: savedCheque,
      };
    } catch (error: any) {
      console.error("Create bounced cheque error:", error);
      return {
        success: false,
        message: error.message || "Failed to create bounced cheque record",
      };
    }
  }

  /**
   * Get all bounced cheques with pagination
   */
  async getAllBouncedCheques(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    type?: BouncedChequeType,
    reason?: ChequeReturnReason
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;
      const queryBuilder = this.bouncedChequeRepository
        .createQueryBuilder("cheque")
        .leftJoinAndSelect("cheque.loan", "loan")
        .leftJoinAndSelect("cheque.borrower", "borrower")
        .where("cheque.organizationId = :organizationId", { organizationId })
        .andWhere("cheque.isActive = :isActive", { isActive: true });

      if (search) {
        queryBuilder.andWhere(
          "(cheque.accountNumber LIKE :search OR cheque.chequeNumber LIKE :search OR cheque.surname LIKE :search OR cheque.institutionName LIKE :search OR cheque.beneficiaryName LIKE :search)",
          { search: `%${search}%` }
        );
      }

      if (type) {
        queryBuilder.andWhere("cheque.type = :type", { type });
      }

      if (reason) {
        queryBuilder.andWhere("cheque.returnedChequeReason = :reason", { reason });
      }

      const [cheques, total] = await queryBuilder
        .orderBy("cheque.reportedDate", "DESC")
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return {
        success: true,
        message: "Bounced cheques retrieved successfully",
        data: cheques,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error: any) {
      console.error("Get all bounced cheques error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve bounced cheques",
      };
    }
  }

  /**
   * Get a single bounced cheque by ID
   */
  async getBouncedChequeById(
    chequeId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const cheque = await this.bouncedChequeRepository.findOne({
        where: { id: chequeId, organizationId, isActive: true },
        relations: ["loan", "borrower", "organization"],
      });

      if (!cheque) {
        return {
          success: false,
          message: "Bounced cheque not found",
        };
      }

      return {
        success: true,
        message: "Bounced cheque retrieved successfully",
        data: cheque,
      };
    } catch (error: any) {
      console.error("Get bounced cheque by ID error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve bounced cheque",
      };
    }
  }

  /**
   * Update a bounced cheque
   */
  async updateBouncedCheque(
    chequeId: number,
    organizationId: number,
    updateData: Partial<BouncedChequeData>,
    updatedBy: number | null = null
  ): Promise<ServiceResponse> {
    try {
      const cheque = await this.bouncedChequeRepository.findOne({
        where: { id: chequeId, organizationId, isActive: true },
      });

      if (!cheque) {
        return {
          success: false,
          message: "Bounced cheque not found",
        };
      }

      // Validate type-specific fields if type is being changed
      if (updateData.type) {
        if (updateData.type === BouncedChequeType.INDIVIDUAL) {
          if (!updateData.surname && !cheque.surname) {
            return {
              success: false,
              message: "Surname is required for individual type",
            };
          }
        } else if (updateData.type === BouncedChequeType.INSTITUTION) {
          if (!updateData.institutionName && !cheque.institutionName) {
            return {
              success: false,
              message: "Institution name is required for institution type",
            };
          }
        }
      }

      Object.assign(cheque, updateData, { updatedBy });
      const updatedCheque = await this.bouncedChequeRepository.save(cheque);

      return {
        success: true,
        message: "Bounced cheque updated successfully",
        data: updatedCheque,
      };
    } catch (error: any) {
      console.error("Update bounced cheque error:", error);
      return {
        success: false,
        message: error.message || "Failed to update bounced cheque",
      };
    }
  }

  /**
   * Delete (soft delete) a bounced cheque
   */
  async deleteBouncedCheque(
    chequeId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const cheque = await this.bouncedChequeRepository.findOne({
        where: { id: chequeId, organizationId, isActive: true },
      });

      if (!cheque) {
        return {
          success: false,
          message: "Bounced cheque not found",
        };
      }

      cheque.isActive = false;
      await this.bouncedChequeRepository.save(cheque);

      return {
        success: true,
        message: "Bounced cheque deleted successfully",
      };
    } catch (error: any) {
      console.error("Delete bounced cheque error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete bounced cheque",
      };
    }
  }

  /**
   * Get bounced cheque statistics
   */
  async getBouncedChequeStats(organizationId: number): Promise<ServiceResponse> {
    try {
      const cheques = await this.bouncedChequeRepository.find({
        where: { organizationId, isActive: true },
      });

      const totalAmount = cheques.reduce(
        (sum, cheque) => sum + Number(cheque.amount),
        0
      );

      const byType = cheques.reduce((acc, cheque) => {
        acc[cheque.type] = (acc[cheque.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byReason = cheques.reduce((acc, cheque) => {
        acc[cheque.returnedChequeReason] =
          (acc[cheque.returnedChequeReason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const overdueCount = cheques.filter((cheque) =>
        cheque.isOverdue(30)
      ).length;

      const recentCount = cheques.filter(
        (cheque) => new Date(cheque.reportedDate) >= thirtyDaysAgo
      ).length;

      const stats: BouncedChequeStats = {
        totalCheques: cheques.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        byType,
        byReason,
        overdueCount,
        recentCount,
      };

      return {
        success: true,
        message: "Statistics retrieved successfully",
        data: stats,
      };
    } catch (error: any) {
      console.error("Get bounced cheque stats error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve statistics",
      };
    }
  }

  /**
   * Link bounced cheque to a loan
   */
  async linkToLoan(
    chequeId: number,
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const cheque = await this.bouncedChequeRepository.findOne({
        where: { id: chequeId, organizationId, isActive: true },
      });

      if (!cheque) {
        return {
          success: false,
          message: "Bounced cheque not found",
        };
      }

      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found",
        };
      }

      cheque.loanId = loanId;
      cheque.borrowerId = loan.borrowerId;
      await this.bouncedChequeRepository.save(cheque);

      return {
        success: true,
        message: "Bounced cheque linked to loan successfully",
        data: cheque,
      };
    } catch (error: any) {
      console.error("Link to loan error:", error);
      return {
        success: false,
        message: error.message || "Failed to link bounced cheque to loan",
      };
    }
  }
}