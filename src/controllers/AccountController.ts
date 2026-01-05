import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { AccountService } from "../services/accountService";
import { Account, AccountType } from "../entities/Account";
import { Organization } from "../entities/Organization";
import { TransactionLine } from "../entities/TransactionLine";
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

class AccountController {
  private accountService: AccountService;

  constructor() {
    this.accountService = new AccountService(
      dbConnection.getRepository(Account),
      dbConnection.getRepository(Organization),
      dbConnection.getRepository(TransactionLine)
    );
  }

  // Add this method to your AccountController class

getCategoriesByType = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const accountType = req.params.type as AccountType;

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!Object.values(AccountType).includes(accountType)) {
      res.status(400).json({
        success: false,
        message: "Invalid account type",
      });
      return;
    }

    const result = await this.accountService.getCategoriesByType(
      organizationId,
      accountType
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
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

createAccount = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

    const organizationId = parseInt(req.params.organizationId);
    
    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    // Enhanced parentAccountId handling - ensure it's properly optional
    let parentAccountId: number | null = null;
    
    // Check if parentAccountId exists and is a valid positive number
    if (req.body.parentAccountId !== undefined && 
        req.body.parentAccountId !== null && 
        req.body.parentAccountId !== "") {
      
      const parsedParentId = parseInt(req.body.parentAccountId.toString());
      
      // Only set parentAccountId if it's a valid positive integer
      if (!isNaN(parsedParentId) && parsedParentId > 0) {
        parentAccountId = parsedParentId;
      } else {
        parentAccountId = null;
      }
    } else {
    }

    const accountData = {
      accountName: req.body.accountName,
      accountType: req.body.accountType as AccountType,
      accountCategory: req.body.accountCategory,
      parentAccountId: parentAccountId, // Will be null if not provided or invalid
    };


    const result = await this.accountService.createAccount(
      accountData,
      organizationId,
      req.user?.id || 0
    );

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

  getAccounts = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const filters = {
        accountType: req.query.type as AccountType | undefined,
        accountCategory: req.query.category as string | undefined,
        isActive: req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined,
        searchTerm: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };

      const result = await this.accountService.getAccountsByOrganization(
        organizationId,
        filters
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
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getAccountById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const accountId = parseInt(req.params.accountId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!accountId || isNaN(accountId)) {
        res.status(400).json({
          success: false,
          message: "Invalid account ID",
        });
        return;
      }

      const result = await this.accountService.getAccountById(
        accountId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  updateAccount = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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

      const organizationId = parseInt(req.params.organizationId);
      const accountId = parseInt(req.params.accountId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!accountId || isNaN(accountId)) {
        res.status(400).json({
          success: false,
          message: "Invalid account ID",
        });
        return;
      }

      const updateData = {
        accountName: req.body.accountName,
        accountCategory: req.body.accountCategory,
        isActive: req.body.isActive,
      };

      const result = await this.accountService.updateAccount(
        accountId,
        updateData,
        organizationId
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
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  deleteAccount = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const accountId = parseInt(req.params.accountId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!accountId || isNaN(accountId)) {
        res.status(400).json({
          success: false,
          message: "Invalid account ID",
        });
        return;
      }

      const result = await this.accountService.deleteAccount(
        accountId,
        organizationId
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
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getAccountBalance = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const accountId = parseInt(req.params.accountId);

      if (!accountId || isNaN(accountId)) {
        res.status(400).json({
          success: false,
          message: "Invalid account ID",
        });
        return;
      }

      const result = await this.accountService.getAccountBalance(accountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getAccountsByType = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const accountType = req.params.type as AccountType;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!Object.values(AccountType).includes(accountType)) {
        res.status(400).json({
          success: false,
          message: "Invalid account type",
        });
        return;
      }

      const result = await this.accountService.getAccountsByType(
        organizationId,
        accountType
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
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new AccountController();