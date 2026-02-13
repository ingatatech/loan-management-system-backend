import { Repository } from "typeorm";
import { User, UserRole } from "../entities/User";
import { Organization } from "../entities/Organization";
import { Loan, LoanStatus } from "../entities/Loan";
import * as bcrypt from "bcryptjs";
import { generateRandomString } from "../utils/helpers";
import { sendLoginInstructionsEmail } from "../templates/userInstruct";

export interface CreateUserData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
}

export interface UserFilters {
  role?: UserRole;
  search?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
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

export class UserService {
  constructor(
    private userRepository: Repository<User>,
    private organizationRepository: Repository<Organization>,
    private loanRepository: Repository<Loan>
  ) {}

  /**
   * Create a new user
   */
  async createUser(
    userData: CreateUserData,
    organizationId: number,
    createdBy: number
  ): Promise<ServiceResponse> {
    try {
      console.log('=== CREATE USER START ===');
      console.log('User data:', userData);

      // Validate organization exists
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId }
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found"
        };
      }

      // Check if email is unique within organization
      const existingUser = await this.userRepository.findOne({
        where: {
          email: userData.email,
          organizationId
        }
      });

      if (existingUser) {
        return {
          success: false,
          message: `A user with email ${userData.email} already exists in this organization`
        };
      }

      // Validate role (cannot create SYSTEM_OWNER or CLIENT)
      if (userData.role === UserRole.SYSTEM_OWNER || userData.role === UserRole.CLIENT) {
        return {
          success: false,
          message: "Cannot create users with SYSTEM_OWNER or CLIENT roles"
        };
      }

      // Generate random password
      const password = generateRandomString(12);
      const hashedPassword = await bcrypt.hash(password, 12);

      // Generate username from email
      const username = userData.email.split('@')[0];

      // Create user
      const user = this.userRepository.create({
        username,
        email: userData.email,
        hashedPassword,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone || null,
        organizationId,
        isActive: true,
        isVerified: true,
        isFirstLogin: true,
        failedLoginAttempts: 0
      });

      const savedUser = await this.userRepository.save(user);
      console.log('✓ User created:', savedUser.id);

      // Send welcome email with credentials
      try {
        await sendLoginInstructionsEmail(
          userData.email,
          `${userData.firstName} ${userData.lastName}`,
          username,
          password
        );
        console.log('✓ Welcome email sent');
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail user creation if email fails
      }

      // Return user without password
      const { hashedPassword: _, ...userWithoutPassword } = savedUser;

