import { Repository } from "typeorm";
import { Account, AccountType, NormalBalance } from "../entities/Account";
import { Organization } from "../entities/Organization";
import { TransactionLine } from "../entities/TransactionLine";

export interface CreateAccountData {
  accountName: string;
  accountType: AccountType;
  accountCategory: string;
  parentAccountId?: number | null; 
}

export interface UpdateAccountData {
  accountName?: string;
  accountCategory?: string;
  isActive?: boolean;
}

export interface AccountFilters {
  accountType?: AccountType;
  accountCategory?: string;
  isActive?: boolean;
  searchTerm?: string;
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

export class AccountService {
  constructor(
    private accountRepository: Repository<Account>,
    private organizationRepository: Repository<Organization>,
    private transactionLineRepository: Repository<TransactionLine>
  ) {}





async getCategoriesByType(
  organizationId: number,
  accountType: AccountType
): Promise<ServiceResponse> {
  try {
    // Get distinct categories for the specified account type
    const categories = await this.accountRepository
      .createQueryBuilder("account")
      .select("DISTINCT account.accountCategory", "category")
      .where("account.organizationId = :organizationId", { organizationId })
      .andWhere("account.accountType = :accountType", { accountType })
      .andWhere("account.isActive = :isActive", { isActive: true })
      .orderBy("account.accountCategory", "ASC")
      .getRawMany();

    // Extract category names from the result
    const categoryList = categories.map(item => item.category);

    return {
      success: true,
      message: `Categories for ${accountType} retrieved successfully`,
      data: {
        accountType,
        categories: categoryList
      }
    };
  } catch (error: any) {
    console.error("Get categories error:", error);
    return {
      success: false,
      message: error.message || "Failed to retrieve categories"
    };
  }
}

  async createAccount(
    accountData: CreateAccountData,
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse> {
    try {
      console.log("=== CREATE ACCOUNT SERVICE DEBUG START ===");
      console.log("Account Data Received:", accountData);
      console.log("Organization ID:", organizationId);
      console.log("User ID:", userId);

      // Verify organization exists
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId }
      });

      if (!organization) {
        console.log("Organization not found");
        return {
          success: false,
          message: "Organization not found"
        };
      }

      console.log("Organization found:", organization.name);

      // Validate parent account if provided
      let parentAccount = null;
      if (accountData.parentAccountId !== undefined && 
          accountData.parentAccountId !== null && 
          accountData.parentAccountId > 0) {
        console.log("Validating parent account ID:", accountData.parentAccountId);
        
        parentAccount = await this.accountRepository.findOne({
          where: { 
            id: accountData.parentAccountId,
            organizationId,
            isActive: true
          }
        });

        if (!parentAccount) {
          console.log("Parent account not found or inactive");
          return {
            success: false,
            message: "Parent account not found or inactive"
          };
        }

        if (parentAccount.accountType !== accountData.accountType) {
          console.log("Parent account type mismatch");
          return {
            success: false,
            message: `Parent account type must match the account type. Parent is ${parentAccount.accountType}, but trying to create ${accountData.accountType}`
          };
        }

        console.log("Parent account validated:", parentAccount.accountName);
      } else {
        console.log("No parent account specified - creating main account");
      }

      // Generate account code with enhanced logic
      console.log("Generating account code...");
      const accountCode = await this.generateAccountCode(
        accountData.accountType,
        accountData.accountCategory,
        organizationId
      );
      console.log("Generated account code:", accountCode);

      // Determine normal balance
      const normalBalance = Account.determineNormalBalance(accountData.accountType);
      console.log("Normal balance determined:", normalBalance);

      // Create account
      const account = this.accountRepository.create({
        accountCode,
        accountName: accountData.accountName,
        accountType: accountData.accountType,
        accountCategory: accountData.accountCategory,
        parentAccountId: (accountData.parentAccountId && accountData.parentAccountId > 0) 
          ? accountData.parentAccountId 
          : null,
        organizationId,
        normalBalance,
        balance: 0,
        isActive: true,
        createdBy: userId
      });

      console.log("Account entity created, saving to database...");
      const savedAccount = await this.accountRepository.save(account);
      console.log("Account saved successfully with ID:", savedAccount.id);
      console.log("=== CREATE ACCOUNT SERVICE DEBUG END ===");

