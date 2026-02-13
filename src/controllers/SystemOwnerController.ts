
// @ts-nocheck

import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { User } from "../entities/User";
import { UserRole } from "../entities/User";
import { validationResult, body } from "express-validator";
import dbConnection from "../db";
import { sendLoginInstructionsEmail } from "../templates/userInstruct";
import { generateRandomString } from "../utils/helpers";
import { sendChangeLeaderNotificationEmail } from "../templates/ChangeLeaderTemplate";
type ExpressHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
import { Organization } from "../entities/Organization";
import { OtpToken } from "../entities/OtpToken";

const excludePassword = (user: User) => {
  const { hashedPassword, ...userWithoutPassword } = user;
  return userWithoutPassword;
};


export class SystemOwnerController {
static createSystemOwner: ExpressHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startTime = Date.now();
  
  try {
    // Step 1: Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { firstName, lastName, email, telephone, organizationId } = req.body;

    // Step 2: Database connection check
    if (!dbConnection.isInitialized) {
      await dbConnection.initialize();
    }

    // Step 3: Get repositories
    let userRepository, organizationRepository;
    
    try {
      userRepository = dbConnection.getRepository(User);
      organizationRepository = dbConnection.getRepository(Organization);
    } catch (repoError) {
      throw repoError;
    }

    // Step 4: Check for existing email
    let existingUser;
    try {
      existingUser = await userRepository.findOne({
        where: { email: email },
      });
    } catch (emailCheckError) {
      throw emailCheckError;
    }

    if (existingUser) {
      res.status(400).json({
        success: false,
        message: "Email already exists",
      });
      return;
    }

    // Step 5: Check for existing System Owner
    let existingSystemOwner;
    try {
      existingSystemOwner = await userRepository.findOne({
        where: { role: UserRole.SYSTEM_OWNER },
      });
    } catch (SystemOwnerCheckError) {
      throw SystemOwnerCheckError;
    }

    if (existingSystemOwner) {
      res.status(400).json({
        success: false,
        message: "A System Owner already exists",
      });
      return;
    }

    // Step 7: Find or create organization
    let organization: Organization | null = null;

    try {
      if (organizationId) {
        organization = await organizationRepository.findOne({
          where: { id: Number(organizationId) },
        });

        if (!organization) {
          res.status(404).json({
            success: false,
            message: "Organization not found",
          });
          return;
        }
      } else {
        let defaultOrg = await organizationRepository.findOne({
          where: { name: "System Organization" },
        });

        if (!defaultOrg) {
          defaultOrg = organizationRepository.create({
            name: "System Organization",
            description: "Default organization for System Owners",
            selectedCategories: ["System"], 
            isActive: true,
          });
          
          defaultOrg = await organizationRepository.save(defaultOrg);
        }

        organization = defaultOrg;
      }
    } catch (orgError) {
      throw orgError;
    }
    
    // Step 8: Generate unique username
    const baseUsername = `${firstName} ${lastName}`.toLowerCase();
    let username = baseUsername;
    let counter = 1;

    try {
      let usernameExists = await userRepository.findOne({
        where: { username: username },
      });

      while (usernameExists) {
        username = `${baseUsername}${counter}`;
        counter++;
        
        usernameExists = await userRepository.findOne({
          where: { username: username },
        });
      }
      
    } catch (usernameError) {
      throw usernameError;
    }

    // Step 9: Generate password and hash it properly
    let password, hashedPassword;
    try {
      password = generateRandomString(12);
      console.log('Generated password:', password); // Debug log
      
      hashedPassword = await bcrypt.hash(password, 12);
      console.log('Hashed password created:', !!hashedPassword); // Debug log
    } catch (passwordError) {
      console.error('Password generation error:', passwordError);
      throw passwordError;
    }

    // Step 10: Create user object with proper password field
    let newUser;
    try {
      newUser = userRepository.create({
        username,
        email,
        hashedPassword: hashedPassword, // Make sure this is the hashed version
        role: UserRole.SYSTEM_OWNER,
        telephone,
        firstName,
        lastName,
        organization,
        isVerified: false,
        isFirstLogin: true,
        is2FAEnabled: true,
        otpAttempts: 0,
        isActive: true, // Make sure the account is active
      });

      console.log('User object created:', {
        email: newUser.email,
        hasPassword: !!newUser.hashedPassword,
        role: newUser.role
      });
    } catch (userCreateError) {
      console.error('User creation error:', userCreateError);
      throw userCreateError;
    }

    // Step 11: Save user to database
    try {
      const savedUser = await userRepository.save(newUser);
      console.log('User saved to database:', {
        id: savedUser.id,
        email: savedUser.email,
        hasPassword: !!savedUser.hashedPassword
      });
      newUser = savedUser;
    } catch (saveError) {
      console.error('User save error:', saveError);
      throw saveError;
    }

    // Step 12: Send email
    try {
      await sendLoginInstructionsEmail(
        email,
        `${firstName} ${lastName}`,
        username,
        password, // Send the plain text password in email
      );
      console.log('Email sent successfully to:', email);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't throw here - user creation was successful, email is secondary
    }

    // Step 13: Send response
    const totalTime = Date.now() - startTime;
    
    res.status(201).json({
      success: true,
      message: "System Owner created successfully. Login credentials have been sent to the provided email address.",
      data: {
        user: excludePassword(newUser),
      },
    });
  } catch (error: any) {
    console.error('Create System Owner error:', error);
    const totalTime = Date.now() - startTime;

    res.status(500).json({
      success: false,
      message: "An error occurred while creating the System Owner",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
  }
};
  
  static changeSystemOwner: ExpressHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
  
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() })
        return
      }
  
      const { firstName, lastName, email, telephone, organizationId } = req.body
  
      // Get repositories
      const userRepository = dbConnection.getRepository(User)
      const organizationRepository = dbConnection.getRepository(Organization)
      const otpTokenRepository = dbConnection.getRepository(OtpToken)
  
      // Debug: Check database connection
      if (!dbConnection.isInitialized) {
        await dbConnection.initialize()
      }
  
      // Check if email already exists (excluding the current System Owner)
      const existingUser = await userRepository.findOne({
        where: { email: email, role: UserRole.SYSTEM_OWNER },
      })
  
      if (existingUser) {
        res.status(400).json({
          message: "Email already exists for a System Owner",
        })
        return
      }
  
      // Find the existing System Owner with all relations
      const existingSystemOwner = await userRepository.findOne({
        where: { role: UserRole.SYSTEM_OWNER },
      })
  
      let oldLeaderEmail = '';
      let oldLeaderName = '';
  
      if (existingSystemOwner) {
        
        // Save existing leader's email and name for notification before removal
        oldLeaderEmail = existingSystemOwner.email;
        oldLeaderName = `${existingSystemOwner.username}`;

  
        // Remove OTP tokens
        const otpTokens = await otpTokenRepository.find({
          where: { user: { id: existingSystemOwner.id } },
        })
  
        if (otpTokens.length > 0) {
          await otpTokenRepository.remove(otpTokens)
        }

  
        // Now delete the existing System Owner
        await userRepository.remove(existingSystemOwner)
      } else {
      }
  

      // Find or create an organization for the System Owner
      let organization: Organization | null = null
  
      if (organizationId) {
        organization = await organizationRepository.findOne({
          where: { id: Number(organizationId) },
        })
  
        if (!organization) {
          res.status(404).json({
            message: "Organization not found",
          })
          return
        }
      } else {
        let defaultOrg = await organizationRepository.findOne({
          where: { name: "System Organization" },
        })
  
        if (!defaultOrg) {
          defaultOrg = organizationRepository.create({
            name: "System Organization",
            description: "Default organization for System Owners",
          })
          await organizationRepository.save(defaultOrg)
        }
  
        organization = defaultOrg
      }
  
      // Generate username
      const baseUsername = `${firstName} ${lastName}`
      let username = baseUsername
      let counter = 1
  
      let usernameExists = await userRepository.findOne({
        where: { username: username },
      })
  
      while (usernameExists) {
        username = `${baseUsername}${counter}`
        counter++
        usernameExists = await userRepository.findOne({
          where: { username: username },
        })
      }
  
      const password = generateRandomString(12)
      const hashedPassword = await bcrypt.hash(password, 12)
  
      // Create the new System Owner
// Create the new System Owner
const newSystemOwner = userRepository.create({
  username,
  email,
  hashedPassword: hashedPassword,
  role: UserRole.SYSTEM_OWNER,
  telephone,
  firstName,
  lastName,
  organization,
  isVerified: false,
  isFirstLogin: true,
  is2FAEnabled: true,
  otpAttempts: 0,
});
  
      await userRepository.save(newSystemOwner)
  
      // Send login instructions to the new leader
      await sendLoginInstructionsEmail(email, `${firstName} ${lastName}`, username, password)
  
      // Send notification email to the old System Owner if there was one
      if (oldLeaderEmail) {
        try {
          await sendChangeLeaderNotificationEmail(
            oldLeaderEmail,
            oldLeaderName,
            `${firstName} ${lastName}`
          )
        } catch (emailError) {
          // Continue even if notification email fails
        }
      }
  
      res.status(200).json({
        success: true,
        message: "System Owner changed successfully",
        data: {
          user: excludePassword(newSystemOwner),
        },
      })
    } catch (error: any) {
      res.status(500).json({
        message: "An error occurred while changing the System Owner",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      })
    }
  }
}