      return {
        success: true,
        message: "User created successfully and login credentials sent via email",
        data: {
          user: userWithoutPassword,
          temporaryPassword: password // Include in response for CLIENT to see
        }
      };

    } catch (error: any) {
      console.error('Create user error:', error);
      return {
        success: false,
        message: error.message || "Failed to create user"
      };
    }
  }

  /**
   * Get all users in organization with filters
   */
  async getUsersByOrganization(
    organizationId: number,
    filters: UserFilters
  ): Promise<ServiceResponse> {
    try {
      const {
        role,
        search,
        page = 1,
        limit = 10,
        isActive
      } = filters;

      const skip = (page - 1) * limit;

      // Build query
      const queryBuilder = this.userRepository
        .createQueryBuilder('user')
        .where('user.organizationId = :organizationId', { organizationId })
        .andWhere('user.role != :systemOwner', { systemOwner: UserRole.SYSTEM_OWNER });

      // Apply role filter
      if (role) {
        queryBuilder.andWhere('user.role = :role', { role });
      }

      // Apply active status filter
      if (isActive !== undefined) {
        queryBuilder.andWhere('user.isActive = :isActive', { isActive });
      }

      // Apply search filter
      if (search) {
        queryBuilder.andWhere(
          '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR ' +
          'user.email ILIKE :search OR user.username ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      // Get total count
      const totalItems = await queryBuilder.getCount();

      // Get paginated results
      const users = await queryBuilder
        .orderBy('user.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getMany();

      // Get assigned loans count for each user
      const usersWithCounts = await Promise.all(
        users.map(async (user) => {
          const assignedLoansCount = await this.loanRepository.count({
            where: {
              organizationId,
              loanOfficer: `${user.firstName} ${user.lastName}`,
              status: LoanStatus.PENDING
            }
          });

          const { hashedPassword, ...userWithoutPassword } = user;
          return {
            ...userWithoutPassword,
            assignedLoansCount
          };
        })
      );

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: "Users retrieved successfully",
        data: usersWithCounts,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };

    } catch (error: any) {
      console.error('Get users error:', error);
      return {
        success: false,
        message: "Failed to retrieve users"
      };
    }
  }

  /**
   * Get user by ID with details
   */
  async getUserWithDetails(
    userId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, organizationId }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      // Get assigned loans
      const assignedLoans = await this.loanRepository.find({
        where: {
          organizationId,
          loanOfficer: `${user.firstName} ${user.lastName}`
        },
        relations: ['borrower'],
        order: { createdAt: 'DESC' },
        take: 10
      });

      // Calculate statistics
      const totalReviews = assignedLoans.filter(
        loan => loan.status !== LoanStatus.PENDING
      ).length;

      const pendingLoans = assignedLoans.filter(
        loan => loan.status === LoanStatus.PENDING
      ).length;

      const { hashedPassword, ...userWithoutPassword } = user;

      return {
        success: true,
        message: "User details retrieved successfully",
        data: {
          user: userWithoutPassword,
          assignedLoans,
          statistics: {
            totalReviews,
            pendingLoans,
            totalAssignedLoans: assignedLoans.length
          }
        }
      };

    } catch (error: any) {
      console.error('Get user details error:', error);
      return {
        success: false,
        message: "Failed to retrieve user details"
      };
    }
  }

  /**
   * Update user information
   */
  async updateUser(
    userId: number,
    updateData: Partial<User>,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, organizationId }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      // Only allow updating specific fields
      const allowedUpdates = {
        firstName: updateData.firstName,
        lastName: updateData.lastName,
        phone: updateData.phone,
        isActive: updateData.isActive
      };

      // Remove undefined values
      Object.keys(allowedUpdates).forEach(key => {
        if (allowedUpdates[key as keyof typeof allowedUpdates] === undefined) {
          delete allowedUpdates[key as keyof typeof allowedUpdates];
        }
      });

      await this.userRepository.update(userId, {
        ...allowedUpdates,
        updatedAt: new Date()
      });

      const updatedUser = await this.userRepository.findOne({
        where: { id: userId }
      });

      const { hashedPassword, ...userWithoutPassword } = updatedUser!;

      return {
        success: true,
        message: "User updated successfully",
        data: userWithoutPassword
      };

    } catch (error: any) {
      console.error('Update user error:', error);
      return {
        success: false,
        message: "Failed to update user"
      };
    }
  }

  /**
   * Deactivate user and optionally reassign loans
   */
  async deactivateUser(
    userId: number,
    organizationId: number,
    reassignTo?: number,
    reason?: string
  ): Promise<ServiceResponse> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, organizationId }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      // If reassignTo provided, verify target user exists
      if (reassignTo) {
        const targetUser = await this.userRepository.findOne({
          where: { id: reassignTo, organizationId, isActive: true }
        });

        if (!targetUser) {
          return {
            success: false,
            message: "Target user for reassignment not found or inactive"
          };
        }

        // Reassign pending loans
        const userName = `${user.firstName} ${user.lastName}`;
        const targetName = `${targetUser.firstName} ${targetUser.lastName}`;

        await this.loanRepository
          .createQueryBuilder()
          .update(Loan)
          .set({ loanOfficer: targetName })
          .where('organizationId = :organizationId', { organizationId })
          .andWhere('loanOfficer = :userName', { userName })
          .andWhere('status = :status', { status: LoanStatus.PENDING })
          .execute();
      }

      // Deactivate user
      await this.userRepository.update(userId, {
        isActive: false,
        updatedAt: new Date()
      });

      return {
        success: true,
        message: reassignTo 
          ? "User deactivated and loans reassigned successfully"
          : "User deactivated successfully",
        data: {
          userId,
          deactivatedAt: new Date(),
          loansReassigned: reassignTo ? true : false,
          reason
        }
      };

    } catch (error: any) {
      console.error('Deactivate user error:', error);
      return {
        success: false,
        message: "Failed to deactivate user"
      };
    }
  }

  /**
   * Reset user password
   */
  async resetUserPassword(
    userId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, organizationId }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      // Generate new random password
      const newPassword = generateRandomString(12);
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await this.userRepository.update(userId, {
        hashedPassword,
        isFirstLogin: true,
        updatedAt: new Date()
      });

      // Send email with new password
      try {
        await sendLoginInstructionsEmail(
          user.email,
          `${user.firstName} ${user.lastName}`,
          user.username,
          newPassword
        );
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
      }

      return {
        success: true,
        message: "Password reset successfully and sent via email",
        data: {
          userId,
          newPassword // Include for CLIENT to see
        }
      };

    } catch (error: any) {
      console.error('Reset password error:', error);
      return {
        success: false,
        message: "Failed to reset password"
      };
    }
  }
}