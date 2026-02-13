import type { Repository } from "typeorm"
import type { BoardDirector } from "../entities/BoardDirector"
import type { SeniorManagement } from "../entities/SeniorManagement"
import type { Organization } from "../entities/Organization"
import { User, UserRole } from "../entities/User"
import * as bcrypt from "bcryptjs"
import { sendLoginInstructionsEmail } from "../templates/userInstruct"
import { generateRandomString } from "../utils/helpers"
import dbConnection from "../db"

export class ManagementService {
  private userRepository: Repository<User>

  constructor(
    private boardDirectorRepository: Repository<BoardDirector>,
    private seniorManagementRepository: Repository<SeniorManagement>,
    private organizationRepository: Repository<Organization>,
  ) {
    this.userRepository = dbConnection.getRepository(User)
  }

  async addBoardDirector(directorData: Partial<BoardDirector>, organizationId: number) {
    const organization = await this.organizationRepository.findOne({ 
      where: { id: organizationId } 
    })
    
    if (!organization) {
      throw new Error("Organization not found")
    }

    // Check for duplicate ID/Passport
    const existingById = await this.boardDirectorRepository.findOne({
      where: {
        idPassport: directorData.idPassport,
        organization: { id: organizationId }
      }
    })

    if (existingById) {
      throw new Error(`A board director with ID/Passport ${directorData.idPassport} already exists in this organization`)
    }

    // Check for duplicate email
    const existingByEmail = await this.boardDirectorRepository.findOne({
      where: {
        email: directorData.email,
        organization: { id: organizationId }
      }
    })

    if (existingByEmail) {
      throw new Error(`A board director with email ${directorData.email} already exists in this organization`)
    }

    // Create board director
    const director = this.boardDirectorRepository.create({
      ...directorData,
      organization,
    })

    const savedDirector = await this.boardDirectorRepository.save(director)

    // ✅ FIXED: AUTO-CREATE BOARD_DIRECTOR USER (not MANAGER)
    try {
      // Generate random password
      const password = generateRandomString(12)
      const hashedPassword = await bcrypt.hash(password, 12)

      // ✅ FIXED: Create user with BOARD_DIRECTOR role
      const boardDirectorUser = this.userRepository.create({
        username: directorData.name || directorData.email!.split('@')[0],
        email: directorData.email!,
        hashedPassword: hashedPassword,
        role: UserRole.BOARD_DIRECTOR, // ✅ CORRECT ROLE
        organizationId: organizationId,
        phone: directorData.phone || null,
        isActive: true,
        isVerified: true,
        isFirstLogin: true,
      })

      await this.userRepository.save(boardDirectorUser)

      // Send login instructions email
      await sendLoginInstructionsEmail(
        directorData.email!,
        directorData.name!,
        directorData.name || directorData.email!.split('@')[0],
        password
      )

      console.log(`✅ Board Director user created with role: board_director - ${directorData.email}`)
    } catch (userError: any) {
      console.error('Failed to create board director user:', userError)
      // Don't fail the entire operation if user creation fails
      // The director is already saved, we just log the error
    }

    return savedDirector
  }

