import type { Request, Response, NextFunction } from "express";


export const parseFormDataJSON = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      fields.forEach((field) => {
        if (req.body[field] && typeof req.body[field] === 'string') {
          try {
            req.body[field] = JSON.parse(req.body[field]);
          } catch (parseError) {
            // If parsing fails, leave as is - validation will catch it
            console.warn(`Failed to parse field "${field}":`, parseError);
          }
        }
      });
      next();
    } catch (error) {
      next(error);
    }
  };
};