// @ts-nocheck
import { Repository } from "typeorm";
import { HomepageSettings } from "../entities/HomepageSettings";
import dbConnection from "../db";

export interface UpdateHomepageSettingsData {
  phone?: string;
  salesEmail?: string;
  officeAddress?: string;
  city?: string;
  country?: string;
  workingHours?: string;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

class HomepageSettingsService {
  private settingsRepository: Repository<HomepageSettings>;

  constructor() {
    this.settingsRepository = dbConnection.getRepository(HomepageSettings);
  }

  async getSettings(): Promise<ServiceResponse<HomepageSettings>> {
    try {
      let settings = await this.settingsRepository.findOne({
        where: { isActive: true },
        order: { createdAt: "DESC" }
      });

      // If no settings exist, create default ones
      if (!settings) {
        settings = this.settingsRepository.create({
          phone: "+250 788 123 456",
          salesEmail: "sales@ingata-ilbms.rw",
          officeAddress: "KG 5 Ave",
          city: "Kigali",
          country: "Rwanda",
          workingHours: "Mon-Fri, 8AM-6PM EAT",
          isActive: true
        });

        settings = await this.settingsRepository.save(settings);
      }

      return {
        success: true,
        message: "Settings retrieved successfully",
        data: settings
      };
    } catch (error: any) {
      console.error("Get settings error:", error);
      return {
        success: false,
        message: "Failed to retrieve settings",
        error: error.message
      };
    }
  }

  async updateSettings(
    data: UpdateHomepageSettingsData,
    userId?: number
  ): Promise<ServiceResponse<HomepageSettings>> {
    try {
      const currentSettings = await this.settingsRepository.findOne({
        where: { isActive: true },
        order: { createdAt: "DESC" }
      });

      if (currentSettings) {
        // Update existing settings
        Object.assign(currentSettings, data);
        currentSettings.updatedBy = userId || null;
        
        const updated = await this.settingsRepository.save(currentSettings);
        
        return {
          success: true,
          message: "Settings updated successfully",
          data: updated
        };
      } else {
        // Create new settings
        const newSettings = this.settingsRepository.create({
          ...data,
          isActive: true,
          updatedBy: userId || null
        });

        const saved = await this.settingsRepository.save(newSettings);

        return {
          success: true,
          message: "Settings created successfully",
          data: saved
        };
      }
    } catch (error: any) {
      console.error("Update settings error:", error);
      return {
        success: false,
        message: "Failed to update settings",
        error: error.message
      };
    }
  }
}

export default new HomepageSettingsService();