      return {
        success: true,
        message: "Account created successfully",
        data: savedAccount
      };
    } catch (error: any) {
      console.error("=== CREATE ACCOUNT SERVICE ERROR ===");
      console.error("Error details:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      return {
        success: false,
        message: error.message || "Failed to create account"
      };
    }
  }

  /**
   * ENHANCED: Generate account codes sequentially with gap-filling capability
   * PostgreSQL compatible version - uses INTEGER casting instead of UNSIGNED
   */
  private async generateAccountCode(
    accountType: AccountType,
    accountCategory: string,
    organizationId: number
  ): Promise<string> {
    try {
      console.log("Generating code for:", { accountType, accountCategory, organizationId });
      
      const categoryRange = Account.getCategoryRange(accountType, accountCategory);
      console.log("Category range:", categoryRange);

      // Get ALL existing account codes in this range for this organization
      // PostgreSQL compatible: Use CAST to INTEGER instead of UNSIGNED
      const existingAccounts = await this.accountRepository
        .createQueryBuilder("account")
        .where("account.organizationId = :organizationId", { organizationId })
        .andWhere("CAST(account.accountCode AS INTEGER) >= :start", { start: categoryRange.start })
        .andWhere("CAST(account.accountCode AS INTEGER) <= :end", { end: categoryRange.end })
        .orderBy("CAST(account.accountCode AS INTEGER)", "ASC")
        .getMany();

      console.log(`Found ${existingAccounts.length} existing accounts in range`);

      // If no accounts exist in this range, use the start code
      if (existingAccounts.length === 0) {
        console.log("First account in category, using start code:", categoryRange.start);
        return categoryRange.start.toString();
      }

      // Build a Set of existing codes for O(1) lookup
      const existingCodesSet = new Set<number>();
      existingAccounts.forEach(account => {
        const code = parseInt(account.accountCode);
        if (!isNaN(code)) {
          existingCodesSet.add(code);
        }
      });

      // Strategy 1: Try to find the first gap in the sequence
      for (let code = categoryRange.start; code <= categoryRange.end; code++) {
        if (!existingCodesSet.has(code)) {
          console.log("Found available code (gap-filling):", code);
          return code.toString();
        }
      }

      // Strategy 2: If no gaps found, this means range is exhausted
      console.error("Account code range completely exhausted!");
      throw new Error(
        `Account code range exhausted for ${accountType} - ${accountCategory}. ` +
        `Range: ${categoryRange.start}-${categoryRange.end}. ` +
        `All ${existingAccounts.length} codes are used. ` +
        `Please contact system administrator to expand the range or archive unused accounts.`
      );
    } catch (error: any) {
      console.error("Generate account code error:", error);
      throw error;
    }
  }
  async getAccountsByOrganization(
    organizationId: number,
    filters: AccountFilters = {}
  ): Promise<ServiceResponse> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const skip = (page - 1) * limit;

      const queryBuilder = this.accountRepository
        .createQueryBuilder("account")
        .leftJoinAndSelect("account.parentAccount", "parentAccount")
        .where("account.organizationId = :organizationId", { organizationId });

      // Apply filters
      if (filters.accountType) {
        queryBuilder.andWhere("account.accountType = :accountType", {
          accountType: filters.accountType
        });
      }

      if (filters.accountCategory) {
        queryBuilder.andWhere("account.accountCategory = :accountCategory", {
          accountCategory: filters.accountCategory
        });
      }

      if (filters.isActive !== undefined) {
        queryBuilder.andWhere("account.isActive = :isActive", {
          isActive: filters.isActive
        });
      }

      if (filters.searchTerm) {
        queryBuilder.andWhere(
          "(account.accountName LIKE :searchTerm OR account.accountCode LIKE :searchTerm)",
          { searchTerm: `%${filters.searchTerm}%` }
        );
      }

      // Get total count
      const totalItems = await queryBuilder.getCount();

      // Get paginated results with SIMPLE ordering - no complex casting
      const accounts = await queryBuilder
        .orderBy("account.accountCode", "ASC") // Simple string ordering
        .skip(skip)
        .take(limit)
        .getMany();

      // Sort accounts numerically in memory for proper numeric order
      const sortedAccounts = accounts.sort((a, b) => {
        const codeA = parseInt(a.accountCode) || 0;
        const codeB = parseInt(b.accountCode) || 0;
        return codeA - codeB;
      });

      return {
        success: true,
        message: "Accounts retrieved successfully",
        data: sortedAccounts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error: any) {
      console.error("Get accounts error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve accounts"
      };
    }
  }

  async getAccountById(
    accountId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const account = await this.accountRepository.findOne({
        where: { id: accountId, organizationId },
        relations: ["parentAccount", "childAccounts"]
      });

      if (!account) {
        return {
          success: false,
          message: "Account not found"
        };
      }

      // Get transaction count
      const transactionCount = await this.transactionLineRepository.count({
        where: { accountId: account.id }
      });

      return {
        success: true,
        message: "Account retrieved successfully",
        data: {
          ...account,
          transactionCount
        }
      };
    } catch (error: any) {
      console.error("Get account error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve account"
      };
    }
  }

  async updateAccount(
    accountId: number,
    updateData: UpdateAccountData,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const account = await this.accountRepository.findOne({
        where: { id: accountId, organizationId }
      });

      if (!account) {
        return {
          success: false,
          message: "Account not found"
        };
      }

      if (updateData.accountName !== undefined) {
        account.accountName = updateData.accountName;
      }

      if (updateData.accountCategory !== undefined) {
        account.accountCategory = updateData.accountCategory;
      }

      if (updateData.isActive !== undefined) {
        account.isActive = updateData.isActive;
      }

      const updatedAccount = await this.accountRepository.save(account);

      return {
        success: true,
        message: "Account updated successfully",
        data: updatedAccount
      };
    } catch (error: any) {
      console.error("Update account error:", error);
      return {
        success: false,
        message: error.message || "Failed to update account"
      };
    }
  }
  async deleteAccount(
    accountId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const account = await this.accountRepository.findOne({
        where: { id: accountId, organizationId }
      });

      if (!account) {
        return {
          success: false,
          message: "Account not found"
        };
      }

      // Check for transactions
      const hasTransactions = await this.transactionLineRepository.count({
        where: { accountId: account.id }
      });

      if (hasTransactions > 0) {
        // Soft delete - mark as inactive
        account.isActive = false;
        await this.accountRepository.save(account);

        return {
          success: true,
          message: "Account has transactions and was marked as inactive instead of deleted",
          data: { deletionType: "soft", account }
        };
      }

      // Check for child accounts
      const childAccounts = await this.accountRepository.count({
        where: { parentAccountId: account.id }
      });

      if (childAccounts > 0) {
        return {
          success: false,
          message: "Cannot delete account with child accounts. Please delete or reassign child accounts first."
        };
      }

      // Hard delete
      await this.accountRepository.remove(account);

      return {
        success: true,
        message: "Account deleted successfully",
        data: { deletionType: "hard" }
      };
    } catch (error: any) {
      console.error("Delete account error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete account"
      };
    }
  }

  async getAccountBalance(accountId: number): Promise<ServiceResponse> {
    try {
      const account = await this.accountRepository.findOne({
        where: { id: accountId }
      });

      if (!account) {
        return {
          success: false,
          message: "Account not found"
        };
      }

      const balanceDisplay = account.getBalanceDisplay();

      return {
        success: true,
        message: "Account balance retrieved successfully",
        data: {
          accountId: account.id,
          accountCode: account.accountCode,
          accountName: account.accountName,
          balance: account.balance,
          balanceDisplay,
          normalBalance: account.normalBalance,
          isNormal: account.isBalanceNormal()
        }
      };
    } catch (error: any) {
      console.error("Get account balance error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve account balance"
      };
    }
  }

  async getAccountsByType(
    organizationId: number,
    accountType: AccountType
  ): Promise<ServiceResponse> {
    try {
      const accounts = await this.accountRepository.find({
        where: { organizationId, accountType, isActive: true }
      });

      // Sort accounts numerically in memory
      const sortedAccounts = accounts.sort((a, b) => {
        const codeA = parseInt(a.accountCode) || 0;
        const codeB = parseInt(b.accountCode) || 0;
        return codeA - codeB;
      });

      return {
        success: true,
        message: `${accountType} accounts retrieved successfully`,
        data: sortedAccounts
      };
    } catch (error: any) {
      console.error("Get accounts by type error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve accounts"
      };
    }
  }
}