  async addSeniorManagement(managementData: Partial<SeniorManagement>, organizationId: number) {
    const organization = await this.organizationRepository.findOne({ 
      where: { id: organizationId } 
    })
    
    if (!organization) {
      throw new Error("Organization not found")
    }

    // Check for duplicate email
    const existingByEmail = await this.seniorManagementRepository.findOne({
      where: {
        email: managementData.email,
        organization: { id: organizationId }
      }
    })

    if (existingByEmail) {
      throw new Error(`A senior manager with email ${managementData.email} already exists in this organization`)
    }

    // Create senior management
    const management = this.seniorManagementRepository.create({
      ...managementData,
      organization,
    })

    const savedManagement = await this.seniorManagementRepository.save(management)

    // ✅ FIXED: AUTO-CREATE SENIOR_MANAGER USER (not MANAGER)
    try {
      // Generate random password
      const password = generateRandomString(12)
      const hashedPassword = await bcrypt.hash(password, 12)

      // ✅ FIXED: Create user with SENIOR_MANAGER role
      const seniorManagerUser = this.userRepository.create({
        username: managementData.name || managementData.email!.split('@')[0],
        email: managementData.email!,
        hashedPassword: hashedPassword,
        role: UserRole.SENIOR_MANAGER, // ✅ CORRECT ROLE
        organizationId: organizationId,
        phone: managementData.phone || null,
        isActive: true,
        isVerified: true,
        isFirstLogin: true,
      })

      await this.userRepository.save(seniorManagerUser)

      // Send login instructions email
      await sendLoginInstructionsEmail(
        managementData.email!,
        managementData.name!,
        managementData.name || managementData.email!.split('@')[0],
        password
      )

      console.log(`✅ Senior Manager user created with role: senior_manager - ${managementData.email}`)
    } catch (userError: any) {
      console.error('Failed to create senior manager user:', userError)
      // Don't fail the entire operation if user creation fails
    }

    return savedManagement
  }

  async getBoardDirectors(organizationId: number) {
    return await this.boardDirectorRepository.find({
      where: { organization: { id: organizationId } },
    })
  }

  async getSeniorManagement(organizationId: number) {
    return await this.seniorManagementRepository.find({
      where: { organization: { id: organizationId } },
    })
  }

  async updateBoardDirector(id: number, updateData: Partial<BoardDirector>) {
    const director = await this.boardDirectorRepository.findOne({ where: { id } })
    if (!director) {
      throw new Error("Board director not found")
    }

    Object.assign(director, updateData)
    return await this.boardDirectorRepository.save(director)
  }

  async updateSeniorManagement(id: number, updateData: Partial<SeniorManagement>) {
    const management = await this.seniorManagementRepository.findOne({ where: { id } })
    if (!management) {
      throw new Error("Senior management not found")
    }

    Object.assign(management, updateData)
    return await this.seniorManagementRepository.save(management)
  }

  async deleteBoardDirector(id: number) {
    return await this.boardDirectorRepository.delete(id)
  }

  async deleteSeniorManagement(id: number) {
    return await this.seniorManagementRepository.delete(id)
  }

  async getManagementTeam(organizationId: number) {
    const boardDirectors = await this.getBoardDirectors(organizationId)
    const seniorManagement = await this.getSeniorManagement(organizationId)

    return {
      boardDirectors,
      seniorManagement,
    }
  }

  async extendBoardDirector(
    directorId: number, 
    organizationId: number, 
    extendedData: {
      accountNumber?: string;
      salutation?: string;
      surname?: string;
      forename1?: string;
      forename2?: string;
      forename3?: string;
      nationalIdNumber?: string;
      passportNo?: string;
      dateOfBirth?: Date;
      placeOfBirth?: string;
      postalAddressLine1?: string;
      postalCode?: string;
      town?: string;
    }
  ) {
    const director = await this.boardDirectorRepository.findOne({
      where: {
        id: directorId,
        organization: { id: organizationId }
      }
    })

    if (!director) {
      throw new Error("Board director not found")
    }

    // Check for duplicate account number if provided
    if (extendedData.accountNumber) {
      const existingByAccountNumber = await this.boardDirectorRepository.findOne({
        where: {
          accountNumber: extendedData.accountNumber,
          organization: { id: organizationId }
        }
      })

      if (existingByAccountNumber && existingByAccountNumber.id !== directorId) {
        throw new Error(`A board director with account number ${extendedData.accountNumber} already exists in this organization`)
      }
    }

    // Update with extended data
    Object.assign(director, extendedData)

    const updatedDirector = await this.boardDirectorRepository.save(director)

    return updatedDirector
  }